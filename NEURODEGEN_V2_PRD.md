# NEURODEGEN_V2_PRD.md

**Version:** 2.0.0
**Date:** June 7, 2026
**Authors:** Winszn (architecture), TheWeirdDee (collaborator)
**Status:** Source of truth. All downstream agents defer to this document.
**Predecessor:** NEURODEGEN_MASTER.md v1.0.0 (Four.meme AI Sprint, DGrid 1st place)
**Audit reference:** NEURODEGEN_V1_AUDIT.md (must be read before any phase begins)

---

## 1. PROJECT IDENTITY

### 1.1 Name and positioning

NeuroDegen V2. An autonomous on-chain investment committee for BNB Chain. Three LLM analysts deliberate over CMC signal data and produce a structured action recommendation. TWAK signs every trade with self-custody preserved. Every decision is committed to the BSC attestation contract before execution and revealed after confirmation.

The product is not a black-box trading bot. The deliberation is the product. The trades are demonstrations of the deliberation working end-to-end under real conditions.

### 1.2 Target prizes

Three submissions, three lanes:

**Track 1 — Autonomous Trading Agents.** Live PnL competition, June 22–28. Top 5 placement targeted ($10K, $6K, $4K, $2K, $2K). Goal: survive the drawdown cap with positive return. Not maximum PnL at blowup risk.

**Best Use of Trust Wallet Agent Kit ($2K, discretionary panel).** TWAK is the sole execution layer. Self-custody preserved end-to-end. x402 used as an economic variable through the EV gate. Three TWAK surfaces consumed: agent wallet mode, x402 serve, portfolio monitoring.

**Best Use of CoinMarketCap Agent Hub ($2K, discretionary panel).** CMC Hub is the data foundation. Eight to twelve MCP tools consumed. x402 used for premium signals. EV gate makes every x402 purchase an explicit economic decision logged in the CommitteeSession record.

**Bonus — Track 2 Strategy Skills ($1K-$3K placement, $6K pool).** The cognition layer is repackaged as a standalone CMC Skill and submitted to Track 2. Same code, parallel submission. No incremental architecture work.

### 1.3 Honest scope

NeuroDegen V2 does not claim alpha. It claims auditability, survivability under a hard drawdown cap, and demonstrable use of the official hackathon stack at depth.

Live trading goal during the week of June 22–28: end positive, do not hit 30% drawdown, maintain the 1-trade-per-day compliance floor, generate a reasoning trail that judges can verify on BscScan.

### 1.4 Non-goals

- No claim of positive expected value, Sharpe ratio, or alpha
- No custody of user funds
- No third-party deposits
- No leverage trading in V2.0.0 (spot only; perp feature-flagged for V2.1)
- No NLP mandate parsing in V2.0.0 (form-based config; NLP feature-flagged for V2.1)
- No Telegram bot in V2.0.0 (dashboard-only; Telegram for V2.1)
- No chains other than BSC mainnet for trading
- No fine-tuning or training. Inference only.

---

## 2. WHAT CARRIES FORWARD FROM V1

### 2.1 V1 audit findings that shape V2

The V1 audit revealed that several components were structurally complete but functionally untested:

| V1 component | Audit finding | V2 treatment |
|---|---|---|
| AttestationEmitter contract | Deployed on BSC mainnet, verified, events confirmed | Reused verbatim. No redeploy. |
| ReasoningGraph type schema | Working in storage, untested under load | Extended (CommitteeSession), schema validated by Zod in V2 |
| RegimeClassifier | `previousRegime` never updated, volatile detection effectively dead | Rewritten. 4-state machine with verified transition logging |
| PreExecutionChecker | Six checks scaffolded, never ran during V1 execution | Rewritten. Eight checks total. Each individually unit-tested |
| RiskManager | Config defined, logic untested | Rewritten with mandate-driven config and drawdown ladder |
| MYXOrderBuilder | Build path worked. 7 increase orders landed on BSC mainnet on 2026-04-23 (verified receipts, sender = agent wallet, to = MYX router). The bug was on the return path: `transactionSubmitter.ts:43-48` hard-coded `orderId: null` and `positionTracker.ts:65-72` was rewritten in commit `442e474` to skip SDK polling and mark positions `managed` immediately. | Replaced by TWAK execution layer. V2 builds a robust lifecycle-recovery layer that derives state from on-chain truth, not local DB optimism. |
| TransactionSubmitter | Feature flags `ENABLE_EXECUTION=true` + `DRY_RUN_MODE=false` were flipped on 2026-04-23 and real trades submitted. The flags worked. What broke was the lifecycle return path: no fills written back, no `exit_tx_hash`, `realized_pnl_usd` NULL on every one of the 6 closed positions in production. | Replaced by TWAK. V2 PositionTracker reconciles to on-chain TWAK portfolio state on every poll, not just at boot. |
| Pyth integration | Scaffolded; VAA parsing incomplete | Retained for oracle divergence check only |
| Pieverse skill wrapper | Real on-chain pieUSD payment verification (no mock), but proofs were replayable and the `monitor` command was a costume — accepted payment for an idempotent `agentLoop.start()` that delivered nothing scoped to the payer. | Removed. Not relevant for this hackathon stack. |
| Privy copy-trade layer | Scaffolding that consistently fails at the signing boundary. Session signers granted on 2/3 production subscriptions. Signing chain runs end-to-end and reverts on-chain with `NotOrderOwner` because the on-chain owner is the agent wallet, not the user wallet. Silenced as `privy_signing_mismatch` in `mirrorDispatcher.ts:77-79`. 0/3 successful mirrors in production. | Removed from V2 entirely. If revisited in V2.1+, the `NotOrderOwner` revert is the first thing to fix. |
| Bitquery client | Working but Four.meme-specific | Replaced by CMC Hub client |
| MYX REST client | Working but venue-specific | Replaced by CMC Hub + TWAK |
| HotStateStore | Functional with TTL eviction | Reused verbatim |
| ColdStorageWriter | Functional with batched writes | Reused verbatim |
| Next.js scaffold | All routes, layout, SSE working | Reused. Route changes for V2 surfaces only |
| Supabase schema | Tables exist, RLS configured | Reused. New tables for committee_sessions |

### 2.2 What V2 builds from scratch

- `cmcHubClient.ts` — replaces Bitquery, Pyth (partial), MYX REST
- `twakClient.ts` — replaces MYXOrderBuilder, TransactionSubmitter
- `evGate.ts` — new economic decision layer before x402 purchases
- `dissentTracker.ts` — new cross-analyst disagreement detection
- `backtestRunner.ts` — new historical replay with cached LLM outputs
- `probeTradeScheduler.ts` — new compliance-floor enforcement
- `mandateConfig.ts` — form-based config, not NLP
- `allowedTokens.ts` — 149-token competition allowlist

### 2.3 What V2 keeps verbatim

- AttestationEmitter contract address and ABI
- Four-layer architecture pattern (Perception → Cognition → Execution → Monetization)
- HotStateStore in-memory class
- ColdStorageWriter batched-write pattern
- Next.js App Router structure
- Supabase query function pattern (`lib/queries/*.ts`)
- SSE streaming endpoint pattern
- OG image route pattern (`/api/og/*`)
- Tailwind v4 design tokens from V1
- ESLint + Prettier + TypeScript strict config

---

## 3. SYSTEM ARCHITECTURE

### 3.1 Four-layer model

Data flows in one direction. No layer calls backwards.

```
PERCEPTION   — CMC Hub MCP + x402 with EV gate, Pyth for divergence
COGNITION    — Three-member investment committee with dissent tracking
EXECUTION    — TWAK self-custody signing + AttestationEmitter
MONETIZATION — x402 serve endpoint + public dashboard + journal
```

### 3.2 End-to-end loop

```
1. Perception polls CMC Hub free tier every 60s. Normalizes events. Updates HotStateStore.
2. RegimeClassifier reads aggregate metrics. If regime is quiet, agent hibernates (probe trade only).
3. If regime is active/momentum/volatile, EV gate evaluates whether to purchase premium CMC data via x402.
4. Committee runs: Narrative (Claude) + Quant (GPT-4o) in parallel, then Risk (Llama) sequentially.
5. DissentTracker compares Narrative and Quant outputs. Mild dissent halves position size. Strong dissent forces hold.
6. ActionRecommendation produced. PreExecutionChecker runs eight checks.
7. RiskManager validates against mandate config and current drawdown state.
8. AttestationEmitter commits reasoningHash to BSC mainnet BEFORE TWAK call.
9. TWAK signs and submits the spot swap. Returns tx hash.
10. AttestationEmitter reveals execution: links reasoningHash to txHash on BSC.
11. PositionTracker polls TWAK portfolio endpoint every 30s for state transitions.
12. CommitteeSession record persists to Supabase. SSE streams update to dashboard.
13. ProbeTradeScheduler ensures 1-trade-per-day compliance.
```

