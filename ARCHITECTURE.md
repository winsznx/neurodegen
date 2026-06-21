# Architecture

> NeuroDegen V2 is an investment-committee trading agent on BNB Smart Chain. This document maps every claim in the [README](README.md) to a specific file:line so a judge - human or AI - can audit the system end-to-end without trusting any narrative.

## One-paragraph summary

A Node.js worker (`src/worker/index.ts`) runs an agent loop that ingests CMC Agent Hub data, deliberates via a three-LLM committee, signs trades through the **Trust Wallet Agent Kit (TWAK) CLI** - the sole signing path - and emits an immutable attestation trail across **three on-chain rails**: the V1 AttestationEmitter (commit-reveal of reasoning), ERC-8183 (per-decision agentic commerce), and ERC-8004 (agent identity). The Next.js web service serves read-only spectator surfaces and exposes the inbound x402 micropayment API. Both services run on Railway. Postgres (Supabase) is the cold-storage spine.

## The three on-chain rails

Every executed committee decision produces records on **three independent contracts** so an external verifier can cross-check the same trade three different ways from BscScan alone.

### Rail 1 - V1 AttestationEmitter (`0xe21f5ebec3f098c744c1e35db0c9338d6b717dc4`)

The V2 worker emits five event families to the V1 contract via [src/lib/services/execution/attestationEmitter.ts](src/lib/services/execution/attestationEmitter.ts):

| Event | Emitted by | When |
|---|---|---|
| `commitReasoning(reasoningHash, actionIntent)` | `attestationEmitter.commitReasoning()` :34-59 | **Before** the TWAK swap |
| `revealExecution(reasoningHash, twakTxHash, orderId)` | `attestationEmitter.revealExecution()` :61-86 | **After** BSC confirmation |
| `attestPositionOpen` / `attestPositionClose` | :88-144 | On position lifecycle |
| `attestRegimeChange` | :146-171 | On regime transition |

The contract is **reused as-is from V1**. The contract source treats the third arg of `revealExecution` as `bytes32 myxTxHash` for historical reasons; V2 writes the TWAK tx hash into the same byte slot. The richer V2 contract source (with `LiquidityIn`, `LiquidityOut`, `CoLaunch`, `MandateAttested` events) ships at [contracts/NeurodegenAttestationV2.sol](contracts/NeurodegenAttestationV2.sol) for review but is **not deployed before the 06/28 live trading window** to avoid pre-comp deploy risk.

### Rail 2 - ERC-8004 Identity (`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`)

[src/lib/services/bnbAgentRegistration.ts](src/lib/services/bnbAgentRegistration.ts) calls `twak erc8004 register` at boot with a `data:application/json;base64,…` agent card. Idempotent via `worker_state` (key `bnb_erc8004_registration_v1`). Persisted `agentId` is surfaced on `/api/health → diagnostics.bnbAgentSdk.erc8004.registration`.

### Rail 3 - ERC-8183 Agentic Commerce (`0xea4daa3100a767e86fded867729ae7446476eba6`)

[src/lib/services/agenticCommerce.ts](src/lib/services/agenticCommerce.ts) wraps every **executed** committee decision as a four-step self-employed job. The agent's TWAK wallet is both client and provider.

| Step | TWAK call | File:line |
|---|---|---|
| create | `twak erc8183 create-job` | :228 |
| set-budget | `twak erc8183 set-budget` | :244 |
| fund | `twak erc8183 fund` | :257 |
| submit | `twak erc8183 submit` (deliverable bytes32) | :278 |

`JobFunded` is the on-chain **liquidity-in** event for the decision. `PaymentReleased` (after the 7-day OptimisticPolicy dispute window) is the on-chain **liquidity-out** event. Co-launch is the same lifecycle with a different `provider` address - natively supported by the canonical commerce contract; no new deploy required.

The `DeliverableManifest` is a canonical JSON of `{reasoningHash, twakTxHash, attestationCommitTx, attestationRevealTx, action, confidence, executedAt}`. Its keccak hash is what gets committed as `bytes32 deliverable` - recomputable from the persisted session row.

## Layer source map

| Layer | Entry point | Called from |
|---|---|---|
| Perception | [src/lib/services/perception/cmcIngester.ts](src/lib/services/perception/cmcIngester.ts) | `agentLoop.start()` |
| Cognition | [src/lib/services/cognition/committeeSession.ts](src/lib/services/cognition/committeeSession.ts) | `agentLoop.runCycle()` :333 |
| Execution | [src/lib/services/execution/twakExecutor.ts](src/lib/services/execution/twakExecutor.ts) | `agentLoop.runCycle()` :424 |
| Attestation | [src/lib/services/execution/attestationEmitter.ts](src/lib/services/execution/attestationEmitter.ts) | `twakExecutor.execute()` :110, :135 |
| Commerce | [src/lib/services/agenticCommerce.ts](src/lib/services/agenticCommerce.ts) | `agentLoop.runCycle()` :473 (fire-and-forget) |
| Monetization | [src/app/api/x402/session/[id]/route.ts](src/app/api/x402/session/[id]/route.ts) | inbound HTTP |
| Identity | [src/lib/services/bnbAgentRegistration.ts](src/lib/services/bnbAgentRegistration.ts) | `worker/index.ts` boot |
| Competition | [src/lib/services/competitionRegistration.ts](src/lib/services/competitionRegistration.ts) | `worker/index.ts` boot |

