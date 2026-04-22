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

function normalizeTickerKey(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

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

  const contractTickers = [...contractIndices.keys()];
  const map = new Map<string, PoolEntry>();
  for (const market of markets) {
    const ticker = resolveTickerForMarket(market, contractTickers);
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
  const quote = market.quoteSymbol.toUpperCase();
  const cleaned = market.marketId
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');

  if (!cleaned) return 'UNKNOWN';

  if (cleaned.endsWith(`_${quote}`)) {
    return cleaned.slice(0, -(`_${quote}`).length) || 'UNKNOWN';
  }

  if (cleaned.endsWith(quote)) {
    return cleaned.slice(0, -quote.length).replace(/_+$/g, '') || 'UNKNOWN';
  }

  const quoteIndex = cleaned.indexOf(`_${quote}_`);
  if (quoteIndex !== -1) {
    return cleaned.slice(0, quoteIndex) || 'UNKNOWN';
  }

  const parts = cleaned.split(/[-_]/);
  return parts[0] ?? 'UNKNOWN';
}

function resolveTickerForMarket(market: MarketInfo, contractTickers: string[]): string {
  const quote = market.quoteSymbol.toUpperCase();
  const base = extractBaseSymbol(market);
  const candidates = new Set<string>();

  candidates.add(`${base}_${quote}`);

  const cleanedMarketId = market.marketId
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');

  if (cleanedMarketId) {
    candidates.add(cleanedMarketId);

    if (cleanedMarketId.endsWith(quote)) {
      const inferredBase = cleanedMarketId
        .slice(0, -quote.length)
        .replace(/_+$/g, '');
      if (inferredBase) {
        candidates.add(`${inferredBase}_${quote}`);
        candidates.add(`${inferredBase.replace(/_/g, '')}_${quote}`);
      }
    }

    const quoteIndex = cleanedMarketId.indexOf(`_${quote}_`);
    if (quoteIndex !== -1) {
      const inferredBase = cleanedMarketId.slice(0, quoteIndex);
      if (inferredBase) {
        candidates.add(`${inferredBase}_${quote}`);
        candidates.add(`${inferredBase.replace(/_/g, '')}_${quote}`);
      }
    }
  }

  for (const candidate of candidates) {
    const exact = contractTickers.find((ticker) => ticker === candidate);
    if (exact) return exact;

    const caseInsensitive = contractTickers.find(
      (ticker) => ticker.toUpperCase() === candidate.toUpperCase()
    );
    if (caseInsensitive) return caseInsensitive;

    const normalized = normalizeTickerKey(candidate);
    const canonical = contractTickers.find(
      (ticker) => normalizeTickerKey(ticker) === normalized
    );
    if (canonical) return canonical;
  }

  return `${base}_${quote}`;
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
  const exact = registry.get(ticker);
  if (exact) return exact;

  const upper = ticker.toUpperCase();
  for (const [candidate, entry] of registry.entries()) {
    if (candidate.toUpperCase() === upper) return entry;
    if (normalizeTickerKey(candidate) === normalizeTickerKey(ticker)) return entry;
  }

  return null;
}

export async function getPoolByPair(pair: string): Promise<PoolEntry | null> {
  const ticker = pair.replace('/', '_');
  return getPoolByTicker(ticker);
}

export function clearPoolCache(): void {
  cache = null;
  cacheLoadedAt = 0;
}