---

## 4. PERCEPTION LAYER

### 4.1 CMC Hub MCP integration

Connection:

```typescript
const CMC_MCP_ENDPOINT = 'https://mcp.coinmarketcap.com/mcp';
const CMC_X402_ENDPOINT = 'https://mcp.coinmarketcap.com/x402/mcp';
```

MCP uses CMC Pro API key (free tier). x402 endpoint uses USDC on Base ($0.01 per request).

### 4.2 Tools consumed

**Phase 0 verification (2026-06-16):** The CMC MCP server at `https://mcp.coinmarketcap.com/mcp` exposes exactly **12 tools**, none of which are DEX-specific. DEX liquidity + security endpoints live in CMC's paid REST DEX API (`/v4/dex/*`), not in the MCP server. KOL-per-mention signals are not exposed at all; the nearest MCP surface is `trending_crypto_narratives` (narrative-level momentum). The functional table below maps PRD intent to verified reality.

**Tool consumption count:** `cmcHubClient.ts` exposes all 12 MCP tools as typed methods so any phase can call any one of them. The Perception layer's normal-operation cadence routinely invokes 10 of them — quotes, search, info, technical analysis, metrics, global metrics, derivatives, trending narratives, macro events, news. `get_crypto_marketcap_technical_analysis` and `search_crypto_info` are exposed for ad-hoc cognition queries (e.g. a /me-style explainer) but are not on a polling schedule. The Best CMC Hub Special Prize claim is 10 tools in routine use; 12 in the exposed surface.

| Function | Verified MCP tool / source | Frequency | Transport |
|---|---|---|---|
| Latest price quotes for tracked tokens | `get_crypto_quotes_latest` | 60s | MCP (free tier) |
| Cryptocurrency search by symbol/name | `search_cryptos` | On demand | MCP (free tier) |
| Per-token metadata + holder distribution | `get_crypto_info` + `get_crypto_metrics` | 5min | MCP (free tier) |
| Technical indicators (RSI, MACD, SMA, EMA) | `get_crypto_technical_analysis` | EV gate pass | MCP (free tier) |
| Global metrics (F&G, dominance, leverage) | `get_global_metrics_latest` | 5min | MCP (free tier) |
| Derivatives metrics (funding rates aggregate) | `get_global_crypto_derivatives_metrics` | Per session | MCP (free tier) |
| Trending narratives + social momentum | `trending_crypto_narratives` | Per session | MCP (free tier) |
| Macro events influencing markets | `get_upcoming_macro_events` | Hourly | MCP (free tier) |
| News headlines and sentiment | `get_crypto_latest_news` | Per session | MCP (free tier) |
| Semantic search across crypto whitepapers/docs | `search_crypto_info` | On demand | MCP (free tier) |
| DEX liquidity depth for candidate token | **On-chain via viem** — read PancakeSwap V2/V3 pair reserves directly | Pre-execution | viem `eth_call` (no third-party) |
| Security score for candidate token | **On-chain heuristic** — contract age, deployer reputation, top-holder concentration, owner-mint flag via ERC20 + bytecode inspection | Pre-execution | viem `eth_call` (no third-party) |

**Why on-chain instead of CMC DEX REST for the last two rows:** The CMC DEX `/v4/dex/security/detail` and `/v4/dex/liquidity/*` endpoints require a paid CMC subscription tier (Standard/Professional, ~$30+/mo). Reading PancakeSwap pair reserves directly via viem gives the same data deterministically, costs nothing, and strengthens the "fully verifiable, no third-party trust" demo angle. The CMC Special Prize claim is supported by 10 MCP tools consumed, which exceeds the 8-tool minimum from the prize requirements.

**x402 transport status:** The official CMC docs reference a `/x402/mcp` endpoint that accepts `0.01 USDC` payments per call as an alternative to API-key auth. Phase 0 was unable to test the x402 endpoint directly (returned 405 to GET, MCP-over-HTTP requires JSON-RPC POST with `initialize` handshake). V2 implements x402 transport as a parallel path for any of the 10 MCP tools when the user runs without a CMC Pro API key; the EV gate still applies and gates the call regardless of transport. Implementation deferred to Phase 2 client work.

### 4.3 EV gate

Before any x402 call, the EV gate computes whether the data is worth the cost.

```typescript
interface EVDecision {
  shouldFetchPremium: boolean;
  projectedAlphaUSD: number;
  x402CostUSDC: number;        // always 0.01
  gasCostUSD: number;          // estimated from current BNB price
  evRatio: number;             // projectedAlphaUSD / (x402CostUSDC + gasCostUSD)
  rationale: string;
  triggeringSignal: string;    // which free-tier signal triggered evaluation
  thresholdUsed: number;       // EV_THRESHOLD at time of decision (default 3.0)
}
```

Logic:

```
basePosition = config.AGENT_BASE_POSITION_SIZE_USD
regimeMultiplier = regime.positionSizeMultiplier  // 0.5 quiet, 1.0 active, 1.5 momentum
projectedAlphaUSD = basePosition * regimeMultiplier * signalMagnitude * baseConfidence
totalCost = x402CostUSDC + gasCostUSD
evRatio = projectedAlphaUSD / totalCost

if (evRatio >= EV_THRESHOLD) fetch premium data
else skip premium, proceed with free-tier signals
```

Default `EV_THRESHOLD = 3.0` and `baseConfidence = 0.5`. Both live in `config/perception.ts`.

Every EV decision is logged to `committee_sessions.ev_gate_decisions` (jsonb array). Counted toward `x402_spend_usdc` only when `shouldFetchPremium = true`.

### 4.4 Pyth retained for one purpose

Pyth Hermes is retained for oracle divergence check only. Before TWAK executes a trade, the agent fetches the Pyth price for the target asset and compares to the CMC price. If `abs(cmcPrice - pythPrice) / pythPrice > 0.005`, the trade is blocked. This is the only V2 use of Pyth.

### 4.5 Event types

```typescript
type RegimeLabel = 'quiet' | 'active' | 'momentum' | 'volatile';

interface BaseEvent {
  eventId: string;
  source: 'cmc_hub' | 'pyth' | 'twak';
  timestamp: number;
}

interface CMCQuoteEvent extends BaseEvent {
  source: 'cmc_hub';
  eventType: 'quote_update';
  tokenSymbol: string;
  tokenAddress: `0x${string}`;
  priceUSD: number;
  volume24hUSD: number;
  percentChange1h: number;
  percentChange24h: number;
  marketCapUSD: number;
  cmcRank: number;
}

interface CMCFearGreedEvent extends BaseEvent {
  source: 'cmc_hub';
  eventType: 'fear_greed_update';
  value: number;             // 0-100
  label: 'extreme_fear' | 'fear' | 'neutral' | 'greed' | 'extreme_greed';
}

interface CMCSocialEvent extends BaseEvent {
  source: 'cmc_hub';
  eventType: 'social_signal';
  tokenSymbol: string;
  kolMentionCount: number;
  velocityPerHour: number;
  sentimentDirection: 'positive' | 'negative' | 'neutral';
}

interface CMCFundingEvent extends BaseEvent {
  source: 'cmc_hub';
  eventType: 'funding_rate_update';
  pair: string;
  fundingRateAnnualized: number;
  direction: 'rising' | 'falling' | 'stable';
}

interface CMCLiquidityEvent extends BaseEvent {
  source: 'cmc_hub';
  eventType: 'dex_liquidity_snapshot';
  tokenSymbol: string;
  pairAddress: `0x${string}`;
  liquidityUSD: number;
  volume24hUSD: number;
  priceImpact1kUSD: number;
}

interface CMCSecurityEvent extends BaseEvent {
  source: 'cmc_hub';
  eventType: 'security_check';
  tokenAddress: `0x${string}`;
  isHoneypot: boolean;
  ownerCanMint: boolean;
  riskScore: number;          // 0-100, higher = riskier
  flags: string[];
}

interface PythDivergenceEvent extends BaseEvent {
  source: 'pyth';
  eventType: 'divergence_check';
  tokenSymbol: string;
  cmcPriceUSD: number;
  pythPriceUSD: number;
  divergencePercent: number;
}

type PerceptionEvent =
  | CMCQuoteEvent | CMCFearGreedEvent | CMCSocialEvent
  | CMCFundingEvent | CMCLiquidityEvent | CMCSecurityEvent
  | PythDivergenceEvent;
```

