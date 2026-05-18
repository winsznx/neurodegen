# NeuroDegen V1 — Forensic Post-Mortem

Audit date: 2026-05-18
Audit basis: working tree at /Users/mac/neurodegen, git history through `442e474`, live read against Supabase `neurodegen` schema, live read against BSC mainnet (dRPC) for 7 known agent txs and the attestation contract.

This document is evidence-only. It does not change any code. Where claims are quantitative, the number comes from a live query — not from `AGENT_PROGRESS.md` or from the spec.

Before anything else: the framing "actual MYX trades did not execute end-to-end" is partly wrong. 7 increase orders DID land on-chain. `entry_tx_hash` is real, the agent wallet is the sender, MYX router accepted them, the keeper TP/SL closed 6 of them. What V1 doesn't do is **track the fill back into the database** and **record realized P&L**. That distinction matters for everything below.

Ground-truth numbers used throughout this report (live as of 2026-05-18):

- 3,357 reasoning chains in DB (first: 2026-04-21 16:35, last: 2026-05-09 03:21)
- 7 positions inserted (all on 2026-04-23 08:09–11:09)
- 7 `execution_result.executed = true` rows in reasoning_chains
- Win rate: unknown — `realized_pnl_usd` is NULL on every row, including the 6 closed ones
- Cumulative P&L: unknown (same reason)
- Regime distribution: `quiet` 1,235 + `retail_frenzy` 2,122 = 3,357. `active`, `volatile`, `cool` never fired across 18 days.
- Action distribution: `hold` 3,114 (92.8%), `open_long` 223, `open_short` 1, `close_position` 19, `adjust_parameters` 0
- 455 reasoning chains were produced before 2026-04-22 (the V1 submission window). Zero positions were inserted during that window. The first real fill happened ~32 hours after the submission cutoff.
- Sampled 200 cycles from the busy window (04-22 → 04-24): avg 6.1 model attempts per cycle, avg 16,999 input tokens, avg 773 output tokens. On clean (non-fallback) cycles: avg 3.0 attempts, avg 11,014 input tokens, avg 940 output tokens.

---

## 1. The execution bug

**The headline claim is wrong, but the underlying complaint is right.** Trades executed. The lifecycle didn't.

### 1.1 What actually fired

7 increase orders on 2026-04-23 between 08:09 and 11:09 UTC. Verified by `eth_getTransactionReceipt` against `https://bsc.drpc.org` for two of them (`0x466859a2…` and `0xe12d902f…`):

- status: `0x1` (success)
- from: `0x9fe816a8bd6933464c177ba94890aede5cd5aa5a` (agent wallet)
- to: `0x01d21a419d481f34cc62b0c9c592f19348fe137c` (MYX execution router on BSC)
- 10 logs each, all from MYX contracts + USDT
- ~691k gas used

The MYX SDK path (`@myx-trade/sdk` 1.0.18 → `sdk.order.createIncreaseOrder`) works. The router accepted the parameters. The keeper filled them. Six were closed externally by the keeper hitting TP/SL.

### 1.2 What's actually broken in the trade lifecycle

The bug is **on the way back, not on the way out**. Specifically:

**(a) `orderId` is always `null`.** `src/lib/services/execution/transactionSubmitter.ts:43-48` returns `orderId: null` on every successful submit. There is no code path that extracts the MYX order ID from the SDK response. Every downstream consumer that thinks it's working with an order ID is actually working with the local UUID.

**(b) The on-chain `revealExecution` event hashes the local UUID, not the real MYX order.** `src/lib/services/execution/executionGateway.ts:183` does `keccak256(stringToBytes(submit.orderId ?? positionId))` — and `submit.orderId` is always null (see (a)), so the on-chain `orderId` field in `ExecutionRevealed` is `keccak256(local_uuid)`. The commit-reveal binds the reasoning hash to the real `myxTxHash`, so the proof page still verifies — but the `orderId` field in the event is decoration, not evidence.

**(c) Position tracker no longer polls fills.** `src/lib/services/execution/positionTracker.ts:65-72` was rewritten (commit `442e474`, 2026-04-22) to skip SDK polling and insert positions directly as `managed`. The comment is explicit: "We don't need to poll the broken SDK listPositions endpoint to confirm — TP/SL are on-chain." That decision was forced by an SDK issue, but the consequence is that **no entry fill is ever confirmed** and **no exit fill is ever detected in the hot loop**.

**(d) TP/SL keeper closes are detected only on restart.** `positionTracker.ts:74-101` (`checkPositionExits`) returns exits only for time-exit and regime-exit. External keeper closes are picked up exclusively by `reconcileOnBoot()` (lines 30-63), which compares DB-open positions to `sdk.position.listPositions()` and marks missing ones `closed` with `exitReason: 'external_close'`. In production:
- A long-running worker that never restarts will never detect TP/SL fires.
- A worker that DOES restart correctly catches them but with no entry/exit prices, no exit tx hash, and no P&L — the row is just marked closed.

This matches the DB exactly: 6/7 positions are `status: 'closed'`, `exit_reason: 'external_close'`, `exit_tx_hash: null`, `realized_pnl_usd: null`. The 7th is `status: 'managed'` and has been sitting that way since 2026-04-23 11:09. It's almost certainly already closed on-chain; the DB just doesn't know.

**(e) The stuck "managed" position blocks every subsequent entry.** From 2026-04-24 11:29 onward, every probe-override `open_long` attempt was rejected with `risk_manager: Max concurrent positions reached (1)`. Sample (live):
- 2026-04-24 11:29:58 — Probe long, rejected by risk manager (1/1)
- 2026-04-24 13:29:59 — Probe long, rejected by risk manager (1/1)
- (continues until DGrid quota exhausted around 2026-05-09 — last 5 cycles are `CLASSIFIER_MODEL_UNAVAILABLE`)

So the **1 stuck "managed" position has effectively killed live trading for ~16 days.** `MAX_CONCURRENT_POSITIONS` defaults to 2 but the rejection message says 1 — confirm `PER_POSITION_SIZE_CAP_USD` or test env override has tightened it. Either way: a stale lifecycle row is bricking the agent's ability to enter.

**(f) `networkFee` shape coercion silently zeros the fee.** `executionGateway.ts:136-140`:
```
const networkFee = await this.sdk.utils.getNetworkFee(context.marketId, BSC_CHAIN_ID);
const feeAmount = typeof networkFee === 'string' ? networkFee : '0';
```
If the SDK ever returns the structured `{ volScale: '...' }` shape (which `mirrorDispatcher.ts:138` actually handles correctly via `String(networkFee?.volScale ?? '0')`), the gateway path zeros the fee. Did this fire? Probably not — txs went through with status 0x1 — but it's a silent footgun. The mirror path and the agent path disagree on how to read the same SDK response.

