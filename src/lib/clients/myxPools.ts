import { getPoolList, type MarketPool, ChainId } from '@myx-trade/sdk';

export interface PoolEntry {
  ticker: string;
  poolId: string;
  marketId: string;
  contractIndex: number;
  baseSymbol: string;
  baseDecimals: number;
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

interface ContractDescriptor {
  tickerId: string;
  baseCurrency: string;
  targetCurrency: string;
  contractIndex: number;
}

const MYX_API_URL = process.env.MYX_API_BASE_URL ?? 'https://api.myx.finance';

let cache: Map<string, PoolEntry> | null = null;
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 60 * 60 * 1000;

function normalizeTickerKey(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

async function fetchPoolList(): Promise<MarketPool[]> {
  const response = await getPoolList();
  if (response.code !== 9200 || !response.data) {
    throw new Error(`MYX getPoolList failed: code=${response.code}`);
  }
  return response.data.filter((m) => m.chainId === ChainId.BSC_MAINNET);
}

async function fetchContractDescriptors(): Promise<ContractDescriptor[]> {
  const response = await fetch(`${MYX_API_URL}/v2/quote/market/contracts`);
  if (!response.ok) {
    throw new Error(`MYX contracts fetch failed: ${response.status}`);
  }
  const json = (await response.json()) as MarketContractsResponse;
  return json.data.map((entry) => ({
    tickerId: entry.ticker_id,
    baseCurrency: entry.base_currency,
    targetCurrency: entry.target_currency,
    contractIndex: entry.contract_index,
  }));
}

async function buildPoolMap(): Promise<Map<string, PoolEntry>> {
  const [markets, contracts] = await Promise.all([
    fetchPoolList(),
    fetchContractDescriptors(),
  ]);

  const map = new Map<string, PoolEntry>();
  for (const market of markets) {
    const ticker = resolveTickerForMarket(market, contracts);
    const contract = resolveContractForTicker(ticker, contracts);
    const canonicalContractTicker = contract?.tickerId ?? ticker;
    const entry: PoolEntry = {
      ticker: canonicalContractTicker ?? ticker,
      poolId: market.poolId,
      marketId: market.marketId,
      contractIndex: contract?.contractIndex ?? -1,
      baseSymbol: market.baseSymbol,
      baseDecimals: market.baseDecimals,
      quoteSymbol: market.quoteSymbol,
      quoteToken: market.quoteToken,
      quoteDecimals: market.quoteDecimals,
      executionFee: '0',
    };
    map.set(entry.ticker, entry);
    map.set(entry.ticker.toUpperCase(), entry);
    map.set(normalizeTickerKey(entry.ticker), entry);
    map.set(`${market.baseSymbol}/${market.quoteSymbol}`.toUpperCase(), entry);
    map.set(normalizeTickerKey(`${market.baseSymbol}/${market.quoteSymbol}`), entry);
  }
  return map;
}

function buildContractKeys(contract: ContractDescriptor): string[] {
  return [
    contract.tickerId,
    `${contract.baseCurrency}_${contract.targetCurrency}`,
    `${contract.baseCurrency}/${contract.targetCurrency}`,
  ];
}

function resolveContractForTicker(
  candidate: string,
  contracts: ContractDescriptor[]
): ContractDescriptor | null {
  const normalized = normalizeTickerKey(candidate);
  return (
    contracts.find((contract) =>
      buildContractKeys(contract).some((key) => normalizeTickerKey(key) === normalized)
    ) ?? null
  );
}

function resolveTickerForMarket(market: MarketPool, contracts: ContractDescriptor[]): string {
  const candidates = [
    `${market.baseSymbol.toUpperCase()}_${market.quoteSymbol.toUpperCase()}`,
    `${market.baseSymbol.toUpperCase()}/${market.quoteSymbol.toUpperCase()}`,
  ];
  for (const candidate of candidates) {
    const contract = resolveContractForTicker(candidate, contracts);
    if (contract) return contract.tickerId;
  }
  return candidates[0];
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
