# BUILD_PROTOCOL.md

**Companion to:** NEURODEGEN_V2_PRD.md
**Audience:** Claude Code (the implementing agent)
**Purpose:** Define how the build proceeds. The PRD says *what* to build. This document says *how* to build it without repeating V1's mistakes.

---

## 1. THREE DOCUMENTS RULE

Before any task in any phase, read in this order:

1. **NEURODEGEN_V2_PRD.md** — source of truth for what V2 is
2. **NEURODEGEN_V1_AUDIT.md** — source of truth for what V1 actually shipped vs. what was scaffolded
3. **AGENT_PROGRESS.md** — running log of decisions, deviations, and discovered constraints

Before reading the three documents, also read the research notes:
- prot1.md, prot2.md, prot3.md — agent thoughts and concept ideation from the initial process
- protsummary.md — earlier PRD draft combining the protocol explorations
- NEURODEGEN_V2_PRD.md — the final spec

These are the source of truth for what the third-party APIs do.
The PRD references these but treats them as known. Phase 0
verification confirms current state matches the research, not
discovery from scratch.

If any of these documents disagree, the PRD wins. If the PRD says something the V1 audit revealed to be false (e.g. "carried forward without modification" applied to a module that was actually scaffolding), flag it in AGENT_PROGRESS.md and rewrite that module from scratch. Do not paper over.

---

## 2. THE BUILD LOOP

Every phase follows this loop. No exceptions.

```
1. Read PRD section for the current phase
2. Read AGENT_PROGRESS.md for any decisions affecting this phase
3. List every file to create or modify
4. Write failing tests first (TDD)
5. Implement to pass tests
6. Run `pnpm tsc --noEmit` — must return zero errors
7. Run `pnpm vitest run` — every test must pass
8. Run `pnpm lint` — zero unresolved errors
9. Run `pnpm build` — must compile cleanly
10. Run the phase audit script (scripts/audit.sh phase-N)
11. If anything in steps 6-10 fails: fix and loop back to step 6
12. Update AGENT_PROGRESS.md with: what shipped, what changed from PRD, what was discovered
13. Commit with conventional commit message
14. Stop. Wait for human gate approval before moving to next phase.
```

The human gate at step 14 is non-negotiable. The implementing agent does not self-promote between phases.

---

## 3. TEST DISCIPLINE

V1 had 96 passing tests and zero working lifecycle recovery. Tests that don't exercise real behavior are worse than no tests because they create false confidence.

### 3.1 Test types required

**Unit tests** (every pure function and class method):
- Cover happy path, every documented edge case, every error condition
- No mocks of the system under test
- Mocks allowed only for external boundaries (LLM APIs, CMC API, TWAK CLI, BSC RPC, Supabase)
- Each test asserts an actual behavior, not just "function was called"

**Integration tests** (every service interaction):
- Real internal calls. Mocked external calls.
- Test the contract between two modules, not implementation details
- Required for: cmcHubClient ↔ eventNormalizer, committeeSession ↔ all three analysts, twakExecutor ↔ preExecutionChecker ↔ riskManager, attestationEmitter ↔ chain client

**End-to-end tests** (full loops):
- Real LLM calls (small token counts to control cost)
- Real CMC calls (free tier only during tests)
- Real BSC mainnet for one $5 test trade per phase that needs it
- Mocked TWAK during phases 1-4. Real TWAK from phase 5 onward.

**Live tests** (before submission):
- One real $5 trade completing the full commit → swap → reveal cycle on BSC mainnet
- Probe trade scheduler firing once on the actual schedule
- One full demo dry-run from cold start to dashboard observation

### 3.2 Forbidden test patterns

- `expect(true).toBe(true)` — placeholder, fails the audit
- `it.skip()` or `it.todo()` left in committed code — fix or delete the test
- Tests that pass because the function silently returns null/undefined — assert the actual return value
- Tests that mock the function being tested — write a real test
- Tests that don't run as part of `pnpm vitest run` (no separate test suites or excluded paths)
- Snapshot tests without explicit review — snapshots without review become snapshot-of-whatever-is-broken

### 3.3 Test coverage threshold

- Pure utility functions: 100% line coverage required
- Services with external dependencies: 80% line coverage required (the uncovered 20% is the external boundary)
- UI components: visual smoke test at minimum (renders without crashing with valid props)
- Coverage measured by Vitest's c8 reporter
- Phase audit script checks coverage and fails the gate if below threshold

