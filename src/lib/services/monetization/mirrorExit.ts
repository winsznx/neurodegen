import type { PositionState } from '@/types/execution';
import type { UserPosition } from '@/types/users';
import { getUserById } from '@/lib/queries/users';
import { updateUserPositionStatus, getOpenUserPositionsForSource } from '@/lib/queries/userPositions';
import { getPoolByPair } from '@/lib/clients/myxPools';
import { TransactionSubmitter } from '@/lib/services/execution/transactionSubmitter';
import { buildDecreaseOrderParams } from '@/lib/services/execution/myxOrderBuilder';
import { buildUserMyxClient } from './userMyxClient';
import { BSC_CHAIN_ID } from '@/config/chains';

export interface MirrorExitOutcome {
  userId: string;
  action: 'closed' | 'failed';
  reason?: string;
  txHash?: string;
}

function toPositionState(p: UserPosition): PositionState {
  return {
    positionId: p.userPositionId,
    pair: p.pair,
    pairIndex: p.pairIndex,
    isLong: p.isLong,
    entryPrice: p.entryPrice,
    exitPrice: p.exitPrice,
    collateralUsd: p.collateralUsd,
    sizeAmount: p.sizeAmount,
    leverage: p.leverage,
    tpPrice: p.tpPrice,
    slPrice: p.slPrice,
    status: p.status === 'skipped' ? 'closed' : p.status,
    orderId: p.orderId,
    entryTxHash: p.entryTxHash,
    exitTxHash: p.exitTxHash,
    exitReason: p.exitReason,
    realizedPnlUsd: p.realizedPnlUsd,
    reasoningGraphId: '',
    openedAt: p.openedAt,
    closedAt: p.closedAt,
  };
}

export async function closeMirrorsForSource(agentPosition: PositionState): Promise<MirrorExitOutcome[]> {
  const mirrors = await getOpenUserPositionsForSource(agentPosition.positionId).catch(() => []);
  if (mirrors.length === 0) return [];

  const outcomes: MirrorExitOutcome[] = [];
  await Promise.all(
    mirrors.map(async (m) => {
      try {
        const user = await getUserById(m.userId);
        if (!user) throw new Error('user not found');
        const sdk = buildUserMyxClient(user);
        const submitter = new TransactionSubmitter(sdk);
        const pool = await getPoolByPair(m.pair);
        if (!pool) throw new Error('pool not found');

        const params = buildDecreaseOrderParams(toPositionState(m), {
          pair: m.pair,
          poolId: pool.poolId,
          marketId: pool.marketId,
          contractIndex: pool.contractIndex,
          positionId: m.userPositionId,
          address: user.walletAddress,
          executionFeeToken: pool.quoteToken,
          chainId: BSC_CHAIN_ID,
        });

        const submit = await submitter.submitDecreaseOrder(params);
        await updateUserPositionStatus(m.userPositionId, {
          status: 'closed',
          exitTxHash: submit.txHash,
          exitReason: agentPosition.exitReason ?? 'agent_close',
          closedAt: new Date().toISOString(),
        });
        outcomes.push({ userId: m.userId, action: 'closed', txHash: submit.txHash });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[mirror-close] ${m.userPositionId} failed:`, msg);
        outcomes.push({ userId: m.userId, action: 'failed', reason: msg });
      }
    })
  );
  return outcomes;
}
