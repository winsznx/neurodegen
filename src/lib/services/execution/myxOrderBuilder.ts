import type { ActionRecommendation } from '@/types/cognition';
import type { PositionState } from '@/types/execution';
import type { PlaceOrderParams, MyxOrderContext } from '@/types/myx';
import type { RegimeParameters } from '@/lib/services/cognition/regimeClassifier';
import { OrderType, TriggerType, Direction, TimeInForce, ChainId } from '@myx-trade/sdk';
import { MAX_SLIPPAGE, DEFAULT_LEVERAGE } from '@/config/execution';

function toFixedString(value: number, decimals = 8): string {
  if (!Number.isFinite(value)) return '0';
  return value.toFixed(decimals);
}

function directionFor(action: ActionRecommendation['action']): Direction {
  if (action === 'open_long') return Direction.LONG;
  if (action === 'open_short') return Direction.SHORT;
  throw new Error(`Cannot derive direction from action "${action}"`);
}

export function buildIncreaseOrderParams(
  action: ActionRecommendation,
  regime: RegimeParameters,
  currentIndexPrice: number,
  context: MyxOrderContext
): PlaceOrderParams {
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

  return {
    chainId: context.chainId,
    address: context.address,
    poolId: context.poolId,
    positionId: context.positionId,
    orderType: OrderType.MARKET,
    triggerType: TriggerType.NONE,
    direction: directionFor(action.action),
    collateralAmount: toFixedString(collateralUsd),
    size: toFixedString(size),
    price: '0',
    timeInForce: TimeInForce.IOC,
    postOnly: false,
    slippagePct: (MAX_SLIPPAGE * 100).toString(),
    executionFeeToken: context.executionFeeToken,
    leverage,
    tpSize: toFixedString(size),
    tpPrice: toFixedString(tpPrice),
    slSize: toFixedString(size),
    slPrice: toFixedString(slPrice),
  };
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
    size: toFixedString(position.sizeAmount),
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
