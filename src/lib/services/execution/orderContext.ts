import { getPoolByPair } from '@/lib/clients/myxPools';
import { BSC_CHAIN_ID } from '@/config/chains';
import type { MyxOrderContext } from '@/types/myx';

export async function resolveOrderContext(
  pair: string,
  address: `0x${string}`,
  positionId: string
): Promise<MyxOrderContext> {
  const pool = await getPoolByPair(pair);
  if (!pool) throw new Error(`No pool found for pair ${pair}`);
  return {
    pair,
    poolId: pool.poolId,
    marketId: pool.marketId,
    contractIndex: pool.contractIndex,
    positionId,
    address,
    executionFeeToken: pool.quoteToken,
    chainId: BSC_CHAIN_ID,
  };
}
