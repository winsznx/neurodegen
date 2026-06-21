# NeuroDegen Committee

**Track 2 submission. A Claude Code Skill, packaged as a directory.** Drop it
into `~/.claude/skills/` and invoke `/neurodegen` to run one cycle on the
current CoinMarketCap tape.

## What it is

Most retail crypto strategies are one indicator dressed up: RSI plus MACD with
a sentiment garnish. The same indicator means different things in different
tape conditions, so they break exactly when you need them.

NeuroDegen Committee conditions every decision on a regime first, then runs two
independent analysts whose disagreement is itself a signal:

1. **Regime classifier.** Reads Fear and Greed, funding rates, and the count of
   surging tokens. Labels the tape **quiet** (no trades), **active** (selective
   half size), **momentum** (full size on KOL-hot names), or **volatile** (tiny
   defensive sizes, sticky for 2 minutes after exit).
2. **Two analysts in parallel.** A narrative analyst (CMC trending narratives +
   news + KOL velocity) and a quant analyst (quotes + funding + liquidity)
   independently propose `{direction, confidence, tokens}`.
3. **Dissent tracker.** Same direction means full size. One side neutral cuts
   it in half. Bull vs bear forces a hold.
4. **Risk gate.** Confidence floor, dissent floor, liquidity gate, funding
   warning, candidate intersection with the allowlist.
5. **Size formula.** `100 USD x regime x dissent x mandate x drawdown`, capped
   at $200 per position and 80 percent of equity.

The differentiator vs RSI + MACD:

- The committee turns an LLM hallucination into an explicit disagreement
  signal that **shrinks** size rather than producing false confidence.
- The regime gate prevents the strategy from ever firing in conditions where
  its edge is known to be zero (quiet) or negative (volatile without
  cooldown).

## Install

```bash
git clone https://github.com/<org>/neurodegen-committee.git
cp -r neurodegen-committee/skills/neurodegen-committee ~/.claude/skills/
```

Now in Claude Code:

- `/neurodegen` runs one cycle.
- `/neurodegen check now` prints a verbose transcript (see
  `examples/live-invocation.md`).
- `what's the regime` prints only the regime step.

The Skill calls the seven CMC MCP tools listed in `skills/neurodegen-committee/SKILL.md`.

## Files

```
neurodegen-committee/
  README.md                          this file
  LICENSE                            MIT
  package.json                       pnpm/npm scripts
  tsconfig.json                      strict TS config
  backtest.ts                        runnable backtest CLI

  skills/neurodegen-committee/
    SKILL.md                         the Skill manifest (YAML frontmatter + workflow)

  prompts/
    narrative-analyst.md             system prompt for analyst A
    quant-analyst.md                 system prompt for analyst B
    risk-classifier.md               system prompt for the must-hold gate

  src/
    types.ts                         all shared types (self-contained)
    config.ts                        thresholds, multipliers, caps
    regime.ts                        classifyRegime + sticky-volatile state
    dissent.ts                       computeDissent
    sizing.ts                        sizePosition + sizing math
    risk.ts                          drawdownBand + checkRiskCaps
    cmcClient.ts                     thin wrapper around the 7 CMC tools
    committee.ts                     orchestrator (the entry point)

  backtest/
    harness.ts                       bar-replay engine
    report.ts                        Sharpe, win rate, hold duration
    fixtures/bsc-2025-q4.json        sample fixture (extend with real captures)
    llm-cache.json                   deterministic analyst outputs per bar

  examples/
    live-invocation.md               sample /neurodegen transcript
    sample-output.json               full Decision Record from one bar
```

## How to run the backtest

```bash
cd neurodegen-committee
pnpm install
pnpm run backtest
```

Sample output:

```
Replaying 12 bars from 2025-09-22T00:00:00Z to 2025-09-22T01:00:00Z

=== NeuroDegen Committee Backtest ===
Total return: ...%
Net return:   ...%
Sharpe:       ...
Max drawdown: ...%
Win rate:     ...%
Avg win:      $...
Avg loss:     $...
Avg hold:     ... min
Trades:       ...
By regime:    {"momentum":...,"active":...}
Hold rate:    {"quiet":1.0,"active":...,"momentum":...,"volatile":...}
```

`pnpm run backtest -- --out run.json` writes the full run (every decision +
every trade) to `run.json` for inspection.

To run against your own data:

```bash
pnpm run backtest -- --fixture path/to/myFixture.json --cache path/to/myCache.json
```

The fixture and cache schemas are documented in `backtest/harness.ts`. The
sample fixture exercises all four regimes (quiet, active, momentum, volatile)
in 12 bars so the harness path is tested end to end. To run the full 90-day
protocol from the spec, capture a longer fixture from the same seven CMC
tools and record an LLM cache once via your own recorder script.

## Backtest protocol (full)

Per spec section 6:

- Window: 2025-09-22 to 2025-12-21 (90 days), 5-minute bars.
- Initial capital: $1,000. Base position $100. Mandate moderate.
- Fees 0.1% per side, slippage 0.5%, x402 cost reported separately ($0 in the
  backtest).
- Metrics: total return (gross and net), Sharpe (5-min returns, annualized),
  max drawdown, win rate, avg win, avg loss, avg hold duration, trades per
  regime, hold rate per regime.
- Baselines: buy-and-hold BNB, buy-and-hold BTC, RSI(14) on BNB, random entry
  with the same sizing and exits.
- **Pass bar**: Sharpe > BNB-HODL Sharpe AND max drawdown < 25%.

## Decision Record schema

Every cycle emits one JSON object (see `examples/sample-output.json` for a full
worked example):

| Field | Type | Notes |
|---|---|---|
| `schemaVersion` | `"0.1.0"` | |
| `timestampMs` | number | |
| `regime` | `quiet \| active \| momentum \| volatile` | |
| `previousRegime` | same \| null | |
| `regimeRationale` | string | |
| `narrative` | object | full Narrative Analyst output |
| `quant` | object | full Quant Analyst output |
| `dissent` | object | severity, modifier, rationale |
| `action` | `open_long \| close_position \| adjust_parameters \| hold` | |
| `targetToken` | string \| null | from the allowlist |
| `sizeUsd` | number | final USD size after all multipliers and caps |
| `sizing` | object | breakdown of every multiplier |
| `riskBand` | object | drawdown band, size mult, entries-blocked |
| `mustHoldReasons` | string[] | empty when the Skill opens a position |
| `rationale` | string | one-line summary |

## Worked example

Given the bar at `timestampMs=1758499800000` in
`backtest/fixtures/bsc-2025-q4.json` and the corresponding entries in
`backtest/llm-cache.json`, with `equity=$1000`, `currentExposureUsd=0`,
`drawdownPct=0`, `mandate="moderate"`, the Skill outputs **exactly** the
record in `examples/sample-output.json`:

- regime: `momentum` (F&G 65 in [60,85], surge 4, two KOL-hot tokens above
  velocity 5/h).
- narrative: bullish @ 0.70, topThesis BNB.
- quant: bullish @ mean(0.7, 0.6, 0.7) = 0.67, recommendedToken BNB,
  liquidityAdequate true, fundingRateWarning false.
- dissent: none (both bullish), modifier 1.0.
- size: 100 USD x 1.0 x 1.0 x 1.0 x 1.0 = 100 USD. No cap hit.
- action: `open_long`, targetToken BNB.

A judge can reproduce by running `pnpm run backtest -- --out run.json` and
inspecting `run.decisions[2]`.

## License

MIT.