### 4.6 AggregateMetrics

```typescript
interface AggregateMetrics {
  computedAt: number;
  regime: RegimeLabel;
  fearGreedValue: number;
  fearGreedLabel: string;
  topMoversByVolume: Array<{
    symbol: string;
    address: `0x${string}`;
    percentChange1h: number;
    volume24hUSD: number;
  }>;
  kolActivityByToken: Record<string, {
    mentionCount: number;
    velocityPerHour: number;
    sentimentDirection: 'positive' | 'negative' | 'neutral';
  }>;
  fundingRatesByPair: Record<string, {
    rateAnnualized: number;
    direction: 'rising' | 'falling' | 'stable';
  }>;
  marketLiquidityScore: number;   // 0-1, derived from average liquidity across tracked tokens
  activeSurgeTokens: number;      // count of tokens with >5% 1h move
  x402SpendSessionUSDC: number;
  x402SpendDailyUSDC: number;
}
```

### 4.7 RegimeClassifier (4-state)

Evaluated every 60 seconds. Transitions log to `events` table and trigger SSE update. The `previousRegime` field is correctly tracked this time.

| Regime | Detection | Position multiplier | Max leverage | TP% | SL% | Cooldown |
|---|---|---|---|---|---|---|
| quiet | F&G 40-60 AND surgeTokens < 3 AND no KOL velocity spikes | 0 (hibernate, probe-only) | 1x | n/a | n/a | n/a |
| active | F&G 40-70 AND surgeTokens 3-5 | 0.5x | 1x | 3% | 2% | 15 min |
| momentum | F&G 60-85 AND surgeTokens >= 4 AND KOL velocity > 5/hr on at least 2 tokens | 1.0x | 1x | 5% | 3% | 10 min |
| volatile | F&G < 25 OR F&G > 85 OR funding rate spike (>0.1% per 8h on any pair) OR held position -5% in 30min | 0.1x (defensive, probe-only) | 1x | 2% | 1.5% | 60 min |

Volatile exit: F&G recovers to 30-80 AND funding rates normalize AND no active drawdown trigger. Minimum 120 seconds of recovered state before transitioning out.

---

## 5. COGNITION LAYER — INVESTMENT COMMITTEE

### 5.1 Members and routing

| Member | Model ID | Endpoint | Primary route | Fallback substitution |
|---|---|---|---|---|
| Narrative Analyst | `claude-sonnet-4.6` | `/v1/messages` (native Anthropic) | Direct Anthropic API | DGrid `/v1/messages` with `anthropic/claude-sonnet-4.6`, then `claude-haiku-4.5` for fast-degraded sentiment |
| Quant Analyst | `gpt-4o` | `/v1/chat/completions` (OpenAI-compatible) | Direct OpenAI API | DGrid `/v1/chat/completions` with `openai/gpt-4o`, then `openai/gpt-4o-mini` for fast-degraded extraction |
| Risk Classifier | `deepseek/deepseek-v3.2` | `/v1/chat/completions` (OpenAI-compatible) | DGrid (no direct API needed) | `qwen/qwen-flash` via DGrid, then `openai/gpt-4o` via DGrid; if all routes fail action is forced to `hold` with confidence 0 |

**Phase 0 verification (2026-06-16):** Hit DGrid `GET /v1/models` with the V1 `DGRID_API_KEY`. All five model IDs above are served (162 models total). `meta-llama/llama-3-70b-instruct` is NOT served — earlier PRD draft assumed it would be; available Llama variants are `meta-llama/llama-3.3-70b-instruct:free` and `deepseek/deepseek-r1-distill-llama-70b`. Decision: keep V1-validated `deepseek/deepseek-v3.2` for Risk Classifier (cheap, fast, proven in V1 production for 3,357 cycles). The Llama-pure judging optic is not worth the cost amplification.

BYOK direct keys are tried first for Narrative and Quant. DGrid is the fallback gateway for those and the only route for Risk Classifier. All five model IDs live in `config/cognition.ts`.

### 5.2 Member tasks

**Narrative Analyst (Claude):** Receives KOL mention counts, news headlines, social sentiment, trending tokens. Outputs narrative summary, sentiment score, directional bias, flagged anomalies, top thesis token.

**Quant Analyst (GPT-4o):** Receives quote events, funding rates, DEX liquidity snapshots. Outputs structured features array, dominant direction, liquidity adequacy flag, funding rate warning, recommended token.

**Risk Classifier (Llama-3-70b):** Receives outputs of Narrative and Quant plus dissent result and regime label. Outputs final action enum (`open_long`, `close_position`, `adjust_parameters`, `hold`), target token (must be in 149-token allowlist), confidence, rationale.

Note: `open_short` is removed from the V2.0.0 action space. Spot-only execution means we cannot short. Action enum is `open_long | close_position | adjust_parameters | hold` only.

### 5.3 Dissent tracker

Runs between the parallel analysts and the risk classifier.

```typescript
interface DissentResult {
  dissentDetected: boolean;
  dissentSeverity: 'none' | 'mild' | 'strong';
  narrativeDirection: 'bullish' | 'bearish' | 'neutral';
  quantDirection: 'bullish' | 'bearish' | 'neutral';
  positionSizeModifier: number;   // 1.0 no change, 0.5 half size, 0.0 force hold
  rationale: string;
}
```

Rules:
- Narrative bullish + Quant bearish (or inverse) → strong dissent, `positionSizeModifier = 0.0` (forces hold)
- Either party neutral while the other is directional → mild dissent, `positionSizeModifier = 0.5`
- Both parties agree directionally → no dissent, `positionSizeModifier = 1.0`

When dissent is strong, the Risk Classifier is instructed in its system prompt to return `hold`. The session still completes and persists for the audit trail.

### 5.4 CommitteeSession schema

```typescript
interface ModelCallRecord {
  modelId: string;
  endpointFormat: 'claude_native' | 'openai_compatible';
  routingDecision: 'direct' | 'dgrid_fallback';
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  systemPrompt: string;
  userInput: string;
  rawOutput: string;
  parsedOutput: Record<string, unknown>;
  parseSuccess: boolean;
}

interface CommitteeSession {
  sessionId: string;              // UUID v4
  sessionNumber: number;          // sequential
  createdAt: number;
  regime: RegimeLabel;
  previousRegime: RegimeLabel | null;
  fearGreedAtSession: number;
  inputMetrics: AggregateMetrics;
  evGateDecisions: EVDecision[];
  x402SpendThisSessionUSDC: number;
  narrativeCall: ModelCallRecord;
  quantCall: ModelCallRecord;
  dissentResult: DissentResult;
  riskCall: ModelCallRecord;
  finalAction: ActionRecommendation;
  reasoningHash: `0x${string}`;    // keccak256 of canonical serialization
  attestationCommitTx: `0x${string}` | null;
  executionResult: {
    executed: boolean;
    twakTxHash: `0x${string}` | null;
    bscscanUrl: string | null;
    attestationRevealTx: `0x${string}` | null;
    failureReason: string | null;
  } | null;
}

interface ActionRecommendation {
  action: 'open_long' | 'close_position' | 'adjust_parameters' | 'hold';
  tokenSymbol: string | null;
  tokenAddress: `0x${string}` | null;
  confidence: number;             // 0-1
  positionSizeUSD: number | null; // null if hold
  leverageMultiplier: 1;          // hardcoded 1 in V2.0.0
  tpPercentage: number | null;
  slPercentage: number | null;
  rationale: string;              // max 200 chars
  plainLanguageExplanation: string; // for Position Explainer modal
}
```

### 5.5 Prompts location

All system prompts live in `lib/utils/prompts.ts`. No prompt construction occurs elsewhere. Each prompt is built by a typed function returning `{ systemPrompt: string, userContent: string }`. Token names from CMC are sanitized (alphanumeric + space + underscore + hyphen only, truncated to 100 chars) before injection.