---

## 4. AUDIT SCRIPT

`scripts/audit.sh` is the gate function. It runs at the end of every phase and must exit zero before the phase can be marked complete.

### 4.1 What the audit checks

```bash
scripts/audit.sh phase-N
```

For each phase:

- All files in the phase's task list exist
- All files have matching test files (or are explicitly UI components covered by smoke tests)
- TypeScript compiles with zero errors
- Vitest runs with zero failures and meets coverage threshold
- ESLint runs with zero errors
- Next.js build succeeds
- No `TODO`, `FIXME`, `XXX`, or `HACK` comments in committed code (these become followups in AGENT_PROGRESS.md)
- No `console.log` outside of explicit `lib/logger.ts` calls
- No `any` types in committed code except in third-party adapter shims with explicit comment justifying
- Phase-specific functional checks (e.g. Phase 3: "regimeClassifier correctly transitions through all four states given fixture inputs")

### 4.2 Audit failure handling

If audit fails:
- Print the failing checks with file:line references
- Do NOT mark phase complete
- Loop back to fix
- Re-run audit
- Repeat until clean

Do not weaken audit rules to make the gate pass. If a rule is genuinely wrong (not just inconvenient), document the rationale in AGENT_PROGRESS.md and update the audit script with an explicit justification comment.

---

## 5. ANTI-PATTERNS

These are the patterns V1 fell into. They are explicitly forbidden in V2.

### 5.1 No stubs that look like implementations

V1 had a `transactionSubmitter.ts` that returned a structurally valid `SubmitResult` with `orderId: null` hard-coded on every successful submit. Downstream `attestationEmitter.revealExecution` then hashed the local UUID and wrote it on-chain as if it were a real MYX order ID — a stub that looked like a real implementation and produced unverifiable on-chain artifacts. The audit script must catch this kind of thing: any function whose return value is unverifiable against an external source of truth is suspect.

If a real implementation is not possible at the time a module is written (because a dependency is being built in a later phase), the function should `throw new Error('NOT_IMPLEMENTED: explanation')` rather than return a structurally-valid placeholder. The audit script flags any `NOT_IMPLEMENTED` throw at phase gates that require the function to be live.

### 5.2 No feature flags hiding broken paths

V1's `ENABLE_EXECUTION` and `DRY_RUN_MODE` flags worked correctly — they were flipped on 2026-04-23 and 7 real trades submitted. The flags were not the bug. The bug was that lifecycle code behind the flags was disabled in commit `442e474` ("skip broken SDK polling, mark positions managed immediately"), so the flipped flags produced trades the agent couldn't track. V2 has no analogous kill switches that disable downstream lifecycle code. Either a feature is built and tested end-to-end, or it does not exist in the codebase. Feature flags are allowed only for:

- Behavior that varies between environments (dev vs prod logging verbosity)
- V2.1 features explicitly deferred from V2.0.0 (perp mode, Telegram, NLP mandate)

Every feature flag has an explicit comment naming the V2.x version that ships it enabled.

### 5.3 No silent error swallowing

Every catch block does one of three things:
- Re-throws with additional context
- Logs to the structured logger with severity and routes to the appropriate fallback
- Returns a typed error result that the caller is required by types to handle

`} catch (e) { return null }` is forbidden. `} catch (e) { console.error(e) }` is forbidden. V1's `mirrorDispatcher.ts:77-79` silenced `NotOrderOwner` reverts as `privy_signing_mismatch` skip rows — that pattern is what produced 0/3 successful mirrors with no visible alarm.

### 5.4 No "// TODO: implement" in committed code

If something is genuinely deferred, it goes in AGENT_PROGRESS.md as a numbered followup. If something is incomplete, the function throws NOT_IMPLEMENTED. The codebase contains no inline TODOs.

### 5.5 No magic numbers

Every numeric constant lives in `config/`. No `if (drawdown > 0.25)` inline. No `setTimeout(() => {}, 2000)` inline. The audit script greps for literal numbers in service files and flags them.

### 5.6 No untyped external boundaries

