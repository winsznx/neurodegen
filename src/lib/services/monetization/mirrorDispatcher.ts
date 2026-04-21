import type { ActionRecommendation } from '@/types/cognition';
import type { PositionState } from '@/types/execution';
import type { UserRecord, UserPosition } from '@/types/users';
import { getActiveSubscriptions } from '@/lib/queries/subscriptions';
import { getUserById } from '@/lib/queries/users';
import { insertUserPosition } from '@/lib/queries/userPositions';
import { getPoolByPair, type PoolEntry } from '@/lib/clients/myxPools';
import { getSinglePrice } from '@/lib/clients/myxSdk';
import { TransactionSubmitter } from '@/lib/services/execution/transactionSubmitter';
import { buildIncreaseOrderParams } from '@/lib/services/execution/myxOrderBuilder';
import { sizeMirrorForUser } from './copyTradeSizing';
import { buildUserMyxClient } from './userMyxClient';
import { closeMirrorsForSource, type MirrorExitOutcome } from './mirrorExit';
import { BSC_CHAIN_ID } from '@/config/chains';

export interface MirrorOutcome {
  userId: string;
  action: 'opened' | 'closed' | 'skipped' | 'failed';
  reason?: string;
  txHash?: string;
}

export class MirrorDispatcher {
  async onAgentEntry(
    agentPosition: PositionState,
    recommendation: ActionRecommendation
  ): Promise<MirrorOutcome[]> {
    const subs = await getActiveSubscriptions().catch((err) => {
      console.error('[mirror] getActiveSubscriptions failed:', err);
      return [];
    });
    if (subs.length === 0) return [];

    const pool = await getPoolByPair(agentPosition.pair);
    if (!pool) return subs.map((s) => ({ userId: s.userId, action: 'failed', reason: 'pool_not_found' }));

    const indexPrice = await getSinglePrice(pool.poolId).catch(() => 0);
    if (indexPrice <= 0) return subs.map((s) => ({ userId: s.userId, action: 'failed', reason: 'no_index_price' }));

    const outcomes: MirrorOutcome[] = [];
    await Promise.all(
      subs.map(async (sub) => {
        try {
          const sized = sizeMirrorForUser(agentPosition, sub, recommendation, indexPrice);
          if (sized.skipReason) {
            await recordSkipped(sub.userId, agentPosition, sized.skipReason);
            outcomes.push({ userId: sub.userId, action: 'skipped', reason: sized.skipReason });
            return;
          }
          const user = await getUserById(sub.userId);
          if (!user || !user.walletId) {
            await recordSkipped(sub.userId, agentPosition, 'no_wallet_id');
            outcomes.push({ userId: sub.userId, action: 'skipped', reason: 'no_wallet_id' });
            return;
          }
          const outcome = await mirrorOne(user, agentPosition, sized, pool, indexPrice);
          outcomes.push(outcome);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[mirror] user ${sub.userId} failed:`, msg);
          outcomes.push({ userId: sub.userId, action: 'failed', reason: msg });
        }
      })
    );
    return outcomes;
  }

  async onAgentExit(agentPosition: PositionState): Promise<MirrorExitOutcome[]> {
    return closeMirrorsForSource(agentPosition);
  }
}

async function mirrorOne(
  user: UserRecord,
  agentPosition: PositionState,
  sized: { collateralUsd: number; leverage: number; sizeAmount: number },
  pool: PoolEntry,
  indexPrice: number
): Promise<MirrorOutcome> {
  const sdk = buildUserMyxClient(user);
  const submitter = new TransactionSubmitter(sdk);

  const mirrorAction: ActionRecommendation = {
    action: agentPosition.isLong ? 'open_long' : 'open_short',
    pair: agentPosition.pair,
    confidence: 1,
    positionSizeUSD: sized.collateralUsd,
    leverageMultiplier: sized.leverage,
    tpPercentage: null,
    slPercentage: null,
    rationale: `mirror of agent position ${agentPosition.positionId}`,
  };

  const userPositionId = crypto.randomUUID();
  const regimeParams = {
    positionSizeMultiplier: 1,
    maxLeverage: sized.leverage,
    tpPercentage: 0.05,
    slPercentage: 0.03,
    cooldownAfterLossMs: 900_000,
  };

  const params = buildIncreaseOrderParams(mirrorAction, regimeParams, indexPrice, {
    pair: agentPosition.pair,
    poolId: pool.poolId,
    marketId: pool.marketId,
    contractIndex: pool.contractIndex,
    positionId: userPositionId,
    address: user.walletAddress,
    executionFeeToken: pool.quoteToken,
    chainId: BSC_CHAIN_ID,
  });

  const networkFee = await sdk.utils.getNetworkFee(pool.marketId, BSC_CHAIN_ID).catch(() => '0');
  const feeAmount = typeof networkFee === 'string' ? networkFee : String(networkFee?.volScale ?? '0');
  const submit = await submitter.submitIncreaseOrder(params, feeAmount);

  const record: UserPosition = {
    userPositionId,
    userId: user.userId,
    sourcePositionId: agentPosition.positionId,
    pair: agentPosition.pair,
    pairIndex: pool.contractIndex,
    isLong: agentPosition.isLong,
    entryPrice: indexPrice,
    exitPrice: null,
    collateralUsd: sized.collateralUsd,
    sizeAmount: sized.sizeAmount,
    leverage: sized.leverage,
    tpPrice: agentPosition.tpPrice,
    slPrice: agentPosition.slPrice,
    status: submit.dryRun ? 'submitted' : 'pending',
    orderId: submit.orderId,
    entryTxHash: submit.txHash,
    exitTxHash: null,
    exitReason: null,
    realizedPnlUsd: null,
    skipReason: null,
    openedAt: new Date().toISOString(),
    closedAt: null,
  };
  await insertUserPosition(record);
  return { userId: user.userId, action: 'opened', txHash: submit.txHash };
}

async function recordSkipped(
  userId: string,
  agentPosition: PositionState,
  reason: string
): Promise<void> {
  const record: UserPosition = {
    userPositionId: crypto.randomUUID(),
    userId,
    sourcePositionId: agentPosition.positionId,
    pair: agentPosition.pair,
    pairIndex: agentPosition.pairIndex,
    isLong: agentPosition.isLong,
    entryPrice: agentPosition.entryPrice,
    exitPrice: null,
    collateralUsd: 0,
    sizeAmount: 0,
    leverage: 0,
    tpPrice: null,
    slPrice: null,
    status: 'skipped',
    orderId: null,
    entryTxHash: null,
    exitTxHash: null,
    exitReason: null,
    realizedPnlUsd: null,
    skipReason: reason,
    openedAt: new Date().toISOString(),
    closedAt: new Date().toISOString(),
  };
  await insertUserPosition(record).catch((err) =>
    console.error('[mirror] recordSkipped failed:', err instanceof Error ? err.message : String(err))
  );
}

export const mirrorDispatcher = new MirrorDispatcher();
