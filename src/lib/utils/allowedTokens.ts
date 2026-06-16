import {
  BSC_BUSD_ADDRESS,
  BSC_CAKE_ADDRESS,
  BSC_USDT_ADDRESS,
  BSC_WBNB_ADDRESS,
} from '@/config/chains';

/**
 * The 149-token BEP-20 competition allowlist is delivered by TWAK's compete
 * registration metadata. Until Phase 5 fetches the live list, this seed
 * covers the high-liquidity BNB Chain tokens we ship demos against.
 *
 * The PreExecutionChecker `allowed_token_verified` check rejects any token
 * not in this set BEFORE calling cmcHubClient or twakClient.executeSwap.
 *
 * Phase 5 task: populate from the real `twak compete status --json` payload
 * once the wallet is funded and registered.
 */
const SEED_ALLOWLIST: Record<string, `0x${string}`> = {
  USDT: BSC_USDT_ADDRESS,
  BUSD: BSC_BUSD_ADDRESS,
  CAKE: BSC_CAKE_ADDRESS,
  WBNB: BSC_WBNB_ADDRESS,
  BNB: BSC_WBNB_ADDRESS,
};

let runtimeAllowlist: Record<string, `0x${string}`> = { ...SEED_ALLOWLIST };

export function setAllowedTokens(map: Record<string, `0x${string}`>): void {
  const next: Record<string, `0x${string}`> = {};
  for (const [k, v] of Object.entries(map)) next[k.toUpperCase()] = v;
  runtimeAllowlist = next;
}

export function tokenAddressBySymbol(): Record<string, `0x${string}`> {
  return { ...runtimeAllowlist };
}

export const ALLOWED_TOKEN_SYMBOLS: string[] = Object.freeze(
  Object.keys(SEED_ALLOWLIST),
) as string[];

export function isAllowedTokenSymbol(symbol: string): boolean {
  return Object.prototype.hasOwnProperty.call(runtimeAllowlist, symbol.toUpperCase());
}

export function isAllowedTokenAddress(address: `0x${string}` | string): boolean {
  const lower = address.toLowerCase();
  for (const v of Object.values(runtimeAllowlist)) {
    if (v.toLowerCase() === lower) return true;
  }
  return false;
}