Every external boundary (LLM API, CMC, TWAK, BSC RPC, Supabase) has a typed wrapper client. No raw `fetch()` calls in service code. No `as any` cast at the boundary. If a response shape is genuinely uncertain, validate it with Zod at the boundary and produce a typed error on schema mismatch.

### 5.7 No tests that don't actually test

The audit script samples test files and flags any test where:
- The assertion checks only structural properties (`expect(result).toBeDefined()`)
- The mock returns the same shape the test expects (testing the mock, not the code)
- The test passes when the entire implementation is commented out

---

## 6. AGENT_PROGRESS.md FORMAT

Updated after every phase. Format:

```markdown
## Phase N — [Title] — [Status: in-progress | gate-pending | complete]

### Date range
YYYY-MM-DD to YYYY-MM-DD

### Files created
- src/path/to/file.ts (purpose, lines, test coverage %)
- ...

### Files modified
- src/path/to/file.ts (what changed, why)
- ...

### Deviations from PRD
- [Section X.Y of PRD said Z; we did W instead because <reason>]
- ...

### Discoveries
- [Things learned during the phase that affect future phases]
- ...

### Followups
- [N] [Description, priority, target phase]

### Audit results
- TypeScript: 0 errors
- Vitest: NN/NN passing, X% line coverage
- ESLint: 0 errors
- Next.js build: ok
- Phase functional checks: NN/NN passing

### Demo evidence
- [Screenshots, BscScan tx hashes, command output snippets]
- ...

### Gate decision
- [Approved by human at YYYY-MM-DD HH:MM, or pending]
```

This file is the running record of what actually shipped. If the PRD claims something works and AGENT_PROGRESS.md says it doesn't, AGENT_PROGRESS.md wins. The PRD must then be updated to reflect reality.

---

## 7. WHAT TO DO WHEN STUCK

When the implementing agent hits a blocker:

### 7.1 Unknown API surface

If a third-party API (TWAK, CMC) doesn't behave as the PRD assumes, do not fabricate the behavior. Steps:

1. Write a minimal reproduction script that demonstrates the unexpected behavior
2. Capture the actual request and response shapes
3. Update AGENT_PROGRESS.md with the discovery
4. Update the typed wrapper client to match reality
5. Update the PRD section that was wrong (yes, the PRD updates if reality disagrees)
6. Re-run affected tests with the corrected types

### 7.2 Test fails with no obvious cause

Do not retry the test until it passes. Do not add a sleep. Do not loosen the assertion. Steps:

1. Add structured logging at every boundary the test crosses
2. Re-run the test with the logging
3. Identify the exact line where actual diverges from expected
4. If it's a race condition, fix the race not the test (no flaky test "stabilization")
5. If it's a real bug in the implementation, fix the implementation

### 7.3 Time pressure

If a phase is taking longer than budgeted (per the phase schedule in PRD Section 13):

1. Do not skip tests to save time
2. Do not stub modules to claim phase completion
3. Update AGENT_PROGRESS.md with the actual time taken and what slowed down
4. Identify what can be deferred to V2.1 (perp, Telegram, NLP mandate are explicit deferrals)
5. Request human approval to defer

The hackathon deadline is a hard constraint. The audit gates are also hard constraints. When these conflict, the right move is to ship less but ship it solid, not ship more that doesn't work.

---

## 8. HARD NEVER-DO RULES

These are inviolable for the duration of V2 development and the trading window.

- Never store any user private key anywhere. The agent has its own wallet. Users sign their own transactions via TWAK.
- Never submit a trade through any path other than TWAK. No direct viem.writeContract calls for swaps.
- Never bypass the PreExecutionChecker. If a check is wrong, fix the check, do not skip it.
- Never trade a token outside `config/allowedTokens.ts`. The 149-token allowlist is hardcoded and verified at startup.
- Never let drawdown exceed 25% without halting. The 28% TWAK hard stop is a backstop, not an operating range.
- Never claim alpha, Sharpe ratio, or expected positive return in any marketing copy, README, or DoraHacks submission text.
- Never commit secrets. `.env.local` is gitignored. The audit script greps for accidentally-committed API key patterns.
- Never re-deploy the AttestationEmitter contract. The deployment at `0xe21f5ebec3f098c744c1e35db0c9338d6b717dc4` is confirmed to have `commitReasoning` and `revealExecution` methods (V1 smoke tx `0xcbd07114…` and `0x7dea3fc4…`). Phase 0 verifies the function selectors via `eth_call`; no redeploy under any circumstance.

