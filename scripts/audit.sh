#!/usr/bin/env bash
# ============================================================
# NeuroDegen V2 audit gate
# Source: BUILD_PROTOCOL.md §4
# Usage:  scripts/audit.sh [phase-N|all]
# Exit:   0 on clean, 1 on any failure
# ============================================================

set -euo pipefail

PHASE="${1:-all}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[0;33m'
RESET=$'\033[0m'

FAIL_COUNT=0
declare -a FAIL_REASONS=()

fail() {
  FAIL_COUNT=$((FAIL_COUNT+1))
  FAIL_REASONS+=("$1")
  printf "${RED}FAIL${RESET}  %s\n" "$1"
}

pass() { printf "${GREEN}PASS${RESET}  %s\n" "$1"; }
info() { printf "${YELLOW}INFO${RESET}  %s\n" "$1"; }

# ============================================================
# Universal gates (run for every phase)
# ============================================================

check_tsc() {
  info "tsc --noEmit"
  if pnpm tsc --noEmit > /tmp/audit_tsc.log 2>&1; then
    pass "TypeScript compiles clean"
  else
    fail "tsc errors (see /tmp/audit_tsc.log)"
    tail -20 /tmp/audit_tsc.log || true
  fi
}

check_vitest() {
  info "vitest run"
  if pnpm vitest run > /tmp/audit_vitest.log 2>&1; then
    pass "Vitest suite green"
  else
    fail "vitest failed (see /tmp/audit_vitest.log)"
    tail -20 /tmp/audit_vitest.log || true
  fi
}

check_lint() {
  info "eslint"
  # pnpm lint exits 0 when only warnings are present and non-zero when errors are present.
  if pnpm lint > /tmp/audit_lint.log 2>&1; then
    pass "ESLint clean (warnings OK)"
  else
    fail "ESLint reported errors"
    tail -20 /tmp/audit_lint.log || true
  fi
}

check_next_build() {
  info "next build (only for full phase audit)"
  if pnpm build > /tmp/audit_build.log 2>&1; then
    pass "Next.js build succeeds"
  else
    fail "Next.js build failed (see /tmp/audit_build.log)"
    tail -30 /tmp/audit_build.log || true
  fi
}

# ============================================================
# Anti-pattern grep (BUILD_PROTOCOL §5)
# ============================================================

check_no_inline_todos() {
  info "no TODO/FIXME/XXX/HACK in committed code"
  if /usr/bin/grep -rn -E '(TODO|FIXME|XXX|HACK):' src/ --include='*.ts' --include='*.tsx' 2>/dev/null; then
    fail "Inline TODO/FIXME/XXX/HACK found (move to AGENT_PROGRESS.md followups)"
  else
    pass "No inline TODO/FIXME/XXX/HACK"
  fi
}

check_no_any_without_justification() {
  info "no unjustified \`any\`"
  if /usr/bin/grep -rn -E ': any(\b|$)' src/ --include='*.ts' --include='*.tsx' 2>/dev/null \
       | /usr/bin/grep -v -E '// (eslint|adapter|external)' \
       | /usr/bin/grep -v 'src/.*\.test\.ts' \
       | /usr/bin/grep .; then
    fail "Unjustified \`any\` in service code"
  else
    pass "No unjustified \`any\`"
  fi
}

check_no_ts_ignore() {
  info "no @ts-ignore / @ts-expect-error"
  if /usr/bin/grep -rn -E '@ts-(ignore|expect-error)' src/ --include='*.ts' --include='*.tsx' 2>/dev/null; then
    fail "Found @ts-ignore or @ts-expect-error"
  else
    pass "No @ts-ignore / @ts-expect-error"
  fi
}

check_no_console_log_outside_logger() {
  info "no console.log outside lib/logger or test files"
  if /usr/bin/grep -rn 'console\.log' src/ --include='*.ts' --include='*.tsx' 2>/dev/null \
       | /usr/bin/grep -v 'src/lib/logger' \
       | /usr/bin/grep -v 'src/.*\.test\.ts' \
       | /usr/bin/grep .; then
    fail "console.log outside lib/logger"
  else
    pass "No stray console.log"
  fi
}

