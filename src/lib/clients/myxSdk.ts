import {
  MyxClient,
  ChainId,
  OrderType,
  TriggerType,
  Direction,
  TimeInForce,
  type PlaceOrderParams,
  type PositionType,
  getOraclePrice,
  type PriceResponse,
} from '@myx-trade/sdk';
import type { WalletClient } from 'viem';
import { BSC_CHAIN_ID, ZERO_ADDRESS } from '@/config/chains';
import { ENABLE_EXECUTION } from '@/config/features';

let clientInstance: MyxClient | null = null;

function getBrokerAddress(): string {
  return process.env.MYX_BROKER_ADDRESS ?? ZERO_ADDRESS;
}

export function getMyxClient(walletClient: WalletClient): MyxClient {
  if (clientInstance) return clientInstance;
  clientInstance = new MyxClient({
    chainId: BSC_CHAIN_ID,
    walletClient,
    brokerAddress: getBrokerAddress(),
  });
  return clientInstance;
}

export function clearMyxClient(): void {
  clientInstance?.close();
  clientInstance = null;
}

export async function getOraclePrices(poolIds: string[]): Promise<PriceResponse> {
  return getOraclePrice(ChainId.BSC_MAINNET, poolIds);
}

export async function getSinglePrice(poolId: string): Promise<number> {
  const response = await getOraclePrice(ChainId.BSC_MAINNET, [poolId]);
  const entry = Array.isArray(response.data)
    ? response.data.find((p: { poolId: string }) => p.poolId === poolId)
    : null;
  if (!entry) throw new Error(`No oracle price for poolId ${poolId}`);
  return parseFloat(entry.price);
}

export function assertExecutionEnabled(): void {
  if (!ENABLE_EXECUTION) {
    throw new Error('ENABLE_EXECUTION feature flag is false');
  }
}

export {
  ChainId,
  OrderType,
  TriggerType,
  Direction,
  TimeInForce,
  type PlaceOrderParams,
  type PositionType,
  type PriceResponse,
};
