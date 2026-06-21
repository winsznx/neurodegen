/**
 * Read-only ERC-20 balance fallback via viem + BSC RPC.
 *
 * Used when the TWAK CLI `wallet balance` call is failing (server-side
 * flagging, keystore lockup, stale deploy, etc.). This module DOES NOT sign
 * anything — it only calls the standard `balanceOf` and `decimals` view
 * functions on each tracked BEP-20 contract. The agent's TWAK wallet
 * address is supplied by the caller; we read its on-chain balance from
 * BSC mainnet directly.
 *
 * Self-custody integrity is preserved: every signing operation in the
 * agent (swaps, attestation, ERC-8004/8183 calls) still goes through TWAK.
 * This module is purely an observability shim — it lets the cycle keep
 * sizing trades against accurate balances even when the TWAK CLI is down.
 */

import { erc20Abi } from 'viem';
import { publicClient } from './chain';

/**
 * Stablecoins on BSC that can be safely priced at $1 in the viem fallback
 * path. Used only when the TWAK CLI balance read is broken — the agent loop's
 * cognition layer continues to consume CMC quote events for live pricing of
 * non-stable holdings.
 *
 * Sourced from `loadAllowlistFromEnv` map by symbol (already uppercased).
 */
export const STABLECOIN_SYMBOLS = new Set<string>([
  'USDT', 'USDC', 'BUSD', 'DAI', 'FDUSD', 'TUSD', 'FRAX', 'USDD',
  'USDE', 'USD1', 'USDF', 'USDf', 'FRXUSD', 'LISUSD', 'DUSD', 'XUSD', 'EURI',
]);

export interface Erc20BalanceReadResult {
  symbol: string;
  tokenAddress: `0x${string}`;
  rawBalance: bigint;
  balanceTokens: string;
  decimals: number;
}

const DECIMALS_CACHE = new Map<`0x${string}`, number>();

/**
 * Read the on-chain ERC-20 balance for `holder` of `tokenAddress`. Decimals
 * are cached per token after the first read (BEP-20 decimals are immutable).
 */
export async function readErc20Balance(args: {
  holder: `0x${string}`;
  tokenAddress: `0x${string}`;
  symbol: string;
}): Promise<Erc20BalanceReadResult> {
  let decimals = DECIMALS_CACHE.get(args.tokenAddress);
  if (decimals === undefined) {
    decimals = await publicClient.readContract({
      address: args.tokenAddress,
      abi: erc20Abi,
      functionName: 'decimals',
    });
    DECIMALS_CACHE.set(args.tokenAddress, decimals);
  }
  const raw = await publicClient.readContract({
    address: args.tokenAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [args.holder],
  });
  const balanceTokens = formatUnits(raw, decimals);
  return {
    symbol: args.symbol,
    tokenAddress: args.tokenAddress,
    rawBalance: raw,
    balanceTokens,
    decimals,
  };
}

/**
 * Read the native BNB balance for `holder` via `eth_getBalance`. No TWAK
 * dependency, no signing. Returns the balance in wei + a formatted string.
 */
export async function readNativeBalance(
  holder: `0x${string}`,
): Promise<{ rawBalance: bigint; balanceTokens: string }> {
  const raw = await publicClient.getBalance({ address: holder });
  return {
    rawBalance: raw,
    balanceTokens: formatUnits(raw, 18),
  };
}

function formatUnits(value: bigint, decimals: number): string {
  if (decimals === 0) return value.toString();
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const str = abs.toString().padStart(decimals + 1, '0');
  const whole = str.slice(0, str.length - decimals);
  const fractional = str.slice(str.length - decimals).replace(/0+$/, '');
  const formatted = fractional.length === 0 ? whole : `${whole}.${fractional}`;
  return negative ? `-${formatted}` : formatted;
}
