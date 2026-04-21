import {
  MAX_CONCURRENT_POSITIONS,
  MAX_TOTAL_EXPOSURE_RATIO,
  PER_POSITION_SIZE_CAP_USD,
  MAX_DAILY_LOSS_USD,
} from '@/config/risk';
import type { PositionState } from '@/types/execution';

export class RiskManager {
  canOpenPosition(
    proposedNotionalUsd: number,
    openPositions: PositionState[],
    walletBalanceUsd: number,
    dailyRealizedLossUsd: number
  ): { allowed: boolean; reason: string } {
    if (openPositions.length >= MAX_CONCURRENT_POSITIONS) {
      return {
        allowed: false,
        reason: `Max concurrent positions reached (${MAX_CONCURRENT_POSITIONS})`,
      };
    }

    if (proposedNotionalUsd > PER_POSITION_SIZE_CAP_USD) {
      return {
        allowed: false,
        reason: `Position notional $${proposedNotionalUsd.toFixed(2)} exceeds cap of $${PER_POSITION_SIZE_CAP_USD}`,
      };
    }

    const currentExposure = openPositions.reduce(
      (sum, p) => sum + p.collateralUsd * p.leverage,
      0
    );
    const maxExposure = walletBalanceUsd * MAX_TOTAL_EXPOSURE_RATIO;
    if (currentExposure + proposedNotionalUsd > maxExposure) {
      return {
        allowed: false,
        reason: `Total exposure $${(currentExposure + proposedNotionalUsd).toFixed(2)} exceeds limit $${maxExposure.toFixed(2)}`,
      };
    }

    if (dailyRealizedLossUsd >= MAX_DAILY_LOSS_USD) {
      return {
        allowed: false,
        reason: `Daily loss $${dailyRealizedLossUsd} exceeds limit $${MAX_DAILY_LOSS_USD}`,
      };
    }

    return { allowed: true, reason: 'All checks passed' };
  }

  isInCooldown(lastLossTimestamp: number | null, cooldownMs: number): boolean {
    if (lastLossTimestamp === null) return false;
    return Date.now() - lastLossTimestamp < cooldownMs;
  }
}

export const riskManager = new RiskManager();
