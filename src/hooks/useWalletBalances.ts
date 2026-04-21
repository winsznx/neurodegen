'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPublicClient, http, formatEther, formatUnits } from 'viem';
import { bsc } from 'viem/chains';

const USDT_ADDRESS = '0x55d398326f99059fF775485246999027B3197955' as const;
const ERC20_BALANCE_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

const bscClient = createPublicClient({
  chain: bsc,
  transport: http('https://bsc.drpc.org'),
});

export interface WalletBalances {
  bnb: string;
  usdt: string;
  bnbNum: number;
  usdtNum: number;
}

export interface UseWalletBalancesState {
  balances: WalletBalances | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useWalletBalances(address: `0x${string}` | null): UseWalletBalancesState {
  const [balances, setBalances] = useState<WalletBalances | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!address) {
      setLoading(false);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const [bnbWei, usdtRaw] = await Promise.all([
        bscClient.getBalance({ address }),
        bscClient.readContract({
          address: USDT_ADDRESS,
          abi: ERC20_BALANCE_ABI,
          functionName: 'balanceOf',
          args: [address],
        }),
      ]);
      const bnb = formatEther(bnbWei);
      const usdt = formatUnits(usdtRaw, 18);
      setBalances({
        bnb,
        usdt,
        bnbNum: Number(bnb),
        usdtNum: Number(usdt),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { balances, loading, error, refresh };
}