### 5.6 Fallback chain

Carried from V1 with model routing updated for V2. Per-member fallback:

**Narrative fails:** retry once (2s delay) → BYOK Anthropic direct → GPT-4o via DGrid with adapted prompt → degraded output (sentiment 0, confidence 0, direction neutral). Session continues.

**Quant fails:** retry once → BYOK OpenAI direct → Llama via DGrid with adapted prompt → degraded output (`liquidityAdequate: false` which blocks trade). Session continues.

**Risk fails:** retry once → GPT-4o via DGrid → degraded output (action hold, confidence 0). No trade.

Every fallback is logged with the intended model and the actual model that ran. Silent failures are forbidden.

---

## 6. EXECUTION LAYER

### 6.1 TWAK is the only signing path

No direct viem transaction signing for trades. The only viem usage in V2 is for AttestationEmitter contract calls (commit and reveal). All swap and portfolio operations route through TWAK CLI/REST.

### 6.2 TWAK client surface (verified Phase 0)

The TWAK CLI is `@trustwallet/cli` (install: `npm install -g @trustwallet/cli`). Verified subcommands relevant to V2:

| TWAK CLI | Purpose | Our wrapper method |
|---|---|---|
| `twak compete register --json` | Idempotent register on BSC competition contract | `register()` |
| `twak compete status --json` | Current registration state + deadline | `getCompetitionStatus()` |
| `twak balance --address <addr> --chain bsc [--token <contract>] --json` | Per-token balance for any address | `getBalance()` (called per allowed token to build portfolio) |
| `twak swap <amount> <from> <to> --chain bsc --slippage <pct> --quote-only --json` | Quote a swap | `quoteSwap()` |
| `twak swap <amount> <from> <to> --chain bsc --slippage <pct> --password <pw> --json` | Execute a swap (returns `{ hash, fromChain, toChain, explorer, input, output, ... }`) | `executeSwap()` |
| `twak serve --rest --port <n> --watch --watch-interval <s>` | HTTP server exposing all wallet ops as REST + runs DCA/limit-order watcher | started by `startServer()` |
| `twak x402 request <url> --max-payment <atomic> [--yes]` | Outbound x402 payment for paid resources | `payX402()` (used by CMC x402 transport) |
| `twak x402 quote <url>` | Preview x402 payment options without paying | `quoteX402()` |
| `twak automate add --from --to --chain --amount --interval <d> \| --price <p>` | Register DCA or limit-order automation | not used in V2.0.0 (probe trades use direct `executeSwap`) |

Our `twakClient.ts` shells out to these commands and parses JSON output. The wrapper's TypeScript signature:

```typescript
interface TWAKClient {
  register(): Promise<{ txHash: `0x${string}`; alreadyRegistered: boolean; participant: `0x${string}`; deadline: string; chain: 'bsc' }>;
  getCompetitionStatus(): Promise<{ registered: boolean; participant: `0x${string}` | null; deadline: string | null }>;

  // Portfolio is constructed by iterating allowedTokens and calling balance per token.
  getPortfolio(): Promise<{
    totalValueUSD: number;
    positions: Array<{
      tokenSymbol: string;
      tokenAddress: `0x${string}`;
      balanceTokens: string;
      valueUSD: number;
    }>;
    drawdownFromPeak: number;       // computed by us from snapshot history, NOT by TWAK
    availableCapitalUSD: number;
  }>;

  quoteSwap(params: {
    fromTokenSymbol: string;
    toTokenSymbol: string;
    amountTokens: string;
    slippageBps: number;
  }): Promise<{ input: string; output: string; minReceived: string; provider: string; priceImpact: number; networkFee: string; steps: unknown[] }>;

  executeSwap(params: {
    fromTokenSymbol: string;
    toTokenSymbol: string;
    amountTokens: string;
    slippageBps: number;
  }): Promise<{ txHash: `0x${string}`; fromAmount: string; toAmount: string; explorer: string }>;

  payX402(url: string, maxPaymentAtomic: bigint): Promise<{ proofHeader: string; settlementTxHash: `0x${string}` }>;
  startServer(port: number): Promise<void>;
}
```

Critical PRD correction from Phase 0:
- TWAK does NOT expose a wallet-level drawdown or token-allowlist guardrail. The `twak wallet configure --max-drawdown` invocation in the previous PRD draft does not exist. Drawdown ladder, token allowlist, position cap, and daily-loss cap are enforced 100% by our `PreExecutionChecker` + `RiskManager` before any `executeSwap` call. There is no TWAK-side backstop.
- TWAK's `swap` uses **token amounts**, not USD. Our wrapper converts USD → token amount using a current price read (CMC quote) before calling.
- `sessionId` is for our own DB records; it is not passed to TWAK.
- `executeSwap` succeeds atomically with a tx hash on the BSC explorer; no separate "pending → filled" lifecycle from TWAK's side. PositionTracker derives status from the BSC receipt + portfolio polling.
- Cross-chain swaps via Amber/Rango are supported but out of scope for V2.0.0 (BSC-only).

### 6.3 TWAK configuration at startup

```bash
# One-time: install the CLI on the Railway worker host
npm install -g @trustwallet/cli

# Per-deployment: import the agent private key (TWAK_AGENT_PRIVATE_KEY env)
# TWAK reads TWAK_WALLET_PASSWORD env at runtime; no separate `configure` step is needed.

# Once per agent (idempotent): register on BSC competition contract
twak compete register --json
```

**There is no TWAK guardrail config.** The previous PRD draft assumed `twak wallet configure --max-drawdown 0.28 --token-allowlist ... --max-position-pct 0.08 --daily-loss-cap 0.05 --slippage-protection 0.005`. None of those flags exist. Drawdown enforcement, token allowlist enforcement, position cap, daily-loss cap, and slippage protection live entirely in our `PreExecutionChecker` + `RiskManager`. This makes Phase 5 (Execution layer) testing especially load-bearing: there is no second line of defense if our checker passes a bad trade.

Slippage is passed per-swap via `twak swap ... --slippage 0.5` (basis points become percent). The `MAX_SLIPPAGE_PCT` constant in `config/execution.ts` is read at PreExecutionChecker time and again at swap-call time.

### 6.4 Pre-execution checks (8 total)

```typescript
const CHECKS = [
  'allowed_token_verified',     // V2: token in 149-token competition allowlist
  'security_check_passed',      // V2: CMC security score < 60, no honeypot flag
  'pyth_oracle_divergence',     // V1+V2: abs(cmcPrice - pythPrice) / pythPrice < 0.5%
  'liquidity_adequate',         // V1: from quantCall.liquidityAdequate
  'funding_rate_safe',          // V1: from quantCall.fundingRateWarning false
  'slippage_within_tolerance',  // V1: estimated slippage < 0.5%
  'collateral_available',       // V1: TWAK portfolio.availableCapitalUSD >= positionSize
  'risk_manager_approval',      // V1: RiskManager.canAct(recommendation, riskState)
] as const;
```

Each check is its own function with strict input typing, returns `{ name: string, passed: boolean, value: string|number, threshold: string|number, message: string }`. The full check result array persists to the CommitteeSession.executionResult for the audit trail.

### 6.5 Risk manager

```typescript
interface MandateConfig {
  maxDrawdownPct: number;       // mirrored to TWAK config, default 0.28
  maxPositionPct: number;       // % of portfolio per token, default 0.08
  dailyLossCapPct: number;      // % of starting portfolio, default 0.05
  consecutiveLossHalt: number;  // pause after N losses, default 3
  riskLevel: 'conservative' | 'moderate' | 'aggressive';  // affects regime multipliers
}

interface RiskManagerState {
  currentDrawdownFromPeak: number;
  consecutiveLosses: number;
  positionsOpenCount: number;
  totalExposureUSD: number;
  dailyPnLUSD: number;
  dailyTradeCount: number;       // for probe trade compliance
  lastProbeTradeAt: number | null;
}
```

Drawdown ladder (enforced 100% by our RiskManager — TWAK has no wallet-level guardrails per Phase 0):

```
DD < 15%        Normal operation. Full regime sizing.
DD 15-20%       Alert state. Position sizes halved.
DD 20-25%       Defensive mode. Close all open positions. Probe trades only.
DD 25%+         Full halt. No trades. Resume only after DD < 20% recovered.
DD 30%          DISQUALIFICATION (prevented by our RiskManager halting at 25%; no second line of defense exists)
```

