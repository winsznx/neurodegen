import {
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
  type RegimeParameters,
} from '@/config/regime';
import type { AggregateMetrics, RegimeLabel } from '@/types/perception';

export interface RegimeClassification {
  regime: RegimeLabel;
  previousRegime: RegimeLabel | null;
  parameters: RegimeParameters;
  transitionedAt: number;
  transitionRationale: string;
}

export interface RegimeClassifierState {
  lastRegime: RegimeLabel | null;
  /** Timestamp of the first non-volatile metrics snapshot after entering volatile. */
  lastVolatileExitCandidateAt: number | null;
}

export function emptyRegimeState(): RegimeClassifierState {
  return { lastRegime: null, lastVolatileExitCandidateAt: null };
}

/**
 * Classify the current regime. Reads + mutates the state for the volatile
 * exit cooldown - once the regime enters volatile, it stays volatile until
 * `REGIME_VOLATILE_EXIT_COOLDOWN_MS` of sustained recovery is observed.
 *
 * The caller still owns `state.lastRegime` and updates it via
 * `advanceRegimeState` after acting on the classification (atomic write).
 */
export function classifyRegime(
  metrics: AggregateMetrics,
  state: RegimeClassifierState,
  now: number = Date.now(),
): RegimeClassification {
  const previousRegime = state.lastRegime;
  const metricsVolatile = isVolatile(metrics);

  if (previousRegime === 'volatile') {
    if (metricsVolatile) {
      // Still volatile - reset any exit candidate.
      state.lastVolatileExitCandidateAt = null;
      return classification('volatile', previousRegime, now, 'metrics remain volatile');
    }
    // Metrics recovered - start or honor the cooldown.
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
    // Cooldown satisfied - clear candidate and exit volatile.
    state.lastVolatileExitCandidateAt = null;
    const next = baseClassify(metrics);
    return classification(
      next,
      previousRegime,
      now,
      `${rationaleFor(metrics, next)} (volatile exit cooldown satisfied)`,
    );
  }

  // For all non-volatile predecessors, evaluate freshly.
  const next = baseClassify(metrics);
  return classification(next, previousRegime, now, rationaleFor(metrics, next));
}

/**
 * Commit the classification result back to the state. Call once after acting
 * on the classification (e.g. broadcasting the regime change event).
 */
export function advanceRegimeState(
  state: RegimeClassifierState,
  classification: RegimeClassification,
): void {
  state.lastRegime = classification.regime;
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

function baseClassify(metrics: AggregateMetrics): RegimeLabel {
  if (isVolatile(metrics)) return 'volatile';
  if (isMomentum(metrics)) return 'momentum';
  if (isActive(metrics)) return 'active';
  return 'quiet';
}

function isVolatile(metrics: AggregateMetrics): boolean {
  if (
    metrics.fearGreedValue < REGIME_FG_VOLATILE_LOW ||
    metrics.fearGreedValue > REGIME_FG_VOLATILE_HIGH
  ) {
    return true;
  }
  for (const pair of Object.values(metrics.fundingRatesByPair)) {
    if (Math.abs(pair.rateAnnualized) > REGIME_VOLATILE_FUNDING_RATE_MAX) {
      return true;
    }
  }
  return false;
}

function isMomentum(metrics: AggregateMetrics): boolean {
  if (metrics.activeSurgeTokens < REGIME_SURGE_MOMENTUM_MIN) return false;
  if (metrics.fearGreedValue < 60 || metrics.fearGreedValue > 85) return false;
  let kolHotTokens = 0;
  for (const entry of Object.values(metrics.kolActivityByToken)) {
    if (entry.velocityPerHour >= REGIME_KOL_MOMENTUM_VELOCITY_MIN) kolHotTokens += 1;
  }
  return kolHotTokens >= REGIME_KOL_MOMENTUM_TOKEN_MIN;
}

function isActive(metrics: AggregateMetrics): boolean {
  if (metrics.activeSurgeTokens < REGIME_SURGE_ACTIVE_MIN) return false;
  if (metrics.fearGreedValue < 40 || metrics.fearGreedValue > 70) return false;
  return true;
}

function rationaleFor(metrics: AggregateMetrics, regime: RegimeLabel): string {
  switch (regime) {
    case 'volatile':
      return `volatile: F&G ${metrics.fearGreedValue} or funding-rate spike`;
    case 'momentum':
      return `momentum: F&G ${metrics.fearGreedValue}, surge ${metrics.activeSurgeTokens} tokens, KOL velocity hit`;
    case 'active':
      return `active: F&G ${metrics.fearGreedValue}, surge ${metrics.activeSurgeTokens} tokens`;
    default:
      return `quiet: F&G ${metrics.fearGreedValue} between ${REGIME_FG_QUIET_LOW}-${REGIME_FG_QUIET_HIGH}, surge below threshold`;
  }
}
