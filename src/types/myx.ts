import type {
  PlaceOrderParams,
  PositionType,
  PositionTpSlOrderParams,
  UpdateOrderTpSlParams,
} from '@myx-trade/sdk';

export type { PlaceOrderParams, PositionType, PositionTpSlOrderParams, UpdateOrderTpSlParams };

export type DirectionEnum = 0 | 1;

export interface MyxOrderContext {
  pair: string;
  poolId: string;
  marketId: string;
  contractIndex: number;
  positionId: string;
  address: `0x${string}`;
  executionFeeToken: string;
  chainId: number;
}