**(g) `placeOrderWithSalt` vs `placeOrderWithPosition` is implicit.** `myxOrderBuilder.ts:65-66` sets `positionId: ''` for fresh opens, relying on a comment that says the SDK routes to `placeOrderWithSalt` when the field is empty. That contract is not enforced by a type. If the SDK changes that dispatch logic (or if a refactor accidentally fills `positionId` with the local UUID), every "open" silently routes to `placeOrderWithPosition` and reverts (UUID is not a valid MYX position ID).

### 1.3 What the user should actually debug next

A specific script that surfaces ground truth in <10 minutes:

```ts
// scripts/forensicLifecycle.ts
import { logsPublicClient } from '@/lib/clients/chain';
import { getOpenPositions, getPositionHistory } from '@/lib/queries/positions';
import { getMyxClient } from '@/lib/clients/myxSdk';
import { getAgentWalletClient } from '@/lib/clients/chain';

const all = await getPositionHistory(50);
const sdk = getMyxClient(getAgentWalletClient());
const liveList = await sdk.position.listPositions('0x9fe816a8bd6933464c177ba94890aede5cd5aa5a');
console.log('DB rows:', all.map(p => ({ id: p.positionId, status: p.status, entry: p.entryTxHash?.slice(0, 10) })));
console.log('On-chain live:', liveList);

for (const p of all) {
  if (!p.entryTxHash) continue;
  const rcpt = await logsPublicClient.getTransactionReceipt({ hash: p.entryTxHash as `0x${string}` });
  console.log(p.positionId, '→', p.entryTxHash, 'status=', rcpt.status, 'logs=', rcpt.logs.length);
  // Decode MYX logs for order id (the SDK's order id is emitted in logs even though createIncreaseOrder return value drops it)
}
```

This will tell you in one pass: (a) which DB rows have a real on-chain entry, (b) which positions are still live on-chain, (c) which MYX log topics correspond to order IDs you can match back. Once you have on-chain order IDs, you can write a one-time backfill against `positions.order_id` and stop pretending the local UUID is the order ID.

### 1.4 ABI/router risks the user listed — actual status

| Concern | Verdict |
|---|---|
| Function signatures wrong | No — SDK abstracts the router. SDK version is pinned at 1.0.18. |
| Struct field order wrong | No — same reason. SDK builds the calldata. |
| Decimal scaling wrong | Risk is real but recent. Commits `09c29a9` + `d303a96` (2026-04-22) added `toCollateralScale` (18 dec) and `toPriceScale` (30 dec) integer encoding. Tests in `myxOrderBuilder.test.ts` cover this. Before those commits, the gateway was sending floats and reverting with `InvalidParameter` — fixed. |
| `paymentType` encoding | Not applicable — SDK handles `executionFeeToken` from pool registry (`myxPools.ts`). |
| Slippage encoding | Changed to basis points (`Math.floor(MAX_SLIPPAGE * 10000)`) in `d303a96`. Was the cause of `InvalidParameter` reverts before. |
| `pairIndex` mapping | The mapping is built dynamically from `getPoolList()` + `/v2/quote/market/contracts` REST (`myxPools.ts:71-101`). If the contract index field changes name, the mapping silently falls back to `-1`. There's no test asserting the contract index is non-negative before use. |
| `MYX_ROUTER_ADDRESS` ABI mismatch | Not directly used. The SDK targets the router internally. The `to: 0x01d21a419d481f34cc62b0c9c592f19348fe137c` observed on the 7 real txs is the SDK's resolved router. |
| `networkFeeAmount` query | Real bug. See 1.2(f). |
| Gas estimation silent failure | The agent uses `viem` via the SDK's `walletClient`; viem auto-estimates and there is no manual override. `GAS_HARD_CAP = 1_000_000` exists in `src/config/execution.ts:13` but it is not actually wired into any submission path — it's a dead constant. |

---

## 2. Infrastructure failure mode

The user's claim — "V1 ran agent loop on Vercel serverless. I hit free-tier limits" — is correct **for the design before commit `2d54084`** (2026-04-21 17:10). After that commit, a Railway worker config exists. But the worker was committed approximately **5 hours before the submission window closed**, and the recent commits (`442e474`, `c2b768b`) show it was still being stabilized days afterward. The "V1 submission" snapshot is right on the boundary between the two architectures.

### 2.1 Files that run the agent loop continuously

- `src/lib/services/agentLoop.ts` — `setInterval` on `MYX_POLL_INTERVAL_MS` (15s default), runs cognition every `CLAUDE_CALL_FREQUENCY` (20) cycles = full cognition every ~5 min.
- `src/lib/services/perception/fourMemeIngester.ts` — `setTimeout`-driven `getLogs` poll every 10s.
- `src/lib/services/perception/myxMarketPoller.ts` — `setInterval` poll every `MYX_POLL_INTERVAL_MS`.
- `src/lib/services/perception/coldStorageWriter.ts` — periodic flush.
- `src/lib/services/execution/positionTracker.ts` — internal `pollers` map (now mostly inert).
- `src/lib/services/notifications/dailySummary.ts` — `dailySummaryScheduler.start()` invoked from worker.

These were all designed assuming **one long-lived Node process**. On Vercel serverless, each cold-start spins up a fresh `setInterval` that dies when the lambda is reclaimed. The hot state (`hotState`) is in-process and resets on every cold start — perception is effectively never warm enough to compute valid metrics.

### 2.2 API routes that accidentally trigger compute

- `src/app/api/events/stream/route.ts` — SSE. `vercel.json` declares `maxDuration: 300` for this route. Every browser tab is a 5-minute compute slot. With `KEEPALIVE_INTERVAL_MS = 15_000` and the design intent of "live dashboard," even 1–2 idle tabs eat your Fluid Compute budget. On Vercel, this is the single biggest CPU drain.
- `src/app/api/agent/start/route.ts`, `.../trigger/route.ts`, `.../stop/route.ts`, `.../close/[positionId]/route.ts` — all now proxy via `workerAdminProxy.ts`. Pre-Phase 11 these called `agentLoop` directly in the web lambda, which would have started a `setInterval` inside a lambda — every invocation would spin a doomed loop. This is fixed in main but was likely the failure mode during the hackathon.
- `src/app/api/skill/route.ts` — calls `agentLoop.start()` locally when `WORKER_ADMIN_URL` is unset (`skillWrapper.ts:127-130`). Paying a 0.50 pieUSD micropayment to `/api/skill` with command "monitor" will, on a misconfigured Vercel-only deploy, start a lambda-scoped loop that dies within minutes.
- `src/app/api/health/route.ts` — calls `getLatestMetrics()` (DB hit) on every poll. Cheap but adds up.
- `src/app/api/events/broadcast/route.ts` — receives worker events. Fine in itself, but it's how the worker keeps the dashboard alive.