---

## 9. COMMIT DISCIPLINE

Conventional commits. One commit per logical change. No "WIP" commits in main branch.

Format:
```
<type>(<scope>): <description>

<body>

Phase: <N>
Refs: <PRD section if applicable>
```

Types: `feat`, `fix`, `refactor`, `test`, `chore`, `docs`, `perf`.

Scopes: `perception`, `cognition`, `execution`, `monetization`, `frontend`, `infra`, `config`.

Example:
```
feat(execution): implement drawdown ladder in RiskManager

Adds four-tier drawdown response (alert/defensive/halt/hard-stop) per
PRD Section 6.5. Hard stop fires at 25% via canAct() rejection.
TWAK config receives 28% guardrail at agent startup.

Phase: 5
Refs: PRD 6.5
```

---

## 10. DELIVERABLES BY END OF BUILD

By June 21 (Phase 7 complete):

1. `NEURODEGEN_V2_PRD.md` (this build's source of truth)
2. `NEURODEGEN_V1_AUDIT.md` (preserved as historical record)
3. `BUILD_PROTOCOL.md` (this document)
4. `AGENT_PROGRESS.md` (complete log of every phase)
5. Public GitHub repository with full codebase, README, license
6. Live deployment at neurodegen.xyz (frontend on Vercel, agent worker on Railway)
7. `twak compete register` transaction confirmed on BSC (BscScan link)
8. At least one real $5 trade completing the full commit-execute-reveal cycle (three BscScan links)
9. Demo video (90-180 seconds)
10. DoraHacks Track 1 submission with strategy description
11. DoraHacks Track 2 Skill submission (the cognition layer packaged as a standalone Skill)

By June 28 (live trading window complete):

12. 7 days of agent activity with minimum 7 trades executed
13. Drawdown never exceeded 25%
14. Daily AGENT_PROGRESS.md updates during the trading window
15. Final PnL report

---

## 11. WHAT THIS PROTOCOL EXISTS TO PREVENT

V1 shipped with:

- **Lifecycle recovery never wrote fill data back to the DB.** `realized_pnl_usd` is NULL on every closed position in production (6/6). `exit_tx_hash` is NULL on every row. The agent submitted 7 real trades and could not tell you what any of them earned or lost.
- **On-chain `orderId` was always `keccak256` of a local UUID**, never a real MYX order ID, so on-chain queries could never resolve back to local records and the on-chain audit trail is decorative on that field.
- **`positionTracker.ts:65-72` was rewritten in commit `442e474` to skip SDK polling** and mark every position `managed` immediately. Real fills happened on-chain. The TP/SL keeper closed 6 of 7 positions. The agent's local state never noticed. The 7th position has been stuck in `managed` since 2026-04-23 11:09, blocking every subsequent entry with `risk_manager: Max concurrent positions reached (1)`.
- **Regime classifier's `active`, `volatile`, and `cool` states never fired in 18 days of production.** Only `quiet` (1,235 cycles) and `retail_frenzy` (2,122 cycles) ever activated. The intermediate states were dead code dressed as a regime ladder.
- **96 passing tests** (per AGENT_PROGRESS.md Phase 11), zero of which exercised the lifecycle recovery path that broke in production.
- **A Privy signing path that silently consumed every failure as `privy_signing_mismatch`** even when the on-chain revert reason was `NotOrderOwner`. 0/3 mirrors ever succeeded; the dashboard kept saying "mirror active."
- **Pyth integration that parsed VAA headers but never validated payload signatures**, so a divergence check pretended to compare on-chain prices against a verified oracle without verification.
- **`oracleDivergenceCheck` extended to allow `myx_last` as a reference price source** (commit `922d7a1`), meaning when Pyth was down and MYX index was unavailable the gate compared the trade price against itself — a gate bypass dressed as a fallback.
- **~$15 in inference cost burned in 48 hours** because cycle frequency was decoupled from regime hibernation and the fallback chain quietly amplified every transient failure into a 6+ attempt cascade across providers.

Every rule in this protocol exists because V1 failed at it. The DGrid win came from the architecture being good. The main-sprint loss came from lifecycle being theatrical. V2 ships things that actually close the loop.

---

*End of BUILD_PROTOCOL.md.*