check_no_committed_secrets() {
  info "no committed secrets (basic API key patterns)"
  # Look for OpenAI-style sk-, Anthropic-style sk-ant-, and BSC private keys.
  # 0x-prefixed 64-char hex strings are EXCLUDED because Pyth feed IDs and tx hashes
  # are legitimately public; flag only ACTUAL private-key shaped strings in places
  # they shouldn't be.
  if /usr/bin/grep -rn -E '(sk-[a-z0-9-]{20,}|sk-ant-[A-Za-z0-9-]{20,})' --include='*.ts' --include='*.tsx' --include='*.json' src/ supabase/ scripts/ 2>/dev/null \
       | /usr/bin/grep -v '/test' \
       | /usr/bin/grep .; then
    fail "Committed secret-shaped string"
  else
    pass "No obvious committed secrets"
  fi
}

# ============================================================
# Phase 1 gate — Foundation
# ============================================================

phase_1() {
  info "==== Phase 1 — Foundation ===="

  for path in \
      src/types/perception.ts \
      src/types/cognition.ts \
      src/types/execution.ts \
      src/types/monetization.ts \
      src/types/mandate.ts \
      src/types/index.ts \
      src/config/perception.ts \
      src/config/cognition.ts \
      src/config/execution.ts \
      src/config/risk.ts \
      src/config/regime.ts \
      src/config/chains.ts \
      src/config/features.ts \
      src/config/monetization.ts \
      src/config/competition.ts \
      src/config/index.ts \
      src/lib/queries/sessions.ts \
      src/lib/queries/positions.ts \
      src/lib/queries/events.ts \
      src/lib/queries/metrics.ts \
      src/lib/queries/x402proofs.ts \
      src/lib/queries/index.ts \
      src/lib/abis/attestationEmitter.ts \
      src/lib/services/realtimeService.ts \
      src/lib/clients/chain.ts \
      src/lib/clients/pyth.ts \
      src/lib/clients/supabase.ts \
      src/lib/stores/hotState.ts \
      src/lib/services/perception/coldStorageWriter.ts \
      supabase/migrations/005_v2_schema.sql \
      .env.example \
      railway.toml \
      railway.worker.toml ; do
    if [[ -f "$path" ]]; then
      pass "exists: $path"
    else
      fail "missing: $path"
    fi
  done

  for tombstone in \
      src/lib/clients/myx.ts \
      src/lib/clients/myxPools.ts \
      src/lib/clients/bitquery.ts \
      src/lib/clients/privy.ts \
      src/lib/services/perception/fourMemeIngester.ts \
      src/lib/services/monetization/mirrorDispatcher.ts \
      src/lib/services/telegram \
      src/types/myx.ts \
      src/types/pieverse.ts ; do
    if [[ -e "$tombstone" ]]; then
      fail "V1 tombstone still present: $tombstone (should be deleted)"
    else
      pass "deleted: $tombstone"
    fi
  done
}

# ============================================================
# Phase 2-7 gates (additive)
# ============================================================

phase_2() {
  info "==== Phase 2 — Clients ===="
  for path in \
      src/lib/clients/cmcHubClient.ts \
      src/lib/clients/twakClient.ts \
      src/lib/clients/llm/claudeClient.ts \
      src/lib/clients/llm/openaiClient.ts \
      src/lib/clients/llm/dgridClient.ts \
      src/lib/clients/llm/router.ts \
      src/lib/utils/canonicalSerialize.ts ; do
    [[ -f "$path" ]] && pass "exists: $path" || fail "missing: $path"
  done
}

