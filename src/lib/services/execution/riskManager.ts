import {
  AGENT_BASE_POSITION_SIZE_USD,
  DRAWDOWN_ALERT_PCT,
  DRAWDOWN_DEFENSIVE_PCT,
  DRAWDOWN_DISQUALIFICATION_PCT,
  DRAWDOWN_HALT_PCT,
  MAX_CONCURRENT_POSITIONS,
  MAX_DAILY_LOSS_USD,
  MAX_TOTAL_EXPOSURE_RATIO,
  MIN_POSITION_SIZE_USD,
  PER_POSITION_SIZE_CAP_USD,
} from '@/config/risk';
import { DEFAULT_MANDATE, type MandateConfig } from '@/types/mandate';
import type {
  ActionRecommendation,
  ExecutionResultRecord,
} from '@/types/cognition';
import type {
  PositionState,
  RiskManagerState,
  RiskManagerVerdict,
} from '@/types/execution';

export type DrawdownTier = 'normal' | 'alert' | 'defensive' | 'halt' | 'disqualified';

/**
 * Classify drawdown into one of five tiers. The halt threshold is the LESSER
 * of the global `DRAWDOWN_HALT_PCT` (25% — the competition-survival floor) and
 * the user's `mandate.maxDrawdownPct` (their personal halt). This way a
 * conservative user who sets 15% gets halted at 15% even though the global
 * rules wouldn't halt until 25%. An aggressive user who sets 28% is still
 * halted at 25% by the global floor.
 *
 * The 30% disqualification threshold is competition-fixed and not user-overridable.
 */
export function classifyDrawdownTier(
  drawdown: number,
  mandateHaltPct?: number,
): DrawdownTier {
  const effectiveHalt =
    mandateHaltPct !== undefined
      ? Math.min(DRAWDOWN_HALT_PCT, Math.max(DRAWDOWN_ALERT_PCT, mandateHaltPct))
      : DRAWDOWN_HALT_PCT;
  // Defensive tier is always 5pp below the effective halt so the ladder
  // collapses sensibly for any mandate value.
  const effectiveDefensive = Math.max(DRAWDOWN_ALERT_PCT, effectiveHalt - 0.05);
  if (drawdown >= DRAWDOWN_DISQUALIFICATION_PCT) return 'disqualified';
  if (drawdown >= effectiveHalt) return 'halt';
  if (drawdown >= effectiveDefensive) return 'defensive';
  if (drawdown >= DRAWDOWN_ALERT_PCT) return 'alert';
  return 'normal';
}

export class RiskManager {
  constructor(private mandate: MandateConfig = DEFAULT_MANDATE) {}

  setMandate(mandate: MandateConfig): void {
    this.mandate = mandate;
  }

