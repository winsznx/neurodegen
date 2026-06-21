/**
 * Static symbol→cmc-id map for the tokens the agent regularly quotes.
 *
 * The CMC MCP `get_crypto_quotes_latest` tool requires the numeric internal
 * CMC id (not the symbol). Looking up every symbol via search_cryptos per
 * cycle would burn rate limit, so this static map covers the BNB Chain
 * blue-chips + the largest cap names we actually trade. Misses fall back
 * to a dynamic search call.
 *
 * Source: https://coinmarketcap.com/api/documentation/v1/#operation/getV1CryptocurrencyMap
 * Values verified against the live CoinMarketCap site on 2026-06-21.
 */
export const SYMBOL_TO_CMC_ID: Readonly<Record<string, number>> = Object.freeze({
  // Top caps
  BTC: 1,
  ETH: 1027,
  USDT: 825,
  USDC: 3408,
  XRP: 52,
  BNB: 1839,
  SOL: 5426,
  DOGE: 74,
  ADA: 2010,
  TRX: 1958,
  LTC: 2,
  AVAX: 5805,
  SHIB: 5994,
  LINK: 1975,
  BCH: 1831,
  DAI: 4943,
  TON: 11419,

  // BNB Chain ecosystem
  WBNB: 7192,
  BUSD: 4687,
  CAKE: 7186,
  WLFI: 30553,
  ZEC: 1437,

  // Stables + wrapped
  TUSD: 2563,
  FDUSD: 26081,
  USDE: 29470,
  USDD: 19891,
  XAUT: 5176,

  // Memes + ecosystem we trade
  PENGU: 32999,
  BONK: 23095,
  FLOKI: 10804,
  PEPE: 24478,
  WIF: 28752,

  // DeFi blue-chips
  AAVE: 7278,
  UNI: 7083,
  PENDLE: 9481,
  COMP: 5692,
  LDO: 8000,
  CRV: 6538,
  SNX: 2586,
  YFI: 5864,
  '1INCH': 8104,
  SUSHI: 6758,

  // Other named in the hackathon allowlist
  TWT: 5964,
  DEXE: 7326,
  ASTER: 18876,
  FET: 3773,
  INJ: 7226,
  STG: 18934,
  AXS: 6783,
  ZRO: 28206,
});

/** Returns the CMC id for a symbol, or null if unmapped (caller should search). */
export function cmcIdFor(symbol: string): number | null {
  return SYMBOL_TO_CMC_ID[symbol.toUpperCase()] ?? null;
}