Drawdown is computed from a peak-equity snapshot persisted to Supabase (`metrics` table, payload key `peakPortfolioValueUSD`). The peak resets at each agent restart only if the restart is more than 24h after the last snapshot — otherwise the historical peak persists. RiskManager reads the latest peak on every `canAct()` call and computes `currentDrawdownFromPeak = 1 - (currentValueUSD / peakValueUSD)`.

The `canAct()` method returns `{ approved: boolean, rejectionReason: string | null, adjustedPositionSizeUSD: number | null }`. Position size adjustment accounts for dissent modifier and regime multiplier and drawdown state.

### 6.6 Probe trade scheduler

The competition requires 1 trade per day for 7 days minimum. In `quiet` regime or after defensive halt, the agent must still execute at least one trade per UTC day for compliance.

```typescript
interface ProbeTradeScheduler {
  shouldFireProbe(state: RiskManagerState, currentUTCHour: number): boolean;
  // true if no trade has been recorded for current UTC day AND
  //         currentUTCHour >= 18 (6 PM UTC cutoff for execution headroom)

  executeProbe(): Promise<{ txHash: `0x${string}` }>;
  // Swaps $10 BUSD → CAKE → BUSD via TWAK to record one trade
  // Logs as probe_trade in committee_sessions with regime context
}
```

Runs every hour via setInterval. The 6 PM UTC cutoff leaves headroom for execution failures and retries.

### 6.7 AttestationEmitter (commit-reveal pattern)

The contract is at `0xe21f5ebec3f098c744c1e35db0c9338d6b717dc4` on BSC mainnet. Already deployed and verified.

Commit-reveal flow per trade:

```
1. Build CommitteeSession serialization (canonical JSON, sorted keys)
2. Compute reasoningHash = keccak256(serialization)
3. Call attestationContract.commitReasoning(reasoningHash, actionIntent)
4. Wait for confirmation. Record attestationCommitTx in CommitteeSession.
5. Submit TWAK swap. Record twakTxHash.
6. Call attestationContract.revealExecution(reasoningHash, twakTxHash)
7. Wait for confirmation. Record attestationRevealTx in CommitteeSession.
```

