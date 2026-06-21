import {
  BSC_BUSD_ADDRESS,
  BSC_CAKE_ADDRESS,
  BSC_USDT_ADDRESS,
  BSC_WBNB_ADDRESS,
} from '@/config/chains';

/**
 * The 149-token BEP-20 competition allowlist is delivered by TWAK at
 * `twak compete status --json` and varies per competition cycle. The seed
 * below covers high-liquidity BNB Chain tokens for local/dev use; the worker
 * replaces it at boot via one of two paths:
 *
 * 1. `ALLOWED_TOKENS_JSON` env var (preferred for prod): a JSON object of
 *    `{ "SYMBOL": "0xaddress", ... }`. Set on the Railway worker service from
 *    the competition manifest. `loadAllowlistFromEnv` reads it at start().
 * 2. `setAllowedTokens(map)` programmatic call: from a TWAK status helper or
 *    a bootstrap script that fetches the live list.
 *
 * The PreExecutionChecker `allowed_token_verified` check + the RiskClassifier
 * `enforceSafetyRails` BOTH reject any token not in this set BEFORE calling
 * cmcHubClient or twakClient.executeSwap.
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

export function getAllowedTokens(): Record<string, `0x${string}`> {
  return { ...runtimeAllowlist };
}

export function tokenAddressBySymbol(): Record<string, `0x${string}`> {
  return { ...runtimeAllowlist };
}

export function allowedTokenSymbols(): string[] {
  return Object.keys(runtimeAllowlist);
}

/** Static seed export - used by Risk Classifier prompt for predictable behavior in dev. */
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

const HEX = /^0x[a-fA-F0-9]{40}$/;

/**
 * Load the live competition allowlist from `ALLOWED_TOKENS_JSON`. Called once
 * at worker boot. Returns `{ loaded, count, source }`. If parsing fails or the
 * env var is unset, leaves the seed allowlist intact and returns
 * `{ loaded: false, ... }` so the worker can log a warning.
 */
export function loadAllowlistFromEnv(): {
  loaded: boolean;
  count: number;
  source: 'env' | 'seed';
  reason?: string;
} {
  const raw = process.env.ALLOWED_TOKENS_JSON;
  if (!raw) {
    return {
      loaded: false,
      count: Object.keys(runtimeAllowlist).length,
      source: 'seed',
      reason: 'ALLOWED_TOKENS_JSON not set',
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      loaded: false,
      count: Object.keys(runtimeAllowlist).length,
      source: 'seed',
      reason: `JSON parse failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      loaded: false,
      count: Object.keys(runtimeAllowlist).length,
      source: 'seed',
      reason: 'expected {SYMBOL: 0xaddress} object',
    };
  }
  const next: Record<string, `0x${string}`> = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v !== 'string' || !HEX.test(v)) continue;
    next[k.toUpperCase()] = v as `0x${string}`;
  }
  if (Object.keys(next).length === 0) {
    return {
      loaded: false,
      count: Object.keys(runtimeAllowlist).length,
      source: 'seed',
      reason: 'no valid SYMBOL→0xaddress entries found',
    };
  }
  setAllowedTokens(next);
  return { loaded: true, count: Object.keys(next).length, source: 'env' };
}
