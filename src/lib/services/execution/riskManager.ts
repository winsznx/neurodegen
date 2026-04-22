import {
  MAX_CONCURRENT_POSITIONS,
  MAX_TOTAL_EXPOSURE_RATIO,
  PER_POSITION_SIZE_CAP_USD,
  MAX_DAILY_LOSS_USD,
  MAX_LEVERAGE_HARD_CAP,
  MIN_POSITION_SIZE_USD,
} from '@/config/risk';
import type { PositionState } from '@/types/execution';

export class RiskManager {
  resolveExecutableCollateralUsd(
    requestedCollateralUsd: number,
    openPositions: PositionState[],
    walletCollateralUsd: number
  ): number {
    if (!Number.isFinite(requestedCollateralUsd) || requestedCollateralUsd <= 0) {
      return 0;
    }

    const currentDeployedCollateral = openPositions.reduce(
      (sum, p) => sum + p.collateralUsd,
      0
    );
    const deployableCollateralCap = walletCollateralUsd * MAX_TOTAL_EXPOSURE_RATIO;
    const exposureHeadroomUsd = Math.max(deployableCollateralCap - currentDeployedCollateral, 0);
    const executableCollateralUsd = Math.min(
      requestedCollateralUsd,
      PER_POSITION_SIZE_CAP_USD,
      walletCollateralUsd,
      exposureHeadroomUsd
    );

    if (!Number.isFinite(executableCollateralUsd) || executableCollateralUsd < MIN_POSITION_SIZE_USD) {
      return 0;
    }

    return Math.floor(executableCollateralUsd * 100) / 100;
  }

  canOpenPosition(
    proposedCollateralUsd: number,
    leverage: number,
    openPositions: PositionState[],
    walletCollateralUsd: number,
    dailyRealizedLossUsd: number
  ): { allowed: boolean; reason: string } {
    if (openPositions.length >= MAX_CONCURRENT_POSITIONS) {
      return {
        allowed: false,
        reason: `Max concurrent positions reached (${MAX_CONCURRENT_POSITIONS})`,
      };
    }

    if (proposedCollateralUsd > PER_POSITION_SIZE_CAP_USD) {
      return {
        allowed: false,
        reason: `Position collateral $${proposedCollateralUsd.toFixed(2)} exceeds cap of $${PER_POSITION_SIZE_CAP_USD}`,
      };
    }

    if (leverage > MAX_LEVERAGE_HARD_CAP) {
      return {
        allowed: false,
        reason: `Leverage ${leverage} exceeds hard cap ${MAX_LEVERAGE_HARD_CAP}x`,
      };
    }

    const currentExposure = openPositions.reduce(
      (sum, p) => sum + p.collateralUsd,
      0
    );
    const maxExposure = walletCollateralUsd * MAX_TOTAL_EXPOSURE_RATIO;
    if (currentExposure + proposedCollateralUsd > maxExposure) {
      return {
        allowed: false,
        reason: `Total deployed collateral $${(currentExposure + proposedCollateralUsd).toFixed(2)} exceeds limit $${maxExposure.toFixed(2)}`,
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
