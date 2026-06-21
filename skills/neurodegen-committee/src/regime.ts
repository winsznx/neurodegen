import {
  ALLOWLIST_SYMBOLS,
  REGIME_FG_QUIET_HIGH,
  REGIME_FG_QUIET_LOW,
  REGIME_FG_VOLATILE_HIGH,
  REGIME_FG_VOLATILE_LOW,
  REGIME_KOL_MOMENTUM_TOKEN_MIN,
  REGIME_KOL_MOMENTUM_VELOCITY_MIN,
  REGIME_PARAMS,
  REGIME_SURGE_ACTIVE_MIN,
  REGIME_SURGE_MOMENTUM_MIN,
  REGIME_VOLATILE_EXIT_COOLDOWN_MS,
  REGIME_VOLATILE_FUNDING_RATE_MAX,
  SURGE_PCT_CHANGE_1H_MIN,
} from './config';
import type {
  MarketSnapshot,
  RegimeClassification,
  RegimeClassifierState,
  RegimeLabel,
} from './types';

export function emptyRegimeState(): RegimeClassifierState {
  return { lastRegime: null, lastVolatileExitCandidateAt: null };
}

/**
 * Compute `activeSurgeTokens` from raw quotes. Useful when the caller hasn't
 * pre-computed the field on the snapshot.
 */
export function computeActiveSurgeTokens(snapshot: MarketSnapshot): number {
  const allow = new Set<string>(ALLOWLIST_SYMBOLS as ReadonlyArray<string>);
  let count = 0;
  for (const mover of snapshot.topMoversByVolume) {
    if (!allow.has(mover.symbol)) continue;
    if (Math.abs(mover.percentChange1h) >= SURGE_PCT_CHANGE_1H_MIN) count += 1;
  }
  return count;
}

/**
 * Classify the regime with sticky-volatile semantics. Mutates the state's
 * `lastVolatileExitCandidateAt` field only. `lastRegime` is owned by the
 * caller (call `advanceRegimeState` after acting on the classification).
 */
export function classifyRegime(
  snapshot: MarketSnapshot,
  state: RegimeClassifierState,
  now: number = Date.now(),
): RegimeClassification {
  const previousRegime = state.lastRegime;
  const metricsVolatile = isVolatile(snapshot);

  if (previousRegime === 'volatile') {
    if (metricsVolatile) {
      state.lastVolatileExitCandidateAt = null;
      return classification(
        'volatile',
        previousRegime,
        now,
        'metrics remain volatile',
      );
    }
    if (state.lastVolatileExitCandidateAt === null) {
      state.lastVolatileExitCandidateAt = now;
      return classification(
        'volatile',
        previousRegime,
        now,
        'metrics recovered; volatile exit cooldown started',
      );
    }
    const elapsed = now - state.lastVolatileExitCandidateAt;
    if (elapsed < REGIME_VOLATILE_EXIT_COOLDOWN_MS) {
      return classification(
        'volatile',
        previousRegime,
        now,
        `volatile exit cooldown ${Math.max(0, REGIME_VOLATILE_EXIT_COOLDOWN_MS - elapsed)}ms remaining`,
      );
    }
    state.lastVolatileExitCandidateAt = null;
    const next = baseClassify(snapshot);
    return classification(
      next,
      previousRegime,
      now,
      `${rationaleFor(snapshot, next)} (volatile exit cooldown satisfied)`,
    );
  }

  const next = baseClassify(snapshot);
  return classification(next, previousRegime, now, rationaleFor(snapshot, next));
}

export function advanceRegimeState(
  state: RegimeClassifierState,
  result: RegimeClassification,
): void {
  state.lastRegime = result.regime;
}

function classification(
  regime: RegimeLabel,
  previousRegime: RegimeLabel | null,
  now: number,
  rationale: string,
): RegimeClassification {
  return {
    regime,
    previousRegime,
    parameters: REGIME_PARAMS[regime],
    transitionedAt: now,
    transitionRationale: rationale,
  };
}

function baseClassify(snapshot: MarketSnapshot): RegimeLabel {
  if (isVolatile(snapshot)) return 'volatile';
  if (isMomentum(snapshot)) return 'momentum';
  if (isActive(snapshot)) return 'active';
  return 'quiet';
}

function isVolatile(snapshot: MarketSnapshot): boolean {
  if (
    snapshot.fearGreedValue < REGIME_FG_VOLATILE_LOW ||
    snapshot.fearGreedValue > REGIME_FG_VOLATILE_HIGH
  ) {
    return true;
  }
  for (const pair of Object.values(snapshot.fundingRatesByPair)) {
    if (Math.abs(pair.rateAnnualized) > REGIME_VOLATILE_FUNDING_RATE_MAX) {
      return true;
    }
  }
  return false;
}

function isMomentum(snapshot: MarketSnapshot): boolean {
  if (snapshot.activeSurgeTokens < REGIME_SURGE_MOMENTUM_MIN) return false;
  if (snapshot.fearGreedValue < 60 || snapshot.fearGreedValue > 85) return false;
  let kolHotTokens = 0;
  for (const entry of Object.values(snapshot.kolActivityByToken)) {
    if (entry.velocityPerHour >= REGIME_KOL_MOMENTUM_VELOCITY_MIN) {
      kolHotTokens += 1;
    }
  }
  return kolHotTokens >= REGIME_KOL_MOMENTUM_TOKEN_MIN;
}

function isActive(snapshot: MarketSnapshot): boolean {
  if (snapshot.activeSurgeTokens < REGIME_SURGE_ACTIVE_MIN) return false;
  if (snapshot.fearGreedValue < 40 || snapshot.fearGreedValue > 70) return false;
  return true;
}

function rationaleFor(snapshot: MarketSnapshot, regime: RegimeLabel): string {
  switch (regime) {
    case 'volatile':
      return `volatile: F&G ${snapshot.fearGreedValue} or funding-rate spike`;
    case 'momentum':
      return `momentum: F&G ${snapshot.fearGreedValue}, surge ${snapshot.activeSurgeTokens} tokens, KOL velocity hit`;
    case 'active':
      return `active: F&G ${snapshot.fearGreedValue}, surge ${snapshot.activeSurgeTokens} tokens`;
    default:
      return `quiet: F&G ${snapshot.fearGreedValue} outside ${REGIME_FG_QUIET_LOW}-${REGIME_FG_QUIET_HIGH} band or surge below ${REGIME_SURGE_ACTIVE_MIN}`;
  }
}