The contract at `0xe21f5ebec3f098c744c1e35db0c9338d6b717dc4` is confirmed to already implement `commitReasoning(bytes32 reasoningHash, bytes32 actionIntent)` and `revealExecution(bytes32 reasoningHash, bytes32 myxTxHash, bytes32 orderId)`. Verified by live BSC mainnet tx [`0xcbd07114…`](https://bscscan.com/tx/0xcbd07114790424553ddcc04190931f71a428011a35dd09b3a7b591c2bd8f7f68) which emitted `ReasoningCommitted`, and tx [`0x7dea3fc4…`](https://bscscan.com/tx/0x7dea3fc4c07c662aae3c076ab93468f8cd9f34cde6e203e0bd36d7e409c1321d) which emitted `ExecutionRevealed`, both during V1 smoke testing. Phase 0 task: `eth_call` the contract to confirm function selectors are in the deployed bytecode, then reuse the existing address verbatim. Do NOT redeploy.

V2 reuses the V1 ABI in `src/lib/abis/attestationEmitter.ts` without modification. The `orderId` argument to `revealExecution` MUST contain a real on-chain order ID (or the keccak of one) rather than a hash of a local UUID — this was a load-bearing V1 bug (audit §1.2b). V2 extracts the order ID from the TWAK swap return value or from decoded TWAK swap logs before calling `revealExecution`.

### 6.8 Position tracker

State machine: `SUBMITTED → PENDING → FILLED → MANAGED → CLOSED` (+ `EXPIRED`, `LIQUIDATED` failure branches).

Polls TWAK `getPortfolio()` every 30 seconds. Transitions log to `events` table, update `positions` table, fire SSE update, and emit attestation events on FILLED and CLOSED.

For V2.0.0 spot-only, `LIQUIDATED` is dead code (only applies to perp). Retained for V2.1 compatibility.

---

## 7. MONETIZATION LAYER

### 7.1 x402-gated session API

Required for the Best TWAK special prize ("x402 used as the heart of the trade loop, not plumbing"). **Phase 0 correction:** `twak serve` does not have an `--x402` flag. TWAK exposes `twak x402 request` (outbound payment for resources the agent buys) and `twak x402 quote` (preview), but not a built-in 402-gated server.

V2 implements the inbound x402 server as a Next.js route at `/api/x402/session/:id` (and friends), wrapping x402 verification with viem reads against BSC USDT or Base USDC, matching the same pattern V1 used for the Pieverse pieUSD endpoint (the verification path was real on-chain in V1; what V1 lacked was replay protection — which V2 fixes with a `consumed_x402_proofs` table).

`twak serve --rest --port 3001 --watch` runs alongside, exposing the agent's wallet ops over HTTP for our own service code to call. It is NOT the public x402 endpoint.

Endpoints (Next.js routes, BSC USDT settlement by default; Base USDC supported via x402 client):

| Endpoint | Cost | Returns |
|---|---|---|
| `GET /api/x402/session/:id` | $0.01 USDT (BSC) | Full CommitteeSession JSON |
| `GET /api/x402/session/latest` | $0.01 USDT | Most recent session |
| `GET /api/x402/journal?limit=20` | $0.01 USDT | Last 20 sessions with PnL |
| `GET /api/agent/status` | Free | Regime, F&G, position count, drawdown |
| `GET /api/og/session/:id` | Free | OG card image URL |

Each `consumed_x402_proofs (tx_hash PRIMARY KEY, payer, amount, consumed_at)` row prevents replay. The endpoint reads BSC tx receipt → confirms USDT Transfer event to revenue address → asserts `tx_hash` is not yet in `consumed_x402_proofs` → inserts row → returns payload. Settlement revenue accrues to a separate revenue wallet (`PIEVERSE_REVENUE_ADDRESS` env, reused from V1 naming).

x402 revenue tracks against outgoing CMC x402 spend in `aggregateMetrics.x402SpendDailyUSDC` so the dashboard can show net economic position.

### 7.2 Public dashboard

The Next.js frontend exposes the same data without payment for inspection. The x402 endpoint is for programmatic access by other agents.

### 7.3 Performance journal

`/journal` page lists all CommitteeSessions with PnL summary, regime, dissent flag, action, exit reason. Filterable. Each row links to `/session/:id` detail.

### 7.4 Deferred to V2.1

- Telegram bot alerts
- Auto-generated social cards on closed positions
- NLP mandate parser
- Perp execution mode
- Cross-chain expansion

---

## 8. USER-FACING PRODUCT

### 8.1 Routes

| Route | Purpose |
|---|---|
| `/` | Landing. Mandate form. TWAK connect button. |
| `/agent` | Live dashboard. Committee feed, positions, drawdown gauge, regime indicator. |
| `/session/:id` | Full session detail with all three analyst outputs, dissent result, EV gate log, execution result, BscScan links. |
| `/journal` | Sortable history of all sessions. |
| `/proof/:txHash` | Public verification page. Reconstructs the chain of custody from any TWAK trade hash. |

### 8.2 Mandate form (V2.0.0)

Replaces the NLP mandate parser. A standard form with 4 fields:

```
Risk level:   [Conservative ▼]   (Conservative | Moderate | Aggressive)
Max drawdown: [20%]                (slider, 10% to 28%)
Max per token: [8%]                (slider, 2% to 15%)
Daily loss cap: [5%]               (slider, 2% to 10%)

[ Connect Trust Wallet ]
```

On submit, MandateConfig is written to localStorage AND to the agent's startup environment. TWAK guardrails configured before agent starts.

### 8.3 Position explainer modal

Triggered by "Why?" button on any position in `/agent`. Returns the `plainLanguageExplanation` field from the originating CommitteeSession plus current status (still bullish? regime changed? dissent emerged?).

### 8.4 Proof page

Public verification that the reasoning was committed BEFORE the trade. Given any TWAK tx hash:

1. Query AttestationEmitter logs for `ExecutionRevealed` matching this txHash
2. Extract `reasoningHash` from the event
3. Query AttestationEmitter logs for `ReasoningCommitted` with same `reasoningHash`
4. Fetch CommitteeSession from Supabase by reasoningHash
5. Recompute keccak256 of the canonical serialization
6. Verify recomputed hash equals on-chain hash
7. Display commit timestamp, execution timestamp, time delta, hash verification status

If hash does not verify, page shows red error. There is no "trust us" layer.

---

## 9. DATABASE SCHEMA

```sql
CREATE TABLE committee_sessions (
  session_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_number        BIGINT NOT NULL UNIQUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  regime                TEXT NOT NULL,
  previous_regime       TEXT,
  fear_greed_value      INTEGER NOT NULL,
  input_metrics         JSONB NOT NULL,
  ev_gate_decisions     JSONB NOT NULL DEFAULT '[]',
  x402_spend_usdc       NUMERIC(10,4) NOT NULL DEFAULT 0,
  narrative_call        JSONB NOT NULL,
  quant_call            JSONB NOT NULL,
  dissent_result        JSONB NOT NULL,
  risk_call             JSONB NOT NULL,
  final_action          JSONB NOT NULL,
  reasoning_hash        TEXT NOT NULL,
  attestation_commit_tx TEXT,
  execution_result      JSONB
);

CREATE INDEX idx_sessions_created_at ON committee_sessions(created_at DESC);
CREATE INDEX idx_sessions_regime ON committee_sessions(regime);
CREATE INDEX idx_sessions_reasoning_hash ON committee_sessions(reasoning_hash);

CREATE TABLE positions (
  position_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       UUID REFERENCES committee_sessions(session_id),
  token_symbol     TEXT NOT NULL,
  token_address    TEXT NOT NULL,
  direction        TEXT NOT NULL DEFAULT 'spot',
  size_usd         NUMERIC(12,2) NOT NULL,
  entry_price_usd  NUMERIC(20,8) NOT NULL,
  tp_price_usd     NUMERIC(20,8),
  sl_price_usd     NUMERIC(20,8),
  twak_tx_hash     TEXT NOT NULL,
  attestation_tx   TEXT,
  status           TEXT NOT NULL DEFAULT 'SUBMITTED',
  exit_price_usd   NUMERIC(20,8),
  pnl_usd          NUMERIC(12,2),
  pnl_pct          NUMERIC(8,4),
  exit_reason      TEXT,
  opened_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at        TIMESTAMPTZ
);

CREATE INDEX idx_positions_status ON positions(status);
CREATE INDEX idx_positions_opened_at ON positions(opened_at DESC);

CREATE TABLE events (
  event_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source       TEXT NOT NULL,
  event_type   TEXT NOT NULL,
  timestamp    BIGINT NOT NULL,
  payload      JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_events_source_type ON events(source, event_type);
CREATE INDEX idx_events_timestamp ON events(timestamp DESC);

CREATE TABLE metrics (
  metric_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  computed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload      JSONB NOT NULL
);
```

RLS: anon role can SELECT all tables. service_role can INSERT/UPDATE. No DELETE policies.

---

## 10. REPO STRUCTURE

```
neurodegen-v2/
├── src/
│   ├── app/                          Next.js App Router
│   │   ├── page.tsx                  Landing (mandate form)
│   │   ├── agent/page.tsx            Live dashboard
│   │   ├── session/[id]/page.tsx     Session detail
│   │   ├── journal/page.tsx          Journal
│   │   ├── proof/[txHash]/page.tsx   Public verification
│   │   ├── icon.tsx                  Programmatic SVG favicon
│   │   └── api/
│   │       ├── agent/{start,status,trigger}/route.ts
│   │       ├── session/{route.ts,[id]/{route.ts,explain/route.ts}}
│   │       ├── positions/route.ts
│   │       ├── journal/route.ts
│   │       ├── proof/[txHash]/route.ts
│   │       ├── events/stream/route.ts
│   │       ├── health/route.ts
│   │       └── og/{route.tsx,session/[id]/route.tsx}
│   ├── components/
│   │   ├── ui/                       shadcn primitives
│   │   ├── features/{landing,perception,cognition,execution,journal,proof}/
│   │   └── layout/{Shell,NavBar,DarkModeApplier}.tsx
│   ├── lib/
│   │   ├── abis/{attestation,pyth}.ts
│   │   ├── clients/
│   │   │   ├── cmcHubClient.ts       CMC MCP + x402 unified
│   │   │   ├── twakClient.ts         TWAK CLI/REST wrapper
│   │   │   ├── pythClient.ts         Pyth Hermes (divergence only)
│   │   │   ├── chain.ts              viem (attestation only)
│   │   │   ├── llm/{claude,openai,dgrid,router}.ts
│   │   │   └── supabase.ts
│   │   ├── services/
│   │   │   ├── perception/{cmcIngester,eventNormalizer,aggregatorService,regimeClassifier,evGate}.ts
│   │   │   ├── cognition/{committeeSession,narrativeAnalyst,quantAnalyst,riskClassifier,dissentTracker,sessionGraphBuilder,fallbackHandler}.ts
│   │   │   ├── execution/{preExecutionChecker,riskManager,twakExecutor,positionTracker,attestationEmitter,probeTradeScheduler}.ts
│   │   │   ├── monetization/{x402Server,journalService}.ts
│   │   │   ├── realtimeService.ts
│   │   │   ├── agentLoop.ts
│   │   │   └── backtestRunner.ts
│   │   ├── queries/{sessions,positions,events,metrics}.ts
│   │   ├── stores/hotState.ts
│   │   └── utils/{prompts,allowedTokens,decimalScaling,canonicalSerialize,validation}.ts
│   ├── hooks/{useSSE,useAgentStatus,useSession,usePositions}.ts
│   ├── types/{perception,cognition,execution,monetization,mandate}.ts
│   └── config/{perception,cognition,execution,risk,competition,features,chains}.ts
├── supabase/migrations/
│   ├── 001_committee_sessions.sql
│   ├── 002_positions.sql
│   ├── 003_events_metrics.sql
│   └── 004_indexes_rls.sql
├── scripts/
│   ├── audit.sh                      Full spec audit
│   ├── twakRegister.ts               Day-1 competition registration
│   ├── twakVerify.ts                 Phase-0 TWAK API verification
│   ├── attestationVerify.ts          Phase-0 contract verification
│   ├── backtest.ts                   Historical replay runner
│   └── seedTestData.ts
├── .env.example
├── vercel.json
├── railway.toml                       Background worker config
├── package.json
├── tsconfig.json                      strict: true
├── vitest.config.ts
├── tailwind.config.ts
├── NEURODEGEN_V2_PRD.md              (this file)
├── BUILD_PROTOCOL.md                 (companion doc)
└── AGENT_PROGRESS.md                  Updated after every phase
```

---

## 11. TECHNOLOGY STACK

| Component | Tech | Justification |
|---|---|---|
| Framework | Next.js 15 App Router | Latest stable, server components, SSE, OG generation |
| Language | TypeScript 5, strict mode | Non-negotiable |
| Chain client | viem 2.x | Used only for AttestationEmitter calls. No trade signing. |
| Styling | Tailwind 4 | CSS-based theme config (continues V1 pattern) |
| UI primitives | shadcn/ui | Copy-paste, no lock-in |
| Database | Supabase Postgres | Realtime subscriptions, RLS |
| Data source | CMC Hub MCP + x402 | Hackathon sponsor stack |
| Execution | TWAK CLI/REST | Hackathon sponsor stack |
| Oracle (divergence only) | Pyth Hermes | Two-source price check |
| LLM gateway | Direct APIs (BYOK) + DGrid fallback | V1 DGrid credits used as fallback |
| Deployment | Vercel (frontend) + Railway (agent worker) | Agent loop NOT on serverless |
| Testing | Vitest | Fast, ESM-native, TypeScript-first |
| Package manager | pnpm | Workspace support, lockfile determinism |

Critical: the agent loop runs on Railway as a long-lived worker. Vercel hosts the frontend and read-only API routes only. V1 hit Vercel free-tier limits because the loop was serverless. V2 fixes this architecturally.

---

## 12. ENVIRONMENT VARIABLES

```bash
# CMC Hub
CMC_PRO_API_KEY=                       # MCP free tier
CMC_X402_WALLET_PRIVATE_KEY=           # Base USDC wallet for x402 payments
CMC_X402_WALLET_ADDRESS=               # Same wallet, public address

# TWAK
TWAK_API_KEY=                          # Trust Wallet portal API key
TWAK_AGENT_WALLET_ADDRESS=             # The agent's BSC wallet, managed by TWAK
TWAK_AGENT_PRIVATE_KEY=                # Only loaded by Railway worker, never client

# LLM primary (BYOK)
ANTHROPIC_API_KEY=                     # Claude Narrative
OPENAI_API_KEY=                        # GPT-4o Quant

# LLM fallback
DGRID_API_KEY=                         # All three models via DGrid

# Database
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Blockchain
BSC_RPC_URL=
BSC_RPC_URL_FALLBACK=
ATTESTATION_CONTRACT_ADDRESS=          # Verified or redeployed in Phase 0
PYTH_HERMES_URL=https://hermes.pyth.network

# Competition
COMPETITION_CONTRACT_ADDRESS=0x212c61b9b72c95d95bf29cf032f5e5635629aed5
COMPETITION_REGISTRATION_DEADLINE=2026-06-22T00:00:00Z

# Agent config
AGENT_BASE_POSITION_SIZE_USD=100
AGENT_MIN_PROBE_TRADE_USD=10
EV_THRESHOLD=3.0

# Admin
ADMIN_SECRET=                          # gates /api/agent/{start,trigger}

# App
NEXT_PUBLIC_APP_URL=https://neurodegen.xyz
NODE_ENV=production
```

---

## 13. BUILD ORDER

### Phase 0 — Verification (Day 0-1, June 7-8)

This phase is non-skippable. The PRD assumes things about TWAK, CMC Hub, and the V1 AttestationEmitter that must be verified before any other code is written.

**Tasks:**
- Read TWAK CLI documentation and REST documentation in full
- Run `twak --help`, `twak wallet --help`, `twak compete --help`, `twak serve --help`
- Verify TWAK supports: registration, agent wallet mode, spot swap, portfolio query, x402 serve
- For each TWAK surface used in this PRD, write a one-line test script that calls it and prints the result
- Read CMC Hub MCP documentation in full
- List the exact MCP tool names that match the functional surfaces in Section 4.2
- Make one test call per MCP tool. Capture real response schemas.
- `eth_call` the AttestationEmitter at `0xe21f5ebec3f098c744c1e35db0c9338d6b717dc4` to confirm `commitReasoning(bytes32,bytes32)` and `revealExecution(bytes32,bytes32,bytes32)` function selectors are in the deployed bytecode. Methods already confirmed in V1 live testing (tx `0xcbd07114…` and `0x7dea3fc4…`). Do NOT redeploy. Document the verified selectors in AGENT_PROGRESS.md Phase 0.
- Run `twak compete register` immediately. Confirm registration on BscScan.
- Update PRD Section 4.2 with verified MCP tool names.
- Update PRD Section 6.2 with verified TWAK API surfaces.

**Gate:** All TWAK surfaces work. All CMC tools confirmed. Attestation contract has commit-reveal methods. Competition registration confirmed. Any failures here change the PRD before Phase 1 begins.

### Phase 1 — Foundation (Day 2-3, June 9-10)

**Tasks:**
- pnpm init, Next.js 15 scaffold, TypeScript strict, Tailwind 4, Vitest
- All `/types`, `/config`, `/lib/abis` files per PRD Section 9 and 10
- `.env.example` with all variables from Section 12
- `vercel.json` for frontend
- `railway.toml` for the agent worker
- Supabase project, run all 4 migrations
- ESLint + Prettier configured

**Tests:**
- Zero TypeScript errors on `pnpm tsc --noEmit`
- Vitest runs (no tests yet, but the framework loads)
- Supabase tables visible in dashboard

**Gate:** Audit script passes for Phase 1 file structure. Zero TypeScript errors. All env variables documented.

### Phase 2 — Clients (Day 4-5, June 11-12)

**Tasks:**
- `cmcHubClient.ts` — MCP + x402 transports, all functional surfaces
- `twakClient.ts` — verified surfaces from Phase 0
- `pythClient.ts` — divergence check only
- `chain.ts` — viem public client + attestation contract instance
- `lib/clients/llm/*` — Claude direct, OpenAI direct, DGrid wrapper, router
- `lib/clients/supabase.ts` — server and client instances
- `lib/utils/decimalScaling.ts` + tests
- `lib/utils/canonicalSerialize.ts` (deterministic JSON for hashing) + tests

**Tests:**
- Unit tests for decimalScaling (round-trip, edge cases)
- Unit tests for canonicalSerialize (key ordering, nested objects, deterministic output)
- Integration test: cmcHubClient fetches one MCP tool successfully (live API)
- Integration test: twakClient.getPortfolio() returns valid data (live TWAK)
- Integration test: pythClient returns BNB price (live Pyth)
- Integration test: each LLM client succeeds with a one-token prompt

**Gate:** All clients connect to their respective services in development. All unit tests pass. Zero TypeScript errors.

### Phase 3 — Perception (Day 6-7, June 13-14)

**Tasks:**
- `cmcIngester.ts` — polls CMC every 60s and on demand for premium
- `eventNormalizer.ts` — typed event construction with Zod validation
- `aggregatorService.ts` — rolling metrics
- `regimeClassifier.ts` — 4-state with verified previousRegime tracking
- `evGate.ts` — EV math, x402 spend tracking
- Wire perception output to `HotStateStore` and `ColdStorageWriter`

**Tests:**
- Unit: eventNormalizer rejects malformed input, accepts valid CMC response shapes
- Unit: aggregatorService produces correct metrics from fixture events
- Unit: regimeClassifier transitions correctly for each boundary case
- Unit: regimeClassifier updates previousRegime correctly across calls
- Unit: evGate returns correct decisions for fixture scenarios
- Integration: full perception cycle against live CMC for 60 seconds, verify event flow into HotStateStore

**Gate:** Live perception loop runs. Regime transitions correctly. EV gate denies calls below threshold. All unit + integration tests pass.

### Phase 4 — Cognition (Day 8-9, June 15-16)

**Tasks:**
- All prompts in `lib/utils/prompts.ts` with token name sanitization
- `narrativeAnalyst.ts`, `quantAnalyst.ts`, `riskClassifier.ts`
- `dissentTracker.ts`
- `sessionGraphBuilder.ts` — CommitteeSession assembly with reasoningHash computation
- `fallbackHandler.ts` — three-tier fallback chain
- `committeeSession.ts` — main orchestrator

**Tests:**
- Unit: prompt sanitization strips dangerous characters
- Unit: dissentTracker correctly identifies all dissent severities
- Unit: sessionGraphBuilder produces deterministic reasoningHash for same inputs
- Unit: fallbackHandler routes correctly when each primary fails
- Integration: full committee session against live LLMs with fixture perception input
- Integration: committee session persists to Supabase correctly
- Integration: forced model failure triggers correct fallback chain

**Gate:** Live committee sessions complete end-to-end with real LLM calls. Sessions persist. Dissent detected in known fixtures. All tests pass.

### Phase 5 — Execution (Day 10-11, June 17-18)

**Tasks:**
- `preExecutionChecker.ts` — all 8 checks
- `riskManager.ts` — mandate config + drawdown ladder
- `twakExecutor.ts` — coordinator between checks, risk, TWAK
- `positionTracker.ts` — state machine with TWAK polling
- `attestationEmitter.ts` — commit and reveal calls to verified contract
- `probeTradeScheduler.ts` — 6 PM UTC compliance trigger
- `agentLoop.ts` — the main long-lived loop that drives Phase 3 + 4 + 5

**Tests:**
- Unit: each preExecutionChecker rule with valid + invalid fixtures
- Unit: riskManager rejects at each drawdown ladder rung
- Unit: probeTradeScheduler fires correctly at boundary conditions
- Integration: full loop on BSC fork (Anvil) — perception → cognition → execution with mocked TWAK
- Integration: attestationEmitter commit and reveal both succeed on BSC mainnet (single test trade $5)
- Integration: PositionTracker correctly transitions states from polling fixtures

**Gate:** One real $5 trade completes the full commit → swap → reveal cycle on BSC mainnet. Attestation events visible on BscScan. Position tracked through full lifecycle. All tests pass.

### Phase 6 — Frontend + Monetization (Day 12-13, June 19-20)

**Tasks:**
- Mandate form on landing page
- Live dashboard with SSE feed
- Session detail page
- Journal page
- Proof page with hash verification
- All API routes from PRD Section 10
- TWAK x402 serve endpoint configured (`twak serve --rest --x402`)
- OG images for landing and session pages

**Tests:**
- Unit: mandate form validation
- Unit: proof page hash recomputation matches on-chain
- Integration: SSE stream delivers events on subscription
- Integration: x402 serve returns 402 for paid endpoints without payment, 200 with valid payment
- E2E: full demo dry run — start agent, observe one committee session in dashboard, click into session detail, click into proof page

**Gate:** Dashboard live. All pages render. x402 serve verified. Demo dry-run checklist passes.

### Phase 7 — Backtest + Audit (Day 14, June 21)

**Tasks:**
- `backtestRunner.ts` — replays historical CMC data through cognition with LLM response caching
- Run 30 days of historical replay. Compute hypothetical PnL.
- Run full audit script
- Fix any audit failures
- Record demo video
- Submit on DoraHacks (Track 1 + Track 2 Skill)

**Tests:**
- Backtest results are reproducible (same seed → same output)
- Audit script returns zero critical, zero wrong

**Gate:** Submission live. Audit clean. Agent ready for June 22 trading window.

### Phase 8 — Live trading window (June 22-28)

No new code. Monitor only.

Daily tasks:
- Verify the probe trade fired
- Check drawdown
- Check x402 USDC balance
- Verify attestation events still emitting
- Respond to any agent halt with manual review

---

## 14. RISK REGISTER

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Drawdown disqualification (30%) | Medium | Critical | 0.28 hard stop in TWAK config + 25% halt in RiskManager + 20% defensive + 15% alert |
| R2 | TWAK API differs from PRD assumptions | High | Critical | Phase 0 verifies every surface before Phase 1 begins; PRD updated if needed |
| R3 | LLM models unavailable | Low | High | Three-tier fallback: direct API → DGrid → degraded output (forces hold) |
| R4 | CMC Hub data outage | Low | High | Cached recent data in HotStateStore; agent enters quiet regime if data stale > 5min |
| R5 | BSC RPC failure | Low | High | Dual RPC with automatic failover; attestation retries up to 3 times |
| R6 | x402 USDC balance depleted | Medium | Medium | Alert at $1 remaining; EV gate prevents wasteful spend; refill before depletion |
| R7 | Probe trade misses daily window | Low | High | Scheduler fires at 6 PM UTC daily; alert if not executed by 11 PM UTC |
| R8 | Vercel rate limits | Medium | Medium | Agent worker on Railway, not Vercel. Vercel serves read-only frontend only. |
| R9 | Prompt injection via token names | Medium | Medium | Sanitization in prompts.ts; structural separation in system prompts; Zod schema validation on outputs |
| R10 | Supabase outage | Low | Medium | HotStateStore continues; ColdStorageWriter queues writes; flush on reconnect |
| R11 | AttestationEmitter contract bug | Low | Critical | Phase 0 verifies contract methods; if missing, redeploy with verified bytecode |
| R12 | Quiet market all week | Medium | Low | Probe trade keeps compliance; specials are unaffected by zero PnL trades |
| R13 | One trade blows past stop-loss | Medium | Medium | TWAK slippage protection 0.5%; PreExecutionChecker rejects high-slippage trades; position cap 8% of portfolio |

---

## 15. COMPLIANCE CHECKLIST

### Track 1 — Autonomous Trading Agents

- [ ] Agent wallet registered via `twak compete register` before June 22
- [ ] Agent wallet address submitted on DoraHacks
- [ ] Strategy description submitted on DoraHacks (the dissent + EV gate + drawdown ladder story)
- [ ] Non-zero balance of eligible tokens at June 22 00:00 UTC
- [ ] Probe trade fires every UTC day for 7 days
- [ ] All trades within the 149-token allowlist (PreExecutionChecker enforces)
- [ ] Drawdown stays below 28% (TWAK config hard stop)
- [ ] Public GitHub repository with reproducible setup
- [ ] Demo video uploaded

### Best Use of Trust Wallet Agent Kit ($2K)

- [ ] TWAK is the sole execution layer for all swaps (no direct viem trade signing; viem used only for AttestationEmitter and read-only chain reads)
- [ ] `twak compete register` confirmed on BSC (txHash captured in AGENT_PROGRESS Phase 5)
- [ ] Four TWAK CLI surfaces used: `twak swap` (execution), `twak balance` (portfolio), `twak x402 request` (outbound payment for CMC premium data via EV gate), `twak compete register/status` (mandatory)
- [ ] x402 is an economic variable via EV gate — every CMC x402 call is preceded by an `EVDecision` row logged in `committee_sessions.ev_gate_decisions`
- [ ] Self-custody preserved end-to-end (private key never leaves the Railway worker host; loaded via `TWAK_AGENT_PRIVATE_KEY` env, imported into TWAK keychain at deploy time)
- [ ] Demo shows: mandate-driven swap → preExecutionChecker passes → `twak swap` executes on BSC → attestation reveal links reasoningHash to txHash → BscScan proof page renders verified

### Best Use of CMC Agent Hub ($2K)

- [ ] At least 8 MCP tools consumed from the 12-tool catalog at `mcp.coinmarketcap.com/mcp` (target 10): `get_crypto_quotes_latest`, `search_cryptos`, `get_crypto_info`, `get_crypto_technical_analysis`, `get_crypto_metrics`, `get_global_metrics_latest`, `get_global_crypto_derivatives_metrics`, `trending_crypto_narratives`, `get_upcoming_macro_events`, `get_crypto_latest_news`
- [ ] x402 transport active — agent calls one or more MCP tools via the `/x402/mcp` endpoint after `twak x402 request` settles a 0.01 USDC payment per call
- [ ] EV gate logged for every x402 purchase in `committee_sessions.ev_gate_decisions`
- [ ] Narrative + global metrics + news + derivatives + Fear & Greed all feeding the committee — verified by CommitteeSession `inputMetrics` payload

### Track 2 Strategy Skill (bonus submission)

- [ ] Cognition layer packaged as standalone CMC Skill
- [ ] Skill submission to DoraHacks
- [ ] Skill spec is backtestable (backtestRunner included)
- [ ] Skill uses Fear & Greed, trending narratives, derivatives funding rates as inputs

---

## 16. GLOSSARY

| Term | Definition |
|---|---|
| CommitteeSession | One full reasoning cycle: three model calls + dissent + action + execution result + on-chain attestation. Successor to V1's ReasoningGraph. |
| EV Gate | Pre-x402 economic decision. Calculates `projectedAlpha / cost`. Below `EV_THRESHOLD = 3.0`, skip premium call. |
| Dissent | When Narrative and Quant analysts produce conflicting directional outputs. Halves or zeroes position size. |
| Mandate | User's risk configuration. V2.0.0: form-based (4 fields). V2.1: NLP from natural language. |
| Probe Trade | $10 BUSD → CAKE → BUSD swap fired at 6 PM UTC if no other trade has occurred that day. Maintains 1-trade/day compliance. |
| Regime | 4-state market classification (quiet, active, momentum, volatile). Determines position multiplier, cooldown, EV gate threshold. |
| Reasoning Hash | keccak256 of canonical JSON serialization of the CommitteeSession. Committed on-chain before TWAK execution. |
| Commit-Reveal | Two-transaction attestation: commit reasoningHash before trade, reveal txHash linkage after confirmation. |
| TWAK | Trust Wallet Agent Kit. Sole signing path for V2 trades. |
| CMC Hub | CoinMarketCap AI Agent Hub. Sole data source for V2 perception. |
| Drawdown Ladder | 15% alert → 20% defensive → 25% halt → 28% TWAK hard stop. 2% buffer below the 30% disqualifier. |
| Hot State | In-memory store. Last 30 min of events + current metrics + open positions. Sub-millisecond reads for cognition. |
| Cold State | Supabase. All persisted events, sessions, positions, metrics. |
| BYOK | Bring Your Own Keys. Direct Anthropic/OpenAI API access. Tried before DGrid fallback. |
| Backtest Mode | Historical replay with cached LLM responses. Validates strategy without burning credits. |

---

*End of NEURODEGEN_V2_PRD.md. Companion document: BUILD_PROTOCOL.md. Reference document: NEURODEGEN_V1_AUDIT.md.*