## Async / concurrency patterns

The worker is single-threaded Node. We treat any state outside the cycle's stack as suspect.

- **Re-entrancy guard.** [`agentLoop.ts:86`](src/lib/services/agentLoop.ts#L86) declares `private cycleInFlight = false`. Checked at :250, wrapped in `try/finally` with cleanup at :515.  A slow cycle (LLM latency, chain congestion) cannot overlap with the timer-driven next tick.
- **Fire-and-forget commerce.** [`agentLoop.ts:473`](src/lib/services/agentLoop.ts#L473) calls `void runCommerceJobForSession(...).then(log).catch(log)`. ERC-8183 latency never blocks the next decision.
- **Promise.allSettled committee.** [`committeeSession.ts:58`](src/lib/services/cognition/committeeSession.ts#L58) - one failing analyst falls back to a synthetic neutral; both failing still produces a session that the risk classifier will force to hold.
- **Atomic insert collision retry.** [`committeeSession.ts:91-127`](src/lib/services/cognition/committeeSession.ts#L91-L127) - when two concurrent cycles both pick the same `sessionNumber`, the second catches `SessionNumberCollisionError`, **rebuilds** the session (recomputes the reasoning hash) and retries. The hash and the row stay in sync.
- **SSE bridge.** Worker emits via [`realtimeService.broadcast()`](src/lib/services/realtimeService.ts) which forwards to the web service via an admin-signed HTTP POST ([`realtimeService.ts:58 forwardToWeb`](src/lib/services/realtimeService.ts#L58)). The web service fans out to connected browsers.

## Restart-safe state (`worker_state`)

Three singletons survive worker restarts via the [`worker_state`](supabase/migrations/006_worker_state.sql) table:

| Key | Owner | Purpose |
|---|---|---|
| `competition_registration_v1` | [`competitionRegistration.ts`](src/lib/services/competitionRegistration.ts) | Don't re-register on the competition contract |
| `bnb_erc8004_registration_v1` | [`bnbAgentRegistration.ts`](src/lib/services/bnbAgentRegistration.ts) | Don't re-mint the ERC-8004 agent identity |
| `probe_trade_scheduler_v1` | [`probeTradeScheduler.ts`](src/lib/services/execution/probeTradeScheduler.ts) | Don't double-fire the daily compliance probe across restarts |

## Failure modes & degradations

| Failure | Behaviour | File:line |
|---|---|---|
| Portfolio totalValueUSD is NaN/0/negative | Skip cycle, broadcast `health_degradation`, preserve last drawdown state | [`agentLoop.ts:366-380`](src/lib/services/agentLoop.ts#L366-L380) |
| CMC price missing for the target token | Skip execution, write failureReason to session, broadcast | [`agentLoop.ts:366-380`](src/lib/services/agentLoop.ts#L366-L380) |
| Narrative or quant analyst throws | `Promise.allSettled` returns synthetic neutral; `parseStatus`-aware dissent forces mild | [`committeeSession.ts:58-67`](src/lib/services/cognition/committeeSession.ts#L58-L67) |
| Drawdown crosses tier | 5-tier classification (normal/alert/defensive/halt/disqualified) | [`riskManager.ts:35-51`](src/lib/services/execution/riskManager.ts#L35-L51) |
| Hot-state map evict during iteration | Snapshot-keys-first eviction pattern | [`hotState.ts`](src/lib/stores/hotState.ts) |

## The 8-flag /proof verification

[`/proof/[txHash]`](src/app/proof/%5BtxHash%5D/page.tsx) reads the AttestationEmitter contract events directly and recomputes the reasoning hash from the persisted session row. Verbatim flags from the page (:85-131):

1. `Reasoning hash recomputes (DB)`
2. `DB integrity (hash → session round-trip)`
3. `On-chain ReasoningCommitted event found`
4. `Commit tx on-chain matches DB`
5. `On-chain ExecutionRevealed event found`
6. `Commit landed BEFORE reveal`
7. `On-chain myxTxHash matches the swap`
8. `TWAK swap recorded in DB`

All eight green = full chain-of-custody verified.

## Deploy topology

Both services run on **Railway** (no Vercel). Two services in one project:

| Service | Process | Runtime |
|---|---|---|
| Web | `next start` | Next.js 16 App Router, standalone output |
| Worker | `tsx src/worker/index.ts` | Node 22 + TWAK CLI installed in the image |

Internal communication: Worker → Web via `WEB_BROADCAST_URL` (signed POST), Web → Worker via `WORKER_ADMIN_URL` (signed POST). Both use [`adminAuth.verifyAdminSecret`](src/lib/utils/adminAuth.ts) which uses `crypto.timingSafeEqual`.

Database: Supabase (managed Postgres) - schemas + migrations in [supabase/migrations/](supabase/migrations/).
