# DoraHacks submission package

**Hackathon:** BNB Hack: AI Trading Agent Edition (CoinMarketCap × Trust Wallet)
**Submitting:** Track 1 (Autonomous Trading Agents, $24,000) AND Track 2 (Strategy Skills, $6,000)
**Specials targeted:** Best Use of Trust Wallet Agent Kit ($2,000), Best Use of Agent Hub ($2,000), Best Use of BNB AI Agent SDK ($2,000)
**Repo:** https://github.com/winsznx/neurodegen
**Live demo:** https://neurodegen.xyz
**Live committee dashboard:** https://neurodegen.xyz/agent
**Session journal:** https://neurodegen.xyz/journal
**Trade verification (per-tx):** https://neurodegen.xyz/proof/`<twakTxHash>`
**Health + registration:** https://neurodegen.xyz/api/health
**ERC-8004 agent card:** https://neurodegen.xyz/api/agent-card
**Live status channel (Telegram):** https://t.me/neurodegenv2

## On-chain artefacts (everything verifiable from BscScan)

| | |
|---|---|
| **Agent wallet (TWAK signer)** | [`0x1a59eD9BB4890a8ac02746BFC00EDeCBBBe375fF`](https://bscscan.com/address/0x1a59eD9BB4890a8ac02746BFC00EDeCBBBe375fF) |
| **Competition registration tx** | [`0x505c22f5…6358ed13`](https://bscscan.com/tx/0x505c22f537990841fb623b636521028984e13be7570840a49c6bd8e06358ed13) |
| **Competition contract** | [`0x212c61b9…629aed5`](https://bscscan.com/address/0x212c61b9b72c95d95bf29cf032f5e5635629aed5) |
| **ERC-8004 identity (agentId 139974)** | [`0xd1afd2b3…ca389b2f`](https://bscscan.com/tx/0xd1afd2b3a23700f4cf74b75d9fe7b8365dca5c6ec237c1662846a2ffca389b2f) |
| **ERC-8004 registry** | [`0x8004A169…39a432`](https://bscscan.com/address/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432) |
| **V2 AttestationEmitter (deployed + verified)** | [`0xf3ac420e…c69deba3`](https://bscscan.com/address/0xf3ac420e9bd8bb63f42cb6678126dc78c69deba3#code) |
| **V2 attestation deploy tx** | [`0x84e19526…a6d027d7`](https://bscscan.com/tx/0x84e195266c47c2c2eb4ac80122e340bd52bec897aa505fa85ce0f178a6d027d7) |
| **ERC-8183 commerce** | [`0xea4daa31…76eba6`](https://bscscan.com/address/0xea4daa3100a767e86fded867729ae7446476eba6) |
| **Trading window** | 2026-06-22 00:00 UTC -> 2026-06-28 23:59 UTC |
| **Registration deadline** | 2026-06-25 00:00 UTC (per `twak compete status`) |

## Track 2 Strategy Skill submission

A self-contained CMC Strategy Skill - same regime-conditioned committee logic, packaged as a backtestable Skill in `skills/neurodegen-committee/`. Files:

- `skills/neurodegen-committee/SKILL.md` - manifest (YAML frontmatter + decision rules)
- `skills/neurodegen-committee/README.md` - judge-readable intro + edge thesis
- `skills/neurodegen-committee/prompts/` - narrative, quant, risk system prompts
- `skills/neurodegen-committee/src/` - CMC client, regime classifier, sizing helpers
- `skills/neurodegen-committee/backtest.ts` - runnable CLI: `pnpm run backtest`
- `skills/neurodegen-committee/examples/` - sample-output.json + live-invocation.md`
- `skills/neurodegen-committee/LICENSE` - AGPL-3.0-only

Adversarially verified: 9/10 claims confirmed (backtestable, CMC-specific, deterministic regime gate, defensible edge thesis).

---

## Pre-submission gate (everything below verified live as of 2026-06-21 12:30 UTC)

- [x] `DRY_RUN_MODE=false` in Railway env
- [x] `ENABLE_EXECUTION=true`
- [x] `TWAK_AGENT_WALLET_ADDRESS` = `0x1a59eD9BB4890a8ac02746BFC00EDeCBBBe375fF`
- [x] Agent wallet holds non-zero USDT (0.9787 USDT) + BNB (0.008) for gas
- [x] Worker booted; `/api/health` reports `services.competitionRegistered: true`
- [x] BscScan confirms registration tx mined against `0x212c61b9…629aed5`
- [x] `ENABLE_ERC8004_REGISTRATION=true`; agentId 139974 minted on chain
- [x] V2 AttestationEmitter `0xf3ac420e9bd8bb63f42cb6678126dc78c69deba3` deployed AND verified on BscScan
- [x] `/api/agent-card` resolves with EIP-8004 registration-v1 JSON
- [x] CMC MCP confirmed live end-to-end (BNB / ETH / USDT real-time quotes verified)
- [x] TWAK CLI confirmed working in production container (manual smoke ran `compete register` + `erc8004 register` + balance checks; all returned valid txs)
- [x] Public GitHub URL: https://github.com/winsznx/neurodegen
- [x] Strategy summary below proofread

---

## Strategy summary (paste into DoraHacks form)

NeuroDegen V2 is an autonomous **investment-committee trading agent** for BNB Chain that delegates every decision to three single-purpose LLMs and signs every trade through Trust Wallet Agent Kit. There is no human in the trade loop and no custodial component anywhere in the signing path.

**The committee.** A *Narrative Analyst* (Claude Sonnet 4.6) scores social-momentum and narrative direction. A *Quant Analyst* (GPT-4o) extracts liquidity, funding-rate, and price-impact features. A *Risk Classifier* (DeepSeek v3.2) receives both analyst outputs plus an automatic dissent verdict and emits the final action. The three are routed through the DGrid LLM gateway with a BYOK → DGrid primary → DGrid fallback chain so a single provider outage doesn't silence the agent. Disagreement between the narrative and quant analysts collapses position size by 50% (mild) or forces a hold (strong); analyst parse-failures are treated as hidden dissent so the agent does not act on false unanimity.

**The data.** CoinMarketCap AI Agent Hub via MCP `tools/call` is the perception layer. Free-tier endpoints feed every cycle; premium endpoints (deep social, KOL velocity, token security score, on-chain risk) are gated by an EV calculation that only fires the x402 micropayment when the expected information value clears the cost. Daily x402 spend is hard-capped. Pyth Hermes feeds BTC/ETH/BNB oracle prices used in the divergence check.

**The execution.** TWAK is the sole signing path. `twakClient.executeSwap()` spawns the TWAK CLI, parses the BSC tx hash from the JSON output, and returns it to the agent. Eight pre-execution checks fire in order before any swap: oracle divergence, security-risk score, honeypot flag, slippage headroom, 149-token allowlist membership, drawdown tier, daily PnL cap, and live total-exposure cap (derived from the actual open-position book, not stale state). On-chain registration on the competition contract `0x212c…aed5` is wired into worker boot, persisted to a `worker_state` row, idempotent across restarts, and refuses to fire after the deadline.

**The proof.** Every committee decision is committed on-chain *before* the TWAK swap, then revealed *after* BSC confirmation. The AttestationEmitter contract at `0xf3ac420e9bd8bb63f42cb6678126dc78c69deba3` emits `ReasoningCommitted(reasoningHash, actionIntent)` and `ExecutionRevealed(reasoningHash, twakTxHash)`. The `/proof/[twakTxHash]` page reads the contract events directly, recomputes the reasoning hash from the persisted DB row, and shows a flag-by-flag verdict. Verifying any single trade requires zero trust in our database, dashboard, or demo.

**The guardrails.** A five-tier drawdown ladder (normal/alert/defensive/halt/disqualified) hard-stops execution at the competition's 25% halt floor and disqualification is impossible below the global 30% line. The risk manager derives total exposure live from the position book on every cycle (the audit found and fixed a stale-state cap-bypass during Phase E). A daily probe-trade scheduler at 18:00 UTC guarantees at least one qualifying trade per day even in quiet markets; `lastProbeDay` is persisted to Postgres so a worker restart cannot double-fire. The agent will not trade outside the 149-token list. The agent will not bypass `PreExecutionChecker`. The agent never holds user funds.

**The honest disclosure.** This is a composition demonstration, not an alpha claim. The codebase makes no profitability promise. What it demonstrates is end-to-end autonomous agent execution under self-custody with a cryptographically verifiable audit trail - every component (perception, cognition, execution, attestation) verifiable from public artefacts (CMC, TWAK output, BSC events) without ever trusting our infrastructure.

---

## On-chain proof artefacts

| Artefact | BscScan |
|---|---|
| Competition contract | https://bscscan.com/address/0x212c61b9b72c95d95bf29cf032f5e5635629aed5 |
| AttestationEmitter | https://bscscan.com/address/0xf3ac420e9bd8bb63f42cb6678126dc78c69deba3 |
| ERC-8004 Identity Registry | https://bscscan.com/address/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432 |
| ERC-8183 AgenticCommerce | https://bscscan.com/address/0xea4daa3100a767e86fded867729ae7446476eba6 |
| Agent wallet | *(fill in: paste `TWAK_AGENT_WALLET_ADDRESS` from your Railway env)* |
| Registration tx | *(fill in: paste `diagnostics.competition.registration.txHash` from `/api/health`)* |
| ERC-8004 registration tx | *(fill in: paste `diagnostics.bnbAgentSdk.erc8004.registration.txHash` from `/api/health`)* |
| First ERC-8183 job | *(fill in if `ENABLE_ERC8183_JOBS=true`: paste any `JobSubmitted` tx from BscScan)* |

---

## TWAK special-prize scoring map

The Best Use of TWAK rubric (5 categories, 100 points). How NeuroDegen scores each:

| Category | Pts | Evidence |
|---|---|---|
| TWAK integration depth | 30 | TWAK is the **sole** signing path. We use ≥3 surfaces: `twak compete register` (on-chain identity), `twak swap` (execution), `twak x402 request` (outbound micropayments to CMC premium tools). |
| Self-custody integrity | 25 | The Node worker never touches a private key. Every signing operation is delegated to the TWAK CLI process. No Privy/Magic/custodial component anywhere in the trade path. (Privy was in V1; stripped in Phase F - `git log` shows the dep removal commit.) |
| Autonomous execution + guardrails | 20 | Hands-off agent loop with hard rules: 149-token allowlist, mandate-driven drawdown ladder (alert/defensive/halt/DQ), slippage cap, daily PnL cap, per-position size cap, exposure cap derived live, consecutive-loss halt. |
| Native x402 usage | 10 | Outbound - CMC premium tools paid per-request via `twak x402 request --max-payment` with daily-spend cap. Inbound - `/api/x402/session/[id]` sells session data via USDT-on-BSC micropayments with atomic replay protection. |
| Originality + RWR | 10 | Three-LLM committee with structured dissent, plain-language explanation surfacing override rationale, and on-chain commit-reveal - distinct from "LLM-as-trader" baseline. Self-custody user can let it run unattended. |
| Demo | 5 | `/proof/[twakTxHash]` provides one-click independent verification. `/journal` paginated session log. `/api/health` exposes preflight + registration state. |

---

## Agent Hub special-prize scoring map

Best Use of Agent Hub - the criterion is using the most of the CMC AI Agent Hub surface (MCP, x402, CMC CLI, IDE integrations, Skills).

| Surface | How NeuroDegen uses it |
|---|---|
| MCP | `cmcHubClient.ts` is a MCP JSON-RPC `tools/call` client over the hub's transport. Free-tier tools feed every perception cycle. |
| x402 outbound | Premium tools (deep social, KOL velocity, security-risk score) gated by an EV calculation; payments authorised via `twak x402 request --max-payment`. Daily spend cap. |
| Skills | The cognition committee - Narrative Analyst, Quant Analyst, Risk Classifier - are authored as system prompts pluggable as CMC Skills (Track 2-style strategy specs). |

---

## BNB AI Agent SDK special-prize scoring map

The Best Use of BNB AI Agent SDK rubric - "most inventive integration of the SDK". NeuroDegen integrates BOTH ERC-8004 (identity) AND ERC-8183 (agentic commerce) via the TWAK CLI's native subcommands, keeping TWAK as the sole signing path. Three on-chain protocols (AttestationEmitter commit-reveal + ERC-8183 commerce + ERC-8004 identity) are layered for redundant verifiability of the same trade decision.

| Surface | How NeuroDegen uses it |
|---|---|
| ERC-8004 identity registry | Boot-time `twak erc8004 register` with a `data:application/json;base64,…` agent card embedding the canonical EIP-8004 type. Persisted to `worker_state`. Idempotent. Surfaced on `/api/health → diagnostics.bnbAgentSdk.erc8004.registration`. |
| ERC-8183 agentic commerce | Per-decision self-employed job lifecycle: agent is both client and provider. Negotiation hash signed via TWAK personal_sign for `provider_sig`. `create-job → set-budget → fund → submit` runs after every executed trade. Deliverable manifest hash recomputes byte-for-byte from the persisted session row. |
| NegotiationHandler | Off-chain EIP-191 personal_sign of the canonical JSON keccak digest - provider_sig is stored alongside the on-chain job so any observer can verify the agent agreed to its own price before funding. |
| OptimisticPolicy dispute window | The 7-day window functions as a time-locked audit trail; anyone can settle the job after it closes by submitting the manifest. |

Inventive composition: a single committee decision generates THREE on-chain records across THREE separate protocols, all cross-verifiable from BscScan alone.

---

## What NeuroDegen does **not** claim

- We do not claim profitability. The composition is the product.
- We do not trade perps (V1 used MYX; V2 is spot-only via TWAK).
- We have a read-only Telegram status channel ([t.me/neurodegenv2](https://t.me/neurodegenv2)) that mirrors regime changes and trade events. The V1 copy-trade fan-out is not in V2 (explicit V2.0 deferral).
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