### 2.3 The Vercel/Railway split as implemented today

When configured per the README:
- Vercel runs Next.js: pages, API routes, SSE, dashboard, `/api/events/broadcast` receiver, `/api/skill` x402 endpoint.
- Railway runs `src/worker/index.ts` (tsx watch / runtime). Inside the worker: `agentLoop.start()`, `dailySummaryScheduler`, an admin HTTP server on `$PORT` with `/admin/{start,stop,trigger,status,close/:id}` routes.
- `realtimeService.broadcast()` is environment-aware: in `WORKER_MODE=true` it `POST`s the event to `WEB_BROADCAST_URL` instead of fanning out locally. The web's `/api/events/broadcast` validates the admin secret and broadcasts to local SSE clients.

This split is correct in principle. Three things keep it fragile:

1. **`realtimeService.forwardToWeb()` historically swallowed `response.ok = false`.** That was fixed in commit `0855a47` (it now logs but still doesn't retry). Web outage = lost events forever; no buffer.
2. **`workerStatusCache` is hydrated only on heartbeat broadcasts.** If the worker dies and Railway doesn't restart it, the dashboard will keep showing the last good snapshot until the cache TTL — there's no negative-state assertion.
3. **The worker's startup preflight still lists `BITQUERY_API_KEY` and `BITQUERY_WS_TOKEN` as required.** They're no longer used (the ingester switched to viem `getLogs` in commit `2ae3d86`). False warnings are a real operational hazard — they teach you to ignore the preflight.

### 2.4 Recommended migration path (worker on Railway, dashboard on Vercel)

This is essentially "deploy the existing worker as-is, confirm the env is right, kill the local fallbacks." Concrete steps:

1. Push current `main` to a Railway service pointing at `railway.worker.toml`. Set: `WORKER_MODE=true`, `WEB_BROADCAST_URL=https://neurodegen.xyz/api/events/broadcast`, `ADMIN_SECRET=<shared>`, all DB/RPC/DGrid/Privy keys, and `ENABLE_EXECUTION` / `DRY_RUN_MODE` per intent.
2. On Vercel, set `WORKER_ADMIN_URL=https://<railway-service-url>`. Confirm `/api/health` reports `workerStatusSource: "worker"`.
3. Delete (or feature-flag off) the in-process fallback in `PieverseSkillWrapper.handleMonitor`: if `WORKER_ADMIN_URL` is unset, return a 503 rather than calling `agentLoop.start()` inside the lambda. The current `skillWrapper.ts:127-130` behavior makes Vercel happily spawn a worker that dies inside a serverless invocation.
4. Drop `src/app/api/events/stream/route.ts` `maxDuration: 300` to the lowest you can tolerate, or move SSE entirely to a separate Railway service. Vercel SSE at 5-minute slots per client is a money pit.
5. Move `dailySummaryScheduler` ownership exclusively to the worker (already there) and ensure it isn't accidentally re-instantiated on web boot.
6. The `agentLoop` singleton in the web process should be unreachable in production. Either remove the import from web-only paths (`src/app/api/skill/route.ts`, `src/app/api/health/route.ts`) or guard with an explicit `process.env.WORKER_MODE !== 'true'` → throw.

---

## 3. Inference cost explosion

The cost model is broken. The DB has the receipts.

### 3.1 Per-cycle math from live data

Sampled 200 reasoning chains from 2026-04-22 → 2026-04-24 window (busy phase):
- **avg 6.1 model attempts per reasoning cycle** (sentiment + extraction + classification with retries/fallbacks)
- **avg 16,999 input tokens / cycle**
- **avg 773 output tokens / cycle**

Sampled 100 reasoning chains where `final_action.action != hold` (clean path, no fallback exhaustion):
- **avg 3.0 model attempts** (the canonical 1 sentiment + 1 extraction + 1 classification)
- **avg 11,014 input tokens / cycle**
- **avg 940 output tokens / cycle**

At canonical retail rates:
- Claude Sonnet 4.6 (sentiment): ~$0.011 in + $0.005 out = **$0.016 / cycle**
- GPT-4o (extraction): ~$0.011 in + $0.004 out = **$0.015 / cycle**
- DeepSeek v3.2 (classification): ~$0.003 in + $0.001 out = **$0.004 / cycle**
- **Happy-path total: ~$0.035 / cycle**

At cold-fallback throughput (6.1 attempts, 17k input tokens):
- Many failed DGrid attempts (no usage charge), some BYOK retries
- Real-world variance: 2–4× the happy-path cost when fallbacks fire
- **Stress-path total: ~$0.07–0.14 / cycle**

### 3.2 Frequency

- `MYX_POLL_INTERVAL_MS = 15000` (15s loop tick)
- `CLAUDE_CALL_FREQUENCY = 20` → full cognition every 20 ticks = **every 5 minutes**
- Theoretical daily cycles: 288 / day
- Observed daily cycles: ~200 in busy windows (some throttling / restarts), 0 once DGrid was exhausted

### 3.3 Daily cost projection

- Happy-path: 200 cycles × $0.035 = **$7 / day**
- Stress-path: 200 cycles × $0.10 = **$20 / day**
- User reported: $10 OAI + $5 Anthropic across 2 days = $7.50/day. Right inside the modelled band.

### 3.4 Where the cost is actually amplified

1. **Fallback retries amplify by 2× on the same model first.** `fallbackHandler.ts:165-175` does two consecutive DGrid Claude calls separated by `MODEL_RETRY_DELAY_MS=2000ms` before falling back. So a single transient DGrid hiccup = 2× the sentiment cost, even when the second one succeeds.
2. **`PREFER_BYOK_ROUTING=true` calls BYOK first, DGrid as backup.** When both work, you pay BYOK rates instead of free DGrid credits. This flag exists explicitly to drain BYOK on purpose — by design — but it's the highest-cost configuration.
3. **No input caching.** Every model call sends the full system prompt fresh. The sentiment system prompt alone is ~1.5KB (~400 tokens). At 100 cycles/day × 6 attempts × 400 tokens = **240k duplicate input tokens / day just for the system prompts**, paid every cycle.
4. **No result caching.** When metrics haven't changed materially (rare on Four.meme, common on `BTC/USDT` snapshot stream), the agent still re-runs the full pipeline. There is no `hash(inputs) → cached_decision` shortcut.
5. **Identical prompts on retry are not deduped at the provider level.** Anthropic prompt caching (`cache_control: { type: 'ephemeral' }`) is NOT used. OpenAI's automatic prompt caching only kicks in at ≥1024 tokens and only deduplicates the prefix — the user content (which changes every cycle) breaks the cache window.
6. **Failed cycles ALSO write a reasoning_chain row.** Out of 3,357 rows, **2,406 have a non-null `execution_result` but `executed=false`** — meaning the cycle ran to completion, paid for all model calls, but the final action was `hold` or rejected by a pre-execution check. **The classifier outputs `hold` 92.8% of the time.** That's $0.035 burned per `hold`-decision cycle, ~200 times a day = **~$6.50/day spent producing `hold` actions** that never trade.
7. **A single failing cycle in the test data hit 19 attempts** (live example from 2026-05-09 03:21). 19 attempts × ~190 input tokens × ($3–10/M) is small, BUT each attempt is a network round-trip eating wall-clock time and CPU. Sustained, this is when active CPU usage on Vercel/Railway explodes — not the LLM bill, the compute bill.

### 3.5 V2 cost-control architecture (recommended)

Ranked by ROI:

**1. Cache identical model outputs by `(systemPrompt, userContent)` hash.** Use Redis (Upstash on Vercel Marketplace) or Supabase with a short TTL (60–120s). The user content includes timestamp, so naive caching won't dedup — but you can canonicalize the user content (strip volatile fields like `eventId`, round timestamps to 60s buckets) before hashing. Expected hit rate on the `BTC/USDT/ETH` snapshot extraction: very high during quiet markets.

**2. Stop running cognition when metrics haven't materially changed.** A pre-cognition gate on `metricsHash != lastMetricsHash` will eliminate 50–80% of `hold`-decision cycles. The fact that 92.8% of cycles produce `hold` is a direct sign that the model is being asked to opine on noise. Cut the spend, not the signal.

**3. Switch sentiment to Claude Haiku 4.5 by default.** The fallback chain already lists `CLAUDE_FALLBACK_MODEL_ID = 'anthropic/claude-haiku-4.5'` as a backup. Make it the primary. Haiku is 3-5× cheaper, and the structured JSON output schema (`narrativeSummary`, `sentimentScore`, `confidenceLevel`, `flaggedPatterns`) is well within Haiku's capability. Reserve Sonnet for high-stakes confirmation passes.

**4. Switch extraction to GPT-4o-mini by default.** Already the fallback. Same logic.

**5. Move classification to a tiny local model or stay on DeepSeek/Qwen.** DeepSeek-v3.2 and Qwen-flash are already the cheap classifier slot. Don't fall back to GPT-4o here — that's a 20× cost amplification for a binary decision.

**6. Use Anthropic prompt caching.** The Claude system prompt is fixed-length and identical across all sentiment cycles. Wrap it with `cache_control: ephemeral` and you get ~90% input-token discount on every cycle after the first.

**7. Drop `MODEL_RETRY_DELAY_MS=2000` to 0 OR remove the same-model retry entirely.** If the first call failed, the second call to the same model 2s later isn't more likely to succeed — it just doubles the bill on transient errors. Skip to the next model in the chain.

**8. Cap cycle frequency by regime.** In `quiet` regime there's no edge to react to within 5 minutes — make it 20 minutes. The current code only modulates `positionSizeMultiplier` by regime, not cycle frequency. Doing this halves the daily LLM bill in quiet markets.

**9. Don't write reasoning_chain rows when nothing changed.** Right now the table is at 3,357 rows after 18 days. At full cadence over a year that's ~70k rows. Most of them are duplicates. Supabase rows are cheap, but the storage compounds (each row has the full `model_calls` array with raw text — that's the bulk of your DB cost).

**10. Hard kill switch on daily LLM spend.** A Redis counter incremented per call; once it crosses a threshold, the agent gates to `hold` for the rest of the day. The fact that DGrid credits were silently exhausted and the agent kept ticking is the worst kind of cost failure — invisible until it shows up on a card statement.

---

## 4. The Pieverse and copy-trade layers

### 4.1 Pieverse x402 endpoint — real but thin

`src/lib/services/monetization/paymentHandler.ts:81-132` does the right thing:
- Receives `X-Payment-Proof` header containing a tx hash.
- Calls `publicClient.getTransactionReceipt({ hash })` — real BSC chain read.
- Iterates logs looking for a `Transfer` event on the pieUSD contract (`0x0e63b9c287e32a05e6b9ab8ee8df88a2760225a9`, decimals=6) where `to == PIEVERSE_REVENUE_ADDRESS` and `value >= priceToSmallestUnit(MONITOR_PRICE_PIEUSD_PER_HOUR)`.
- Returns valid/invalid with payer + amount.

**No mock anywhere.** No HMAC stub left over. This is on-chain settlement verification.

But it's **replayable** — there is no nonce, no `consumedAt` write to DB, no rate limit. The same tx hash can be POSTed forever and verification will keep succeeding. Anyone who pays once can monitor forever — or share their proof with others.

Also: the "monitor for an hour" claim in `SKILL.md` is **product-contract drift**. `skillWrapper.ts:117-131` (`handleMonitor`) starts a global agent loop if `WORKER_ADMIN_URL` is set, or a local one if not. It does not:
- record this user's entitlement window
- bind the resulting feed to the payer's wallet
- expire access after an hour
- prevent the next caller from "starting" an already-running monitor (it returns "Monitoring already active")

What literally happens when a user pays 0.50 pieUSD right now and sends `monitor`:
1. Their tx is verified on-chain (real settlement).
2. `agentLoop.start()` is called against the worker (or locally, fallback).
3. The agent loop is either already running (idempotent no-op) or starts now.
4. The user gets back `Monitoring active on the live worker.`
5. The agent's public realtime stream (SSE) is the only delivered value — and it's already public to anyone reading `/api/events/stream` without payment.

So the user paid for an idempotent worker-start, not for anything monitor-specific. **The paid endpoint accepts money for a side effect that was already free to trigger via `/api/agent/start` with the admin secret, or by waiting for the worker to be up.** From an audit standpoint: not fraud, but the manifest claim ("monitor your positions for an hour") doesn't match what the code delivers.

### 4.2 Copy-trade mirror — partial implementation, blocked by Privy signing

`mirrorDispatcher.ts` exists and is wired. The flow is:
1. `ExecutionGateway.executeAction` triggers `mirrorDispatcher.onAgentEntry(positionState, recommendation)`.
2. The dispatcher fetches active subscriptions (`getActiveSubscriptions`), sizes the mirror for each via `sizeMirrorForUser` (`copyTradeSizing.ts`), and for each eligible user:
   - Builds a `MyxClient` using the user's Privy embedded wallet (`buildUserMyxClient` → `buildUserWalletClient` → `buildPrivyViemAccount` with `authorizationContext` carrying `PRIVY_AUTH_PRIVATE_KEY`).
   - Submits an increase order via `TransactionSubmitter.submitIncreaseOrder`.
   - Inserts a `user_positions` row.

This is real code, not scaffolding. **But.** Live `user_positions` data (3 rows):

```
user_position_id                       status   skip_reason                             opened_at
7edd59f0-ca13-42c8-8790-00be349083b3   skipped  confidence_below_user_threshold(0.3)    2026-04-23 08:09
8f62c5cf-fbdf-4b6e-949d-9f92ca4b1efc   skipped  privy_signing_mismatch                  2026-04-23 11:10
6da28e3e-7ca0-45b4-891b-8eca6c92cd7e   skipped  privy_signing_mismatch                  2026-04-23 11:10
```

**Three subscriptions, zero successful mirrors.** Two failed with `privy_signing_mismatch` — that's the `NotOrderOwner` revert from MYX, raised when the Privy server-side signer signs the tx from a wallet that isn't the position owner. Commit `442e474` (2026-04-22) acknowledged this and started swallowing it as a "skip" instead of "fail" to silence log spam, but the fix was just to stop logging — **the actual signing mismatch was never solved**.

Why this fails: `buildPrivyViemAccount` constructs a `LocalAccount` using `createViemAccount(privyClient, { walletId, address, authorizationContext })`. The Privy auth context is loaded from `PRIVY_AUTH_PRIVATE_KEY` (the app's authorization key). This should sign from the user's embedded wallet. The fact that MYX reverts with `NotOrderOwner` means MYX sees the tx-sender (`tx.origin`) as some address that is NOT the position-owning address. Possible causes:
- The Privy embedded wallet's actual on-chain address differs from `user.walletAddress` stored in DB (most likely — `users.wallet_address` may be set from `verifiedClaims.wallet_address`, but the wallet that gets created could be a different one or be on the wrong chain).
- The `authorizationContext` is being applied but the signed payload's `from` doesn't match the `address` in `createViemAccount` config.
- The MYX SDK is recording the position under the user wallet but submitting the tx via the agent wallet (sharedclient leak — `userClients` map in `userMyxClient.ts:33` caches MyxClient instances, but if the agent's client and a user's client both write to the same singleton elsewhere, they collide).

**Session keys provisioned in DB:** 3 subscriptions, 1 `telegram_subscription` row, 3 users. So the onboarding flow does reach the point of recording subscriptions, but no mirror has ever actually executed. The Privy-based mirror system is **scaffolding that consistently fails at the signing boundary**. The integration is real; the integration result is broken.

### 4.3 Summary for §4

| Claim in AGENT_PROGRESS.md | Reality |
|---|---|
| "Pieverse x402 endpoint live" | True. Real chain verification, no mock. |
| "On-chain payment verification" | True. Working. |
| "Payment is bound to a session" | False. Payment proof is replayable. |
| "Monitor for an hour" | False. No leasing logic. |
| "Copy-trade live" | False in practice. 0 successful mirrors out of 3 subscribers. Every mirror attempt has failed at the Privy signing boundary. |
| "Session keys provisioned" | True at DB level (`session_signer_granted` column exists and is set). False at execution level (signer signs wrong-address). |

---

## 5. What is genuinely production-ready vs. demo-ready

File-by-file, in the convention defined in the prompt. Evidence in each row.

### src/lib/services/

| Module | Class | Reason |
|---|---|---|
| `agentLoop.ts` | **DEMO READY** | Works in long-lived worker process. Will not survive a stuck `managed` position (sec §1.2e). No re-entrancy guard if `runSingleCycle` and the interval fire concurrently. Worker-only by design — calling from web fails after `ENABLE_EXECUTION` check or wallet client init. |
| `attestationReader.ts` | **PRODUCTION READY** | Narrow scope (read events ± window of blocks), correctly uses `logsPublicClient` against dRPC. |
| `realtimeService.ts` | **DEMO READY** | Worker-to-web forwarding silently drops events on non-2xx (now logs since `0855a47`, still no retry/buffer). Local fanout is fine. |
| `workerAdminProxy.ts` | **PRODUCTION READY** | Clear error codes, 15s timeout, abort signal. Reasonable. |
| `workerStatusCache.ts` | **DEMO READY** | No TTL invalidation, no negative state — relies on worker heartbeats. If worker dies, cache lies. |
| `attestationHistory.ts` | not reviewed in detail — assume DEMO until verified |
| `cognition/reasoningOrchestrator.ts` | **PRODUCTION READY** | Solid Promise.all dispatch, safe parse with sane fallbacks. |
| `cognition/fallbackHandler.ts` | **DEMO READY** | Works, but the chain produces cost amplification (sec §3.4) and never fails fast on a known-exhausted DGrid quota. The `shouldStopDgrid` heuristic is fragile (string matching error messages). |
| `cognition/regimeClassifier.ts` | **BROKEN** | `active` regime threshold (5–20 launches/hr AND 2–10 BNB/hr) is non-monotonic with `retail_frenzy` (≥ 20 OR ≥ 10 OR ≥ 2 graduations/hr). The OR clauses in retail_frenzy mean any one of three thresholds being modest (≥ 2 graduations/hr is trivial on Four.meme) lifts the whole metric out of "active." Live evidence: 0 `active`, 0 `volatile`, 0 `cool` over 18 days. Two of four regimes never fire, and `volatile` only fires when funding trends flip — which depends on the `previousFundingTrends` map being warm, which it never is after a worker restart. |
| `cognition/reasoningGraphBuilder.ts` | **DEMO READY** | The probe-override logic (`deriveProbeOverride`) is undocumented in any spec or README. It overrides a model's `hold` decision with a synthetic `open_long`/`open_short` at 0.28–0.35 confidence based on extraction feature totals + sentiment thresholds. Lives in production code with no test coverage. Aggregates ~6% of all action decisions per live data. |
| `execution/executionGateway.ts` | **DEMO READY** | Order submission path works. Lifecycle path (close, P&L, exit attestation) has 4 of the bugs in §1. |
| `execution/executionFactory.ts` | **PRODUCTION READY** | Simple wiring; no logic. |
| `execution/preExecutionChecker.ts` | **DEMO READY** | Aggregates 6 checks + risk manager. Race condition: `walletFunds` is fetched once, then both `resolveExecutableCollateralUsd` and `riskManagerCheck` use it — but `getDailyRealizedLoss()` is fetched inside `riskManagerCheck`. Two reads, one race window. |
| `execution/preExecutionChecks.ts` | **DEMO READY** | `oracleDivergenceCheck` was extended to allow `myx_last` as a reference price source — this means if Pyth is down AND MYX index is unavailable, the gate falls back to MYX's own last-traded price, which is **the same price we're about to trade at**. Net effect: divergence is always zero in that branch, gate passes by construction. This was added in commit `922d7a1` ("extend oracleDivergenceCheck to include 'myx_last'") — that's a gate bypass dressed up as a fallback. |
| `execution/myxOrderBuilder.ts` | **DEMO READY** | Decimal scaling fixed in commit `09c29a9`. Slippage encoding fixed in `d303a96`. `positionId: ''` reliance on SDK dispatch is fragile but currently correct. |
| `execution/myxOrderBuilder.test.ts` | **PRODUCTION READY** | Test exists, asserts BigInt encoding. |
| `execution/transactionSubmitter.ts` | **BROKEN** | `orderId: null` on success. No way for downstream code to know the real MYX order ID. Dry-run path returns synthetic `0x000...` tx hash that is then written into DB and into attestation reveal — those dry-run rows are uncatchable forensically because the synthetic hash is not unique. |
| `execution/positionTracker.ts` | **BROKEN** | Lifecycle tracking effectively disabled in hot loop (sec §1.2c-d). `reconcileOnBoot` is the only recovery path. |
| `execution/riskManager.ts` | **DEMO READY** | Logic is OK but `PER_POSITION_SIZE_CAP_USD` is compared against `proposedCollateralUsd`, not the leveraged notional. The old AUDIT.md flagged this as "comparing notional to collateral cap" — that specific concern is now `false`. Cap is correctly applied to collateral. |
| `execution/attestationEmitter.ts` | **PRODUCTION READY** | Each method properly typed and bounded. Fire-and-forget pattern at caller side. |
| `execution/orderContext.ts` | **PRODUCTION READY** | Trivial. |
| `perception/fourMemeIngester.ts` | **PRODUCTION READY** | Solid: backoff, chunked getLogs, provider-aware range adjustment, three event types decoded. |
| `perception/myxMarketPoller.ts` | **PRODUCTION READY** | Reasonable. |
| `perception/aggregatorService.ts` | **DEMO READY** | Funding trend direction is computed but the `previousFundingTrends` state lives in `RegimeClassifier`, not here — and `RegimeClassifier` is instantiated multiple times (once in `agentLoop` constructor, once inline in `executeGraph` for parameter lookup at `agentLoop.ts:202`). That second instance has an empty `previousFundingTrends` map every time → `isVolatile()` returns false → `volatile` regime never fires from `executeGraph`'s path. |
| `perception/eventNormalizer.ts` | **SCAFFOLDING** | Old AUDIT flagged this; commit `677ddf1` updated the ABI but the file still doesn't match the live ingester's decode path. The failing vitest case lives here. Real ingestion happens in `fourMemeIngester.decodeLog`. |
| `perception/coldStorageWriter.ts` | not reviewed in detail |
| `monetization/skillWrapper.ts` | **DEMO READY** | Functional but `handleMonitor` is mis-aligned with the manifest claim (sec §4.1). |
| `monetization/paymentHandler.ts` | **DEMO READY** | Real chain verification. Replayable (sec §4.1). |
| `monetization/mirrorDispatcher.ts` | **BROKEN** | 100% mirror failure rate in live data due to `privy_signing_mismatch` (sec §4.2). |
| `monetization/mirrorExit.ts` | **DEMO READY** | Has the same Privy signing path; will fail for the same reason once a mirror actually opens. |
| `monetization/userMyxClient.ts` | **DEMO READY** | The `userClients` cache map has no eviction. With many concurrent users this leaks SDK clients. |
| `monetization/copyTradeSizing.ts` | **PRODUCTION READY** | Pure function, all branches return a coherent shape. |
| `notifications/formatters.ts` | **PRODUCTION READY** | Pure formatters. |
| `notifications/dispatcher.ts` | not reviewed in detail |
| `notifications/dailySummary.ts` | **DEMO READY** | Summarizes from `realized_pnl_usd` — which is always NULL (sec §1). The daily summary will always show 0 P&L. |
| `telegram/botHandlers.ts` | **DEMO READY** | grammY wiring is correct. The webhook secret is enforced. |

### src/app/api/

| Route | Class | Reason |
|---|---|---|
| `agent/start` | **PRODUCTION READY** | Pure proxy. |
| `agent/stop` | **PRODUCTION READY** | Pure proxy. |
| `agent/trigger` | **DEMO READY** | Proxy works. Old behavior (web-only) was broken — fixed in `f1ed338`. |
| `agent/status` | **DEMO READY** | Has local + worker fallback. |
| `agent/close/[positionId]` | **PRODUCTION READY** | Pure proxy. |
| `auth/session` | not reviewed in detail |
| `auth/logout` | not reviewed in detail |
| `events/stream` | **DEMO READY** | The Vercel SSE pattern is fragile; works for short demo windows. `maxDuration: 300` is a cost trap on production. |
| `events/broadcast` | **PRODUCTION READY** | Admin-secret-gated, schema-validated. |
| `health` | **DEMO READY** | Logic correct, but exposes whether each piece of state is healthy without rate limiting. |
| `me` (and sub-routes) | not reviewed in detail |
| `positions` | not reviewed in detail |
| `reasoning` | not reviewed in detail |
| `reasoning/[id]` | not reviewed in detail |
| `skill` | **DEMO READY** | Works. Manifest mismatch + replay risk (sec §4.1). |
| `telegram/webhook` | not reviewed in detail |

### Where the "no stubs, no placeholders, no TODOs" rule was silently violated

1. `positionTracker.ts:65-72` — Marked `managed` immediately, with a comment that says SDK polling is "broken." This is not a stub but it is **a known-incorrect short-circuit** dressed as design.
2. `preExecutionChecks.ts:64-69` — `myx_last` fallback. Allows the divergence gate to pass on the very price the trade is about to execute at. Effectively disables the gate when both Pyth and MYX index are unavailable.
3. `reasoningGraphBuilder.ts:133-196` — Probe-override logic injects synthetic trade signals overriding the classifier's `hold`. This is the load-bearing path for ~6% of all actions but is not documented anywhere outside the source.
4. `transactionSubmitter.ts:43-48` — `orderId: null` hard-coded with no comment. The downstream attestation reveal hashes the local UUID instead.
5. `mirrorDispatcher.ts:77-79` — `NotOrderOwner` silently swallowed as `privy_signing_mismatch`. The actual signing mismatch is unresolved.
6. `regimeClassifier.ts` — `active` and `cool` regimes are dead code (never reached in 18 days of live operation).
7. `dailySummary.ts:42-65` — Summarizes P&L from a field (`realized_pnl_usd`) the codebase never writes.

---

## 6. The attestation contract

`contracts/NeurodegenAttestation.sol` at `0xe21f5ebec3f098c744c1e35db0c9338d6b717dc4` on BSC mainnet. Verified on BscScan per AGENT_PROGRESS.

### 6.1 Commit-reveal pattern — is it real?

Yes. Two distinct events, two distinct functions, called in two distinct transactions:

- `commitReasoning(reasoningHash, actionIntent)` — fires `ReasoningCommitted`. Called at `executionGateway.ts:142`, **before** `submitter.submitIncreaseOrder`. The call is awaited (via `attestationEmitter.commitReasoning` which `waitForTransactionReceipt`s).
- `revealExecution(reasoningHash, myxTxHash, orderId)` — fires `ExecutionRevealed`. Called at `executionGateway.ts:184`, fire-and-forget (`void`).

So the chain-of-custody chronology is real: commit lands first, then the MYX tx, then the reveal. A third party can reconstruct this from logs.

### 6.2 Is the `reasoningHash` deterministic?

`src/lib/utils/reasoningHash.ts`:
- Canonicalize via `sortObject` (recursive deep sort by key).
- Serialize via `JSON.stringify` with a BigInt replacer.
- `keccak256(stringToBytes(canonical))`.

Mathematically deterministic. **But:** the reasoning graph contains `modelCalls[].latencyMs`, `modelCalls[].timestamp`, `modelCalls[].rawOutput`, etc. These are observation outputs — a third party can't recompute the hash from inputs alone, because the inputs include `Date.now()` and provider response text. The verification model is "you trust the DB row, recompute its hash, compare to the on-chain hash" — which is what the `/proof/[txHash]` page does.

This is fine for "the agent committed to a specific reasoning artifact" verification, but it is not a "third party can reproduce the decision" verification. Those are different claims; the `/proof` page does the first correctly.

### 6.3 Contract is event-only (no state)

`agent` is the only state variable (immutable). Everything else is `emit`. Confirmed.

Gas implications: every `emit` is cheap (around 20–30k gas for a topic-only event). For 7 trades, the commit and reveal events together cost roughly 60–80k gas per trade × 2 events = 120–160k gas/trade pair. At BSC's ~1 gwei × $660 BNB = roughly $0.10 per commit-reveal pair. Negligible.

### 6.4 Per-trade cost (rough)

- `commitReasoning` (writeContract + await receipt): ~60k gas
- `revealExecution` (writeContract + await receipt): ~60k gas
- `attestPositionOpen` (writeContract + await receipt): ~70k gas
- `attestPositionClose` (writeContract + await receipt): ~70k gas

So a full open-then-close cycle emits 4 attestation events totaling ~260k gas ≈ $0.17 per round-trip on BSC. Not a cost concern.

### 6.5 What V2 should change at the contract level

1. **Persist a minimal index on-chain.** Right now there's no way to enumerate "all commits by this agent" without scanning blocks. Add `mapping(bytes32 => uint256) public commitBlock` so an indexer can `eth_call` rather than `eth_getLogs`. Cheap because `bytes32 → uint256` is one storage slot, and only the commit happens before the trade is decided.
2. **Bind the reveal to a non-zero `orderId`.** Right now `orderId` is hashed from the local UUID — useless. Make `revealExecution` `revert`s if `orderId == bytes32(0)` to force the agent to extract a real MYX order ID before revealing. (This is upstream of the contract — the SDK needs to return the order ID first — but the contract can enforce the discipline.)
3. **Add a `revertReasoning(bytes32 reasoningHash, bytes32 revertReason)` function.** When a trade is rejected by pre-execution checks (currently 92.8% of cycles are `hold` plus the explicit reject path), the agent should still emit a "we considered this but rejected it" event. Cheap, and it closes the inference-cost transparency gap from §3.
4. **Make `agent` upgradable** by introducing a 2-of-2 multisig or a timelocked transfer. Right now if `NEURODEGEN_AGENT_PRIVATE_KEY` is rotated, the contract becomes unusable — you have to redeploy.
5. **Consider EIP-712 typed signatures** for off-chain proof composition. The agent could sign a structured attestation that anyone can verify without an on-chain tx, for the high-frequency case.

---

## 7. Data we actually collected during V1

### 7.1 Live counts (production Supabase, 2026-05-18)

| Table | Rows |
|---|---|
| `events` | **357,156** |
| `metrics` | **52,686** |
| `reasoning_chains` | **3,357** |
| `positions` | **7** |
| `user_positions` | **3** (all status=skipped) |
| `users` | 3 |
| `subscriptions` | 3 |
| `telegram_subscriptions` | 1 |
| `notifications_log` | 68 |

### 7.2 Funnel

| Step | Count | Conversion |
|---|---|---|
| Reasoning chains generated | 3,357 | — |
| Non-hold action decisions | 243 (`open_long` + `open_short` + `close_position`) | 7.2% |
| `execution_result.executed = true` | 7 | 0.21% overall, 2.9% of non-hold |
| Positions inserted | 7 | matches |
| Positions closed | 6 | 85.7% (all via `external_close`) |
| Positions with realized P&L | **0** | 0% — the column is NULL on every closed row |

### 7.3 The only ground truth

There are 7 entry tx hashes. Every closed position's exit happened keeper-side. Realized P&L was never written back to DB. So the questions "did the strategy make money" / "does the strategy have edge" are **unanswerable from the current data alone**.

To answer them, you need to do a one-shot backfill: for each entry tx hash, find the corresponding MYX `close` event on-chain (keeper-emitted), extract the exit price + collateral returned + funding paid, compute realized P&L, write back to the `positions` table. The MYX `positionId` (the real one, not the local UUID) is the key — it appears in the increase tx's logs but is currently dropped.

### 7.4 SQL to extract every proto-trading-decision for manual backtest

This pulls every non-hold reasoning chain along with the action, regime, pair, and confidence, joined to any position that actually opened. Save the output, run it against historical price data, compute hypothetical P&L per signal:

```sql
SELECT
  rc.graph_id,
  rc.created_at,
  rc.regime,
  (rc.final_action ->> 'action')                   AS action,
  (rc.final_action ->> 'pair')                     AS pair,
  (rc.final_action ->> 'confidence')::float        AS confidence,
  (rc.final_action ->> 'positionSizeUSD')::float   AS proposed_collateral_usd,
  (rc.final_action ->> 'leverageMultiplier')::float AS proposed_leverage,
  (rc.final_action ->> 'tpPercentage')::float      AS tp_pct,
  (rc.final_action ->> 'slPercentage')::float      AS sl_pct,
  (rc.final_action ->> 'rationale')                AS rationale,
  (rc.execution_result ->> 'executed')::boolean    AS executed,
  (rc.execution_result ->> 'txHash')               AS entry_tx_hash,
  (rc.execution_result ->> 'failureReason')        AS exec_failure_reason,
  p.entry_price,
  p.exit_price,
  p.opened_at  AS position_opened_at,
  p.closed_at  AS position_closed_at,
  p.status     AS position_status,
  p.exit_reason
FROM neurodegen.reasoning_chains rc
LEFT JOIN neurodegen.positions p
  ON p.reasoning_graph_id = rc.graph_id
WHERE rc.final_action ->> 'action' IN ('open_long', 'open_short')
ORDER BY rc.created_at ASC;
```

Expected: 224 rows (223 longs + 1 short). 7 will have populated position columns, 217 will have NULL for the position join (rejected by risk manager / collateral check / max-concurrent).

For each non-executed row: take `pair`, `confidence`, `created_at`, the proposed TP/SL. Use a BSC price oracle (Pyth historical or Binance kline at the timestamp) to simulate what would have happened. The "would have" P&L is your shadow-trading record. That's the only edge signal V1 produced.

For the 7 real trades: you need to go on-chain. For each entry tx hash, fetch the receipt, decode MYX logs to find the position ID, then query MYX REST (`/v2/position/{id}/closures`) or scan keeper-emitted close events on the MYX execution router. With 7 trades and known entry tx hashes, this is a 1-hour script — and it gives you actual P&L for the only money the agent ever moved.

---

## 8. What V2 must change at the architecture level

Ten things, ranked by impact on "actually being a real product that makes money." Not features — architectures.

1. **Decouple cognition cadence from execution cadence.** Right now `agentLoop.runCycle` runs both perception aggregation and (every 20 ticks) cognition + execution in the same setInterval. Move cognition to an event-triggered worker: only invoke it when `metricsHash` materially changes, or when an MYX `funding_rate` snapshot indicates regime change, or when a position is open and needs reevaluation. Eliminates ~80% of `hold`-decision cycles (sec §3.4.6), the single biggest cost line.

2. **Make position lifecycle event-driven, not poll-driven.** Subscribe to MYX keeper close events via WebSocket (or `eth_subscribe` against the MYX execution router). When a position closes on-chain — for our agent wallet OR for any user wallet under mirror management — write the close back to DB immediately with exit price + realized P&L + exit tx hash. Kills the `external_close` ghost-trade problem (sec §1.2c-d), the `realized_pnl_usd: null` problem (sec §7.3), and the stuck-managed-position-blocks-entries problem (sec §1.2e).

3. **Add a paper-trading mode that runs the full pipeline through to "would-have-submitted" and records the synthetic fill against live price data.** `ENABLE_EXECUTION=false` is the current paper mode, but it stops at the wallet client init. A real paper mode runs through `buildIncreaseOrderParams` + `preExecutionChecker.runChecks` + simulated fill at current oracle price + simulated TP/SL hit detection against live prices. Two outcomes: (a) you can run the agent for a week before risking real money and see if the strategy works; (b) every cycle becomes a backtestable row.

4. **Cache LLM outputs by canonical-input hash with 60–120s TTL.** Three big wins: (a) cuts ~50% of LLM spend during quiet markets, (b) makes the system idempotent during retries, (c) enables instant reproducibility for proof generation. Redis (Upstash on Vercel Marketplace) is the right host — it's cross-instance and works for both the worker and the web SSE forwarder.

5. **Stop running cognition when the regime classifier is broken.** `active`, `volatile`, `cool` never fire (sec §5/regimeClassifier). Fix the thresholds: replace OR-chain in `isRetailFrenzy` with a proper sigmoid/score function, and persist `previousFundingTrends` across worker restarts (in DB or Redis). Until then, the agent is choosing between exactly 2 regimes both of which are saturated — there's no real regime signal.

6. **Move the LLM cost-amplification fallback chain to a structured budget.** Replace `fallbackHandler.ts` with a single chain function that takes `{ budgetTokensIn, budgetTokensOut, models: ['cheap', 'mid', 'premium'] }` and tries each model in order, hard-capping per-cycle spend. The existing `shouldStopDgrid` heuristic is string-matching errors; that's not a budget, it's a guess.

7. **Solve the Privy signing mismatch or scrap the copy-trade layer.** Mirror is 0% successful. Either (a) audit `buildPrivyViemAccount` against the actual on-chain submitting address for each user, fix the mismatch, prove a successful mirror in a clean test, and re-enable; or (b) replace Privy with a different embedded wallet (e.g. Smart Wallets via Coinbase Account Kit, or a simpler "user signs each trade in their own UI" model that doesn't try to be server-side-autonomous). The "session signer mirror" idea is architecturally sound; the implementation is broken in production for unknown reasons. This is a fork-in-the-road decision.

8. **Make the Pieverse x402 endpoint a real session-lease.** When verification succeeds, write `(payer, txHash, expiresAt, monitorScope)` into a `paid_sessions` table; check the table on every subsequent call; reject if `expired` or `txHash` already consumed for a different payer. Otherwise the paid endpoint is a costume — it accepts money but delivers nothing the unauthenticated endpoint doesn't already deliver (sec §4.1).

9. **Move the agent off `agentLoop` as a singleton and into a queue-driven actor model.** Current state: one `setInterval`, one in-memory `hotState`, one `RegimeClassifier` instance that gets bypassed when re-instantiated (sec §5/aggregatorService). For V2 with multiple agents, multiple pairs, or multiple regime variants: each becomes a row in a `jobs` table, the worker drains them serially with deduplication. Vercel Queues (public beta) is built for this; Inngest / Trigger.dev / a thin Redis Streams setup all work. The killer benefit: you can run a paper agent and a live agent side-by-side without code duplication.

10. **Hard cost gate + observability dashboard.** Per-day LLM spend counter in Redis, per-cycle increment, hard kill at $N. Surface it on `/api/health`. The fact that V1 ran for 16 days emitting only `hold` decisions because DGrid silently exhausted, while the SDK kept getting called and the dashboard kept showing "agent RUNNING" — that's the worst class of production failure. You need a tripwire and a single visible number that tells you whether the agent is actually thinking right now or going through the motions on a dead pipeline.

---

## Confidence notes

- All numerical claims about reasoning_chains, positions, user_positions, regime distribution, action distribution, model call counts, and token counts are live-read from the production Supabase database via service-role REST API as of 2026-05-18.
- Tx receipt verification for `0x466859a2…` and `0xc4a4b315…` was done against `https://bsc.drpc.org`. Receipts confirm status=success, from = agent wallet, to = MYX router, USDT logs present. The framing "no orders fill" is therefore incorrect.
- The execution-bug findings (orderId null, position tracker disabled, external_close ghost, stuck managed blocks entries, networkFee shape coerce, oracle gate bypass) are all code-level inferences from current files in `main`, cross-referenced against commit history through `442e474`.
- File-by-file production-readiness ratings are based on direct read of each file. Where listed as "not reviewed in detail," I read enough to know the file exists and behaves at first glance, but did not trace every code path.
- Cost-amplification analysis uses canonical retail rates as of January 2026. If the user is on DGrid free credits, the *cash* cost is 0; the structural cost (token volume and call count) is the same.
- The "1 stuck managed position blocks subsequent entries" is the operational state of the production DB right now. The agent can be restarted and `reconcileOnBoot` will probably mark that position closed, but at that point the next probe-override will still want to enter and the question becomes whether the lifecycle works the *next* time.
