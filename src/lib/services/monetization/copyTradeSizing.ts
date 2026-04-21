import type { PositionState } from '@/types/execution';
import type { Subscription } from '@/types/users';
import type { ActionRecommendation } from '@/types/cognition';
import { MAX_LEVERAGE_HARD_CAP } from '@/config/risk';

export interface SizedMirror {
  collateralUsd: number;
  leverage: number;
  sizeAmount: number;
  skipReason: string | null;
}

export function sizeMirrorForUser(
  agentPosition: PositionState,
  subscription: Subscription,
  recommendation: ActionRecommendation,
  indexPrice: number
): SizedMirror {
  if (!subscription.active) {
    return { collateralUsd: 0, leverage: 0, sizeAmount: 0, skipReason: 'subscription_inactive' };
  }
  if (!subscription.sessionSignerGranted) {
    return { collateralUsd: 0, leverage: 0, sizeAmount: 0, skipReason: 'signer_not_granted' };
  }
  if (recommendation.confidence < subscription.minConfidence) {
    return {
      collateralUsd: 0,
      leverage: 0,
      sizeAmount: 0,
      skipReason: `confidence_below_user_threshold(${subscription.minConfidence})`,
    };
  }

  const collateralUsd = Math.min(agentPosition.collateralUsd, subscription.maxPositionUsd);
  if (collateralUsd <= 0) {
    return { collateralUsd: 0, leverage: 0, sizeAmount: 0, skipReason: 'zero_collateral' };
  }

  const targetLeverage = agentPosition.leverage * subscription.leverageMultiplier;
  const leverage = Math.min(targetLeverage, MAX_LEVERAGE_HARD_CAP);
  if (leverage <= 0) {
    return { collateralUsd: 0, leverage: 0, sizeAmount: 0, skipReason: 'zero_leverage' };
  }

  const notionalUsd = collateralUsd * leverage;
  const sizeAmount = indexPrice > 0 ? notionalUsd / indexPrice : 0;
  if (sizeAmount <= 0) {
    return { collateralUsd: 0, leverage: 0, sizeAmount: 0, skipReason: 'invalid_index_price' };
  }

  return { collateralUsd, leverage, sizeAmount, skipReason: null };
}
