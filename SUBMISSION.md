# DoraHacks submission package

**Hackathon:** BNB Hack: AI Trading Agent Edition (CoinMarketCap × Trust Wallet)
**Track:** Track 1 — Autonomous Trading Agents ($24,000)
**Specials targeted:** Best Use of Trust Wallet Agent Kit ($2,000), Best Use of Agent Hub ($2,000)
**Repo:** https://github.com/<owner>/neurodegen *(fill in before submitting)*
**Live demo:** https://neurodegen.xyz
**Live verification page (any trade):** https://neurodegen.xyz/proof/`<twakTxHash>`
**Health + registration status:** https://neurodegen.xyz/api/health

---

## Pre-submission checklist (gate)

Before pasting this into DoraHacks, run through:

- [ ] `DRY_RUN_MODE=false` in Railway env for the worker service
- [ ] `ENABLE_EXECUTION=true` in Railway env for the worker service
- [ ] `TWAK_AGENT_WALLET_ADDRESS` set (matches the wallet you funded with USDT)
- [ ] Agent wallet holds non-zero USDT before 2026-06-22 00:00 UTC
- [ ] Worker booted and `GET /api/health` returns `diagnostics.competition.registration.txHash` non-null
- [ ] BscScan shows that registration tx mined successfully against `0x212c61b9b72c95d95bf29cf032f5e5635629aed5`
- [ ] `ALLOWED_TOKENS_JSON` env var contains the 149-token list from the hackathon brief
- [ ] AttestationEmitter contract `0xe21f5ebec3f098c744c1e35db0c9338d6b717dc4` reachable from BSC RPC
- [ ] `/journal` page renders at least one committee session (ideally several from dry-run mode before flipping the switch)
- [ ] Public GitHub URL filled in at top of this file + in the DoraHacks form
- [ ] Strategy summary below proofread

---

## Strategy summary (paste into DoraHacks form)

NeuroDegen V2 is an autonomous **investment-committee trading agent** for BNB Chain that delegates every decision to three single-purpose LLMs and signs every trade through Trust Wallet Agent Kit. There is no human in the trade loop and no custodial component anywhere in the signing path.

**The committee.** A *Narrative Analyst* (Claude Sonnet 4.6) scores social-momentum and narrative direction. A *Quant Analyst* (GPT-4o) extracts liquidity, funding-rate, and price-impact features. A *Risk Classifier* (DeepSeek v3.2) receives both analyst outputs plus an automatic dissent verdict and emits the final action. The three are routed through the DGrid LLM gateway with a BYOK → DGrid primary → DGrid fallback chain so a single provider outage doesn't silence the agent. Disagreement between the narrative and quant analysts collapses position size by 50% (mild) or forces a hold (strong); analyst parse-failures are treated as hidden dissent so the agent does not act on false unanimity.

**The data.** CoinMarketCap AI Agent Hub via MCP `tools/call` is the perception layer. Free-tier endpoints feed every cycle; premium endpoints (deep social, KOL velocity, token security score, on-chain risk) are gated by an EV calculation that only fires the x402 micropayment when the expected information value clears the cost. Daily x402 spend is hard-capped. Pyth Hermes feeds BTC/ETH/BNB oracle prices used in the divergence check.

**The execution.** TWAK is the sole signing path. `twakClient.executeSwap()` spawns the TWAK CLI, parses the BSC tx hash from the JSON output, and returns it to the agent. Eight pre-execution checks fire in order before any swap: oracle divergence, security-risk score, honeypot flag, slippage headroom, 149-token allowlist membership, drawdown tier, daily PnL cap, and live total-exposure cap (derived from the actual open-position book, not stale state). On-chain registration on the competition contract `0x212c…aed5` is wired into worker boot, persisted to a `worker_state` row, idempotent across restarts, and refuses to fire after the deadline.

**The proof.** Every committee decision is committed on-chain *before* the TWAK swap, then revealed *after* BSC confirmation. The AttestationEmitter contract at `0xe21f5ebec3f098c744c1e35db0c9338d6b717dc4` emits `ReasoningCommitted(reasoningHash, actionIntent)` and `ExecutionRevealed(reasoningHash, twakTxHash)`. The `/proof/[twakTxHash]` page reads the contract events directly, recomputes the reasoning hash from the persisted DB row, and shows a flag-by-flag verdict. Verifying any single trade requires zero trust in our database, dashboard, or demo.

**The guardrails.** A five-tier drawdown ladder (normal/alert/defensive/halt/disqualified) hard-stops execution at the competition's 25% halt floor and disqualification is impossible below the global 30% line. The risk manager derives total exposure live from the position book on every cycle (the audit found and fixed a stale-state cap-bypass during Phase E). A daily probe-trade scheduler at 18:00 UTC guarantees at least one qualifying trade per day even in quiet markets; `lastProbeDay` is persisted to Postgres so a worker restart cannot double-fire. The agent will not trade outside the 149-token list. The agent will not bypass `PreExecutionChecker`. The agent never holds user funds.

