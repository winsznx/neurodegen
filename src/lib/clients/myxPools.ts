import { getMarketList, type MarketInfo, ChainId } from '@myx-trade/sdk';

export interface PoolEntry {
  ticker: string;
  poolId: string;
  marketId: string;
  contractIndex: number;
  quoteSymbol: string;
  quoteToken: string;
  quoteDecimals: number;
  executionFee: string;
}

interface MarketContractsResponse {
  code: number;
  data: Array<{
    contract_index: number;
    ticker_id: string;
    base_currency: string;
    target_currency: string;
    last_price: number;
    funding_rate: number | null;
    open_interest: number;
    open_interest_in_usd: number;
    index_price: number;
    index_name: string;
  }>;
}

const MYX_API_URL = process.env.MYX_API_BASE_URL ?? 'https://api.myx.finance';

let cache: Map<string, PoolEntry> | null = null;
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 60 * 60 * 1000;

async function fetchMarketList(): Promise<MarketInfo[]> {
  const response = await getMarketList();
  if (response.code !== 9200 || !response.data) {
    throw new Error(`MYX getMarketList failed: code=${response.code}`);
  }
  return response.data.filter((m) => m.chainId === ChainId.BSC_MAINNET);
}

async function fetchContractIndexMap(): Promise<Map<string, number>> {
  const response = await fetch(`${MYX_API_URL}/v2/quote/market/contracts`);
  if (!response.ok) {
    throw new Error(`MYX contracts fetch failed: ${response.status}`);
  }
  const json = (await response.json()) as MarketContractsResponse;
  const byMarketId = new Map<string, number>();
  for (const entry of json.data) {
    byMarketId.set(entry.ticker_id, entry.contract_index);
  }
  return byMarketId;
}

async function buildPoolMap(): Promise<Map<string, PoolEntry>> {
  const [markets, contractIndices] = await Promise.all([
    fetchMarketList(),
    fetchContractIndexMap(),
  ]);

  const map = new Map<string, PoolEntry>();
  for (const market of markets) {
    const ticker = `${extractBaseSymbol(market)}_${market.quoteSymbol}`;
    const entry: PoolEntry = {
      ticker,
      poolId: market.poolId,
      marketId: market.marketId,
      contractIndex: contractIndices.get(ticker) ?? -1,
      quoteSymbol: market.quoteSymbol,
      quoteToken: market.quoteToken,
      quoteDecimals: market.quoteDecimals,
      executionFee: market.executionFee,
    };
    map.set(ticker, entry);
  }
  return map;
}

function extractBaseSymbol(market: MarketInfo): string {
  const parts = market.marketId.split(/[-_]/);
  return parts[0] ?? 'UNKNOWN';
}

export async function getPoolRegistry(): Promise<Map<string, PoolEntry>> {
  const now = Date.now();
  if (cache && now - cacheLoadedAt < CACHE_TTL_MS) return cache;
  cache = await buildPoolMap();
  cacheLoadedAt = now;
  return cache;
}

export async function getPoolByTicker(ticker: string): Promise<PoolEntry | null> {
  const registry = await getPoolRegistry();
  return registry.get(ticker) ?? null;
}

export async function getPoolByPair(pair: string): Promise<PoolEntry | null> {
  const ticker = pair.replace('/', '_');
  return getPoolByTicker(ticker);
}

export function clearPoolCache(): void {
  cache = null;
  cacheLoadedAt = 0;
}
