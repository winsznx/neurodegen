import { MyxClient } from '@myx-trade/sdk';
import { createWalletClient, http, type WalletClient } from 'viem';
import { bsc } from 'viem/chains';
import { buildPrivyViemAccount } from '@/lib/clients/privy';
import { BSC_CHAIN_ID, ZERO_ADDRESS } from '@/config/chains';
import type { UserRecord } from '@/types/users';

function getRpcUrl(): string {
  const url = process.env.BSC_RPC_URL;
  if (!url) throw new Error('BSC_RPC_URL env var is required');
  return url;
}

function getBrokerAddress(): string {
  return process.env.MYX_BROKER_ADDRESS ?? ZERO_ADDRESS;
}

export function buildUserWalletClient(user: UserRecord): WalletClient {
  if (!user.walletId) {
    throw new Error(`user ${user.userId} has no Privy walletId — re-run session registration`);
  }
  const account = buildPrivyViemAccount({
    walletId: user.walletId,
    address: user.walletAddress,
  });
  return createWalletClient({
    account,
    chain: bsc,
    transport: http(getRpcUrl()),
  });
}

const userClients = new Map<string, MyxClient>();

export function buildUserMyxClient(user: UserRecord): MyxClient {
  const cached = userClients.get(user.userId);
  if (cached) return cached;

  const walletClient = buildUserWalletClient(user);
  const client = new MyxClient({
    chainId: BSC_CHAIN_ID,
    walletClient,
    brokerAddress: getBrokerAddress(),
  });
  userClients.set(user.userId, client);
  return client;
}

export function clearUserMyxClient(userId: string): void {
  const c = userClients.get(userId);
  if (c) {
    c.close();
    userClients.delete(userId);
  }
}