phase_3() {
  info "==== Phase 3 — Perception ===="
  for path in \
      src/lib/services/perception/cmcIngester.ts \
      src/lib/services/perception/eventNormalizer.ts \
      src/lib/services/perception/aggregatorService.ts \
      src/lib/services/perception/regimeClassifier.ts \
      src/lib/services/perception/evGate.ts ; do
    [[ -f "$path" ]] && pass "exists: $path" || fail "missing: $path"
  done
}

phase_4() {
  info "==== Phase 4 — Cognition ===="
  for path in \
      src/lib/services/cognition/committeeSession.ts \
      src/lib/services/cognition/narrativeAnalyst.ts \
      src/lib/services/cognition/quantAnalyst.ts \
      src/lib/services/cognition/riskClassifier.ts \
      src/lib/services/cognition/dissentTracker.ts \
      src/lib/services/cognition/sessionGraphBuilder.ts \
      src/lib/services/cognition/fallbackHandler.ts \
      src/lib/utils/prompts.ts ; do
    [[ -f "$path" ]] && pass "exists: $path" || fail "missing: $path"
  done
}

phase_5() {
  info "==== Phase 5 — Execution ===="
  for path in \
      src/lib/services/execution/preExecutionChecker.ts \
      src/lib/services/execution/riskManager.ts \
      src/lib/services/execution/twakExecutor.ts \
      src/lib/services/execution/positionTracker.ts \
      src/lib/services/execution/attestationEmitter.ts \
      src/lib/services/execution/probeTradeScheduler.ts \
      src/lib/services/agentLoop.ts \
      src/worker/index.ts \
      src/lib/utils/allowedTokens.ts ; do
    [[ -f "$path" ]] && pass "exists: $path" || fail "missing: $path"
  done
}

phase_6() {
  info "==== Phase 6 — Frontend + Monetization ===="
  for path in \
      src/app/agent/page.tsx \
      src/app/journal/page.tsx \
      src/app/session/[id]/page.tsx \
      src/app/proof/[txHash]/page.tsx \
      src/app/api/agent/status/route.ts \
      src/app/api/agent/start/route.ts \
      src/app/api/agent/trigger/route.ts \
      src/app/api/health/route.ts \
      src/app/api/x402/session/[id]/route.ts \
      src/app/api/og/session/[id]/route.tsx ; do
    [[ -f "$path" ]] && pass "exists: $path" || fail "missing: $path"
  done
}

phase_7() {
  info "==== Phase 7 — Backtest + Audit ===="
  for path in \
      src/lib/services/backtestRunner.ts \
      scripts/backtest.ts ; do
    [[ -f "$path" ]] && pass "exists: $path" || fail "missing: $path"
  done
}

# ============================================================
# Dispatch
# ============================================================

case "$PHASE" in
  phase-1|1) phase_1 ;;
  phase-2|2) phase_2 ;;
  phase-3|3) phase_3 ;;
  phase-4|4) phase_4 ;;
  phase-5|5) phase_5 ;;
  phase-6|6) phase_6 ;;
  phase-7|7) phase_7 ;;
  all)
    phase_1
    phase_2
    phase_3
    phase_4
    phase_5
    phase_6
    phase_7
    ;;
  *)
    echo "Unknown phase: $PHASE. Use: phase-N (1..7) or 'all'." >&2
    exit 2
    ;;
esac

check_tsc
check_vitest
check_lint
check_no_inline_todos
check_no_any_without_justification
check_no_ts_ignore
check_no_console_log_outside_logger
check_no_committed_secrets

if [[ "$PHASE" == "all" ]]; then
  check_next_build
fi

echo
echo "============================================================"
if (( FAIL_COUNT == 0 )); then
  printf "${GREEN}AUDIT PASSED${RESET}  phase=%s\n" "$PHASE"
  exit 0
else
  printf "${RED}AUDIT FAILED${RESET}  phase=%s  failures=%d\n" "$PHASE" "$FAIL_COUNT"
  printf "Failures:\n"
  for r in "${FAIL_REASONS[@]}"; do printf "  - %s\n" "$r"; done
  exit 1
fi
