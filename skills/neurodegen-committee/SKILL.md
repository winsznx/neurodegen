---
name: neurodegen-committee
description: |
  Regime-conditioned two-analyst committee for BSC spot trading. Classifies tape
  state from F&G + funding + surge count, runs narrative vs quant analysts,
  sizes by dissent, gates by risk. Outputs a backtestable decision record.
  Trigger: "/neurodegen", "run committee", "what's the regime"
license: MIT
compatibility: ">=1.0.0"
user-invocable: true
allowed-tools:
  - mcp__cmc-mcp__get_crypto_quotes_latest
  - mcp__cmc-mcp__get_global_metrics_latest
  - mcp__cmc-mcp__get_global_crypto_derivatives_metrics
  - mcp__cmc-mcp__trending_crypto_narratives
  - mcp__cmc-mcp__get_crypto_latest_news
  - mcp__cmc-mcp__get_crypto_metrics
  - mcp__cmc-mcp__search_crypto_info
---

# NeuroDegen Committee

A regime-conditioned, two-analyst trading committee for BSC spot. The Skill is a
deterministic pipeline:

1. Pull a market snapshot from CMC (seven tools, listed above).
2. Classify the regime: quiet, active, momentum, or volatile.
3. If regime is quiet, exit immediately. Otherwise run two analysts in parallel.
4. Compute dissent between the analysts.
5. Apply size formula = base x regime x dissent x mandate, clamp to risk caps.
6. Emit a single Decision Record (JSON).

## Invocation

- "/neurodegen" runs one cycle on the current tape.
- "/neurodegen check now" same as above with a verbose transcript.
- "what's the regime" prints just the regime classification step.

## Workflow

### Step 1: Snapshot

Call these CMC tools in parallel:

| Tool | Argument | Field used |
|---|---|---|
| `get_crypto_quotes_latest` | the allowlist symbols (BNB, CAKE, ETH, BTCB, plus other top-50 BSC by 24h volume) | price, percentChange1h, volume24hUSD |
| `get_global_metrics_latest` | none | fearGreedValue, fearGreedLabel |
| `get_global_crypto_derivatives_metrics` | none | per-pair fundingRate, openInterest |
| `trending_crypto_narratives` | none | narrative tags, strength |
| `get_crypto_latest_news` | none | title, sentiment |
| `get_crypto_metrics` (premium) | top movers symbols | kolMentionCount, velocityPerHour, sentimentDirection |
| `search_crypto_info` (premium fallback) | top movers symbols | liquidityUSD, security score |

The two premium calls are EV-gated: if estimated cost > expected edge, skip
them. Without KOL data, the momentum regime is unreachable. Without liquidity
data, the `liquidityAdequate` flag defaults to false and the cycle holds.

### Step 2: Regime classification

Priority order. First match wins.

1. **volatile** if `fearGreedValue < 25` OR `> 85` OR any `|fundingRateAnnualized| > 0.001`. Sticky 120s after the volatile trigger clears.
2. **momentum** if `activeSurgeTokens >= 4` AND `60 <= fearGreedValue <= 85` AND at least 2 tokens with `velocityPerHour >= 5`.
3. **active** if `activeSurgeTokens >= 3` AND `40 <= fearGreedValue <= 70`.
4. **quiet** otherwise.

`activeSurgeTokens` = count of allowlist tokens with `|percentChange1h| >= 5`.

### Step 3: Analysts (parallel)

Run the two prompts in `prompts/narrative-analyst.md` and `prompts/quant-analyst.md`. Each returns:

```json
{ "direction": "bullish|bearish|neutral", "confidence": 0.0, "tokens": ["..."] }
```

The narrative analyst gets trending narratives, news, KOL activity, and the F&G
index. The quant analyst gets quotes, funding rates, liquidity, and the surge
count.

### Step 4: Dissent

| Narrative | Quant | Severity | Modifier |
|---|---|---|---|
| same direction | same | none | 1.0 |
| directional | neutral | mild | 0.5 |
| bull | bear | strong | 0.0 |

### Step 5: Risk gate (must-hold rules)

Hold MUST if any of:

- `min(narrative.confidence, quant.confidence) < 0.3`
- dissent severity == strong
- `liquidityAdequate == false`
- candidate set intersected with allowlist is empty
- `fundingRateWarning` AND narrative confidence <= 0.7

### Step 6: Candidate selection

First non-empty of:

1. `KOL-hot tokens` intersected with `narrative.tokens` intersected with `quant.tokens`
2. `narrative.tokens` intersected with `quant.tokens`
3. `quant.tokens`

Action is `open_long` on the first candidate. The v0.1 Skill is spot-only; no
shorts.

### Step 7: Sizing

```
size = 100 USD
     * regimeMult     (quiet=0, active=0.5, momentum=1.0, volatile=0.1)
     * dissentMult    (aligned=1.0, one-neutral=0.5, opposed=0.0)
     * mandateMult    (conservative=0.5, moderate=1.0, aggressive=1.5)
clamp size <= 200 USD
clamp total exposure <= 0.8 * equity
if size <= 0.01 USD -> hold
```

### Step 8: Exit (for open positions)

Exit on the first of:

- TP / SL hit (active 3% / 2%, momentum 5% / 3%, volatile 2% / 1.5%)
- Max hold = 4 hours
- Regime transitions to quiet or volatile (close all)
- Committee flips: new bar produces opposed direction at confidence >= 0.5
- Risk manager band crossed (see Step 9)

### Step 9: Risk manager

Drawdown ladder. Caps enforced BEFORE the sizing math above.

| Band | Drawdown | Action |
|---|---|---|
| alert | >= 15% | size x 0.5 |
| defensive | >= 20% | close-only |
| halt | >= 25% | reject new |
| disqualified | >= 30% | stop |

Plus hard caps: max 5 concurrent positions, per-position <= $200, daily loss
<= $50.

## Output

A single JSON Decision Record. See `examples/sample-output.json` for the
shape.

## Reproducing the backtest

See `backtest.ts` and `README.md`. The backtest is deterministic given a
fixtures file and an llm-cache.