  canAct(
    recommendation: ActionRecommendation,
    state: RiskManagerState,
    openPositions: PositionState[],
    portfolioValueUSD: number,
  ): RiskManagerVerdict {
    if (recommendation.action === 'hold') {
      return { approved: false, rejectionReason: 'recommendation is hold', adjustedPositionSizeUSD: null };
    }

    const drawdownTier = classifyDrawdownTier(
      state.currentDrawdownFromPeak,
      this.mandate.maxDrawdownPct,
    );

    if (drawdownTier === 'disqualified') {
      return {
        approved: false,
        rejectionReason: `drawdown ${(state.currentDrawdownFromPeak * 100).toFixed(2)}% at competition disqualification floor`,
        adjustedPositionSizeUSD: null,
      };
    }
    if (drawdownTier === 'halt') {
      return {
        approved: false,
        rejectionReason: `drawdown ${(state.currentDrawdownFromPeak * 100).toFixed(2)}% ≥ ${DRAWDOWN_HALT_PCT * 100}% halt threshold`,
        adjustedPositionSizeUSD: null,
      };
    }
    if (drawdownTier === 'defensive' && recommendation.action !== 'close_position') {
      return {
        approved: false,
        rejectionReason: `drawdown ${(state.currentDrawdownFromPeak * 100).toFixed(2)}% in defensive band — close-only`,
        adjustedPositionSizeUSD: null,
      };
    }
    if (state.consecutiveLosses >= this.mandate.consecutiveLossHalt) {
      return {
        approved: false,
        rejectionReason: `${state.consecutiveLosses} consecutive losses ≥ mandate halt ${this.mandate.consecutiveLossHalt}`,
        adjustedPositionSizeUSD: null,
      };
    }

    if (recommendation.action === 'close_position') {
      // Closes are always approved if we have an open position to close.
      const target = openPositions[0];
      if (!target) {
        return { approved: false, rejectionReason: 'no open positions to close', adjustedPositionSizeUSD: null };
      }
      return { approved: true, rejectionReason: null, adjustedPositionSizeUSD: 0 };
    }

    if (openPositions.length >= MAX_CONCURRENT_POSITIONS) {
      return {
        approved: false,
        rejectionReason: `${openPositions.length} ≥ ${MAX_CONCURRENT_POSITIONS} max concurrent positions`,
        adjustedPositionSizeUSD: null,
      };
    }

    if (state.dailyPnLUSD <= -MAX_DAILY_LOSS_USD) {
      return {
        approved: false,
        rejectionReason: `daily PnL ${state.dailyPnLUSD.toFixed(2)} ≤ -${MAX_DAILY_LOSS_USD} cap`,
        adjustedPositionSizeUSD: null,
      };
    }

    const requested = recommendation.positionSizeUSD ?? AGENT_BASE_POSITION_SIZE_USD;
    const maxPerToken = portfolioValueUSD * this.mandate.maxPositionPct;
    const totalExposure = state.totalExposureUSD;
    const maxTotal = portfolioValueUSD * MAX_TOTAL_EXPOSURE_RATIO;
    const headroom = Math.max(0, maxTotal - totalExposure);

    let size = Math.min(
      requested,
      maxPerToken,
      headroom,
      PER_POSITION_SIZE_CAP_USD,
    );

    if (drawdownTier === 'alert') {
      size = size * 0.5;
    }

    if (size < MIN_POSITION_SIZE_USD) {
      return {
        approved: false,
        rejectionReason: `adjusted size $${size.toFixed(2)} below min $${MIN_POSITION_SIZE_USD}`,
        adjustedPositionSizeUSD: null,
      };
    }

    return {
      approved: true,
      rejectionReason: null,
      adjustedPositionSizeUSD: Number(size.toFixed(2)),
    };
  }

  applyExecutionResult(
    state: RiskManagerState,
    result: ExecutionResultRecord,
    pnlUSD: number | null,
  ): RiskManagerState {
    if (pnlUSD === null) return state;
    const next: RiskManagerState = { ...state };
    next.dailyPnLUSD += pnlUSD;
    if (pnlUSD < 0) {
      next.consecutiveLosses += 1;
    } else if (pnlUSD > 0) {
      next.consecutiveLosses = 0;
    }
    return next;
  }

  currentMandate(): MandateConfig {
    return this.mandate;
  }
}

export const riskManager = new RiskManager();

export function defaultRiskManagerState(seedPortfolioUSD: number): RiskManagerState {
  return {
    currentDrawdownFromPeak: 0,
    consecutiveLosses: 0,
    positionsOpenCount: 0,
    totalExposureUSD: 0,
    dailyPnLUSD: 0,
    dailyTradeCount: 0,
    lastProbeTradeAt: null,
    peakPortfolioValueUSD: seedPortfolioUSD,
  };
}

export function updateDrawdownFromValue(
  state: RiskManagerState,
  currentValueUSD: number,
): RiskManagerState {
  const peak = Math.max(state.peakPortfolioValueUSD, currentValueUSD);
  const drawdown = peak > 0 ? Math.max(0, 1 - currentValueUSD / peak) : 0;
  return { ...state, peakPortfolioValueUSD: peak, currentDrawdownFromPeak: drawdown };
}
