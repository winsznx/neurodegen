import type { MyxClient } from '@myx-trade/sdk';
import type { PlaceOrderParams } from '@/types/myx';
import { ENABLE_EXECUTION, DRY_RUN_MODE } from '@/config/features';

export interface SubmitResult {
  txHash: `0x${string}`;
  orderId: string | null;
  dryRun: boolean;
}

const DRY_RUN_TX_HASH = `0x${'0'.repeat(64)}` as `0x${string}`;

function serializeForLog(params: PlaceOrderParams): string {
  return JSON.stringify({
    poolId: params.poolId,
    positionId: params.positionId,
    direction: params.direction,
    collateralAmount: params.collateralAmount,
    size: params.size,
    leverage: params.leverage,
    tpPrice: params.tpPrice,
    slPrice: params.slPrice,
  });
}

export class TransactionSubmitter {
  constructor(private sdk: MyxClient) {}

  async submitIncreaseOrder(
    params: PlaceOrderParams,
    networkFee: string
  ): Promise<SubmitResult> {
    if (!ENABLE_EXECUTION) {
      throw new Error('ENABLE_EXECUTION is false — submission blocked');
    }

    if (DRY_RUN_MODE) {
      console.log('[dry-run] increase order:', serializeForLog(params), 'fee=', networkFee);
      return { txHash: DRY_RUN_TX_HASH, orderId: null, dryRun: true };
    }

    const result = await this.sdk.order.createIncreaseOrder(params, networkFee);
    if ('data' in result && result.data) {
      return {
        txHash: result.data.transactionHash,
        orderId: null,
        dryRun: false,
      };
    }
    throw new Error(`MYX createIncreaseOrder failed: ${String(result.message)}`);
  }

  async submitDecreaseOrder(params: PlaceOrderParams): Promise<SubmitResult> {
    if (!ENABLE_EXECUTION) {
      throw new Error('ENABLE_EXECUTION is false — submission blocked');
    }

    if (DRY_RUN_MODE) {
      console.log('[dry-run] decrease order:', serializeForLog(params));
      return { txHash: DRY_RUN_TX_HASH, orderId: null, dryRun: true };
    }

    const result = await this.sdk.order.createDecreaseOrder(params);
    if ('data' in result && result.data) {
      return {
        txHash: result.data.transactionHash,
        orderId: null,
        dryRun: false,
      };
    }
    throw new Error(`MYX createDecreaseOrder failed: ${String(result.message)}`);
  }
}
