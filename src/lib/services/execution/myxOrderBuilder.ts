import type { ActionRecommendation } from '@/types/cognition';
import type { PositionState } from '@/types/execution';
import type { PlaceOrderParams, MyxOrderContext } from '@/types/myx';
import type { RegimeParameters } from '@/lib/services/cognition/regimeClassifier';
import { OrderType, TriggerType, Direction, TimeInForce, ChainId } from '@myx-trade/sdk';
import { MAX_SLIPPAGE, DEFAULT_LEVERAGE } from '@/config/execution';
import { toCollateralScale, toPriceScale } from '@/lib/utils/decimalScaling';

/**
 * Scale a human-readable USD/token amount to its 18-decimal integer string
 * representation required by the MYX SDK (BigInt-compatible).
 */
function scaleAmount(value: number): string {
  return toCollateralScale(value).toString();
}

/**
 * Scale a human-readable price to its 30-decimal integer string
 * representation required by the MYX SDK (BigInt-compatible).
 */
function scalePrice(value: number): string {
  return toPriceScale(value).toString();
}

function directionFor(action: ActionRecommendation['action']): Direction {
  if (action === 'open_long') return Direction.LONG;
  if (action === 'open_short') return Direction.SHORT;
  throw new Error(`Cannot derive direction from action "${action}"`);
}

export interface HumanReadableOrderMeta {
  collateralUsd: number;
  sizeAmount: number;
  tpPrice: number;
  slPrice: number;
}

export function buildIncreaseOrderParams(
  action: ActionRecommendation,
  regime: RegimeParameters,
  currentIndexPrice: number,
  context: MyxOrderContext
): { params: PlaceOrderParams; meta: HumanReadableOrderMeta } {
  const collateralUsd = action.positionSizeUSD ?? 0;
  const leverage = action.leverageMultiplier ?? regime.maxLeverage ?? DEFAULT_LEVERAGE;
  const notionalUsd = collateralUsd * leverage;
  const size = notionalUsd / currentIndexPrice;
  const isLong = action.action === 'open_long';
  const tpPct = action.tpPercentage ?? regime.tpPercentage;
  const slPct = action.slPercentage ?? regime.slPercentage;

  const tpPrice = isLong
    ? currentIndexPrice * (1 + tpPct)
    : currentIndexPrice * (1 - tpPct);
  const slPrice = isLong
    ? currentIndexPrice * (1 - slPct)
    : currentIndexPrice * (1 + slPct);

  const params: PlaceOrderParams = {
    chainId: context.chainId,
    address: context.address,
    poolId: context.poolId,
    // Empty string for fresh opens → SDK uses placeOrderWithSalt (new position).
    // Non-empty triggers placeOrderWithPosition (existing position), which is wrong
    // for fresh opens — our local UUID is not a valid MYX on-chain position ID.
    positionId: '',
    orderType: OrderType.MARKET,
    triggerType: TriggerType.NONE,
    direction: directionFor(action.action),
    collateralAmount: scaleAmount(collateralUsd),
    size: scaleAmount(size),
    price: '0',
    timeInForce: TimeInForce.IOC,
    postOnly: false,
    slippagePct: (MAX_SLIPPAGE * 100).toString(),
    executionFeeToken: context.executionFeeToken,
    leverage,
    tpSize: scaleAmount(size),
    tpPrice: scalePrice(tpPrice),
    slSize: scaleAmount(size),
    slPrice: scalePrice(slPrice),
  };

  const meta: HumanReadableOrderMeta = {
    collateralUsd,
    sizeAmount: size,
    tpPrice,
    slPrice,
  };

  return { params, meta };
}

export function buildDecreaseOrderParams(
  position: PositionState,
  context: MyxOrderContext
): PlaceOrderParams {
  return {
    chainId: context.chainId,
    address: context.address,
    poolId: context.poolId,
    positionId: context.positionId,
    orderType: OrderType.MARKET,
    triggerType: TriggerType.NONE,
    direction: position.isLong ? Direction.LONG : Direction.SHORT,
    collateralAmount: '0',
    size: scaleAmount(position.sizeAmount),
    price: '0',
    timeInForce: TimeInForce.IOC,
    postOnly: false,
    slippagePct: (MAX_SLIPPAGE * 100).toString(),
    executionFeeToken: context.executionFeeToken,
    leverage: position.leverage,
  };
}

export function directionToBool(direction: Direction): boolean {
  return direction === Direction.LONG;
}

export { ChainId };