**The honest disclosure.** This is a composition demonstration, not an alpha claim. The codebase makes no profitability promise. What it demonstrates is end-to-end autonomous agent execution under self-custody with a cryptographically verifiable audit trail — every component (perception, cognition, execution, attestation) verifiable from public artefacts (CMC, TWAK output, BSC events) without ever trusting our infrastructure.

---

## On-chain proof artefacts

| Artefact | BscScan |
|---|---|
| Competition contract | https://bscscan.com/address/0x212c61b9b72c95d95bf29cf032f5e5635629aed5 |
| AttestationEmitter | https://bscscan.com/address/0xe21f5ebec3f098c744c1e35db0c9338d6b717dc4 |
| Agent wallet | *(fill in: paste `TWAK_AGENT_WALLET_ADDRESS` from your Railway env)* |
| Registration tx | *(fill in: paste `diagnostics.competition.registration.txHash` from `/api/health`)* |

---

## TWAK special-prize scoring map

The Best Use of TWAK rubric (5 categories, 100 points). How NeuroDegen scores each:

| Category | Pts | Evidence |
|---|---|---|
| TWAK integration depth | 30 | TWAK is the **sole** signing path. We use ≥3 surfaces: `twak compete register` (on-chain identity), `twak swap` (execution), `twak x402 request` (outbound micropayments to CMC premium tools). |
| Self-custody integrity | 25 | The Node worker never touches a private key. Every signing operation is delegated to the TWAK CLI process. No Privy/Magic/custodial component anywhere in the trade path. (Privy was in V1; stripped in Phase F — `git log` shows the dep removal commit.) |
| Autonomous execution + guardrails | 20 | Hands-off agent loop with hard rules: 149-token allowlist, mandate-driven drawdown ladder (alert/defensive/halt/DQ), slippage cap, daily PnL cap, per-position size cap, exposure cap derived live, consecutive-loss halt. |
| Native x402 usage | 10 | Outbound — CMC premium tools paid per-request via `twak x402 request --max-payment` with daily-spend cap. Inbound — `/api/x402/session/[id]` sells session data via USDT-on-BSC micropayments with atomic replay protection. |
| Originality + RWR | 10 | Three-LLM committee with structured dissent, plain-language explanation surfacing override rationale, and on-chain commit-reveal — distinct from "LLM-as-trader" baseline. Self-custody user can let it run unattended. |
| Demo | 5 | `/proof/[twakTxHash]` provides one-click independent verification. `/journal` paginated session log. `/api/health` exposes preflight + registration state. |

---

## Agent Hub special-prize scoring map

Best Use of Agent Hub — the criterion is using the most of the CMC AI Agent Hub surface (MCP, x402, CMC CLI, IDE integrations, Skills).

| Surface | How NeuroDegen uses it |
|---|---|
| MCP | `cmcHubClient.ts` is a MCP JSON-RPC `tools/call` client over the hub's transport. Free-tier tools feed every perception cycle. |
| x402 outbound | Premium tools (deep social, KOL velocity, security-risk score) gated by an EV calculation; payments authorised via `twak x402 request --max-payment`. Daily spend cap. |
| Skills | The cognition committee — Narrative Analyst, Quant Analyst, Risk Classifier — are authored as system prompts pluggable as CMC Skills (Track 2-style strategy specs). |

---

## What NeuroDegen does **not** claim

- We do not claim profitability. The composition is the product.
- We do not use BNB AI Agent SDK (Python-only; would add a sidecar runtime to a Node-only architecture without strengthening the trade path).
- We do not trade perps (V1 used MYX; V2 is spot-only via TWAK).
- We do not have a Telegram bot or copy-trade fan-out in V2 (V1-only; explicit V2.0 deferral).
- We never hold user funds. The agent has its own TWAK wallet.

---

## Operator runbook (for the live window)

```bash
# 1. Provision the agent wallet via TWAK (once)
twak wallet create --name neurodegen
twak wallet show --json   # paste address into TWAK_AGENT_WALLET_ADDRESS

# 2. Fund the agent wallet with USDT-BSC (at least the entry capital)
#    Send USDT to TWAK_AGENT_WALLET_ADDRESS on BSC mainnet.

# 3. Flip DRY_RUN_MODE off and deploy worker
railway variables set DRY_RUN_MODE=false ENABLE_EXECUTION=true
railway up --service neurodegen-worker

# 4. Verify registration landed
curl https://neurodegen.xyz/api/health | jq .diagnostics.competition

# Expected:
# {
#   "contract": "0x212c61b9b72c95d95bf29cf032f5e5635629aed5",
#   "registration": {
#     "participant": "0x...",
#     "txHash": "0x...",            <-- paste into DoraHacks
#     "registeredAt": "2026-06-...",
#     "alreadyRegistered": false,
#     "dryRun": false
#   },
#   "preflightIssues": []
# }

# 5. Watch the first cycle complete
curl -N https://neurodegen.xyz/api/events/stream
# Look for: committee_session_complete event with a non-null reasoningHash.

# 6. Verify the first trade via /proof
open https://neurodegen.xyz/proof/<twakTxHash>
# All 8 verification flags should be green.
```

If `preflightIssues` lists anything, fix before the trading window opens.
