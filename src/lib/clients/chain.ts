import {
  createPublicClient,
  createWalletClient,
  http,
  fallback,
  type PublicClient,
  type WalletClient,
  type Transport,
  type Chain,
} from 'viem';
import { bsc } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { ENABLE_EXECUTION } from '@/config/features';

export const bscChain: Chain = bsc;

function getRpcUrl(): string {
  const url = process.env.BSC_RPC_URL;
  if (!url) throw new Error('BSC_RPC_URL environment variable is not set');
  return url;
}

function getFallbackRpcUrl(): string | undefined {
  return process.env.BSC_RPC_URL_FALLBACK;
}

export function createBscPublicClient(): PublicClient<Transport, Chain> {
  const fallbackUrl = getFallbackRpcUrl();
  const transport = fallbackUrl
    ? fallback([http(getRpcUrl()), http(fallbackUrl)])
    : http(getRpcUrl());

  return createPublicClient({
    chain: bscChain,
    transport,
  });
}

export const publicClient: PublicClient<Transport, Chain> = createBscPublicClient();

const BSC_LOGS_RPC_DEFAULT = 'https://bsc.drpc.org';

export const logsPublicClient: PublicClient<Transport, Chain> = createPublicClient({
  chain: bscChain,
  transport: http(process.env.BSC_LOGS_RPC_URL ?? BSC_LOGS_RPC_DEFAULT),
});

export function getAgentWalletClient(): WalletClient {
  if (typeof window !== 'undefined') {
    throw new Error('getAgentWalletClient must only be called server-side');
  }

  if (!ENABLE_EXECUTION) {
    throw new Error(
      'Execution is disabled. Set ENABLE_EXECUTION to true in config/features.ts to enable wallet operations.'
    );
  }

  const privateKey = process.env.NEURODEGEN_AGENT_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('NEURODEGEN_AGENT_PRIVATE_KEY environment variable is not set');
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const fallbackUrl = getFallbackRpcUrl();
  const transport = fallbackUrl
    ? fallback([http(getRpcUrl()), http(fallbackUrl)])
    : http(getRpcUrl());

  return createWalletClient({
    account,
    chain: bscChain,
    transport,
  });
}
