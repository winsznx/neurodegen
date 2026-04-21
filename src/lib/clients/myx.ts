import type { MarketSnapshot } from '@/types/perception';
import { getPoolByTicker } from './myxPools';

interface MyxContractApiEntry {
  contract_index: number;
  ticker_id: string;
  base_currency: string;
  target_currency: string;
  last_price: number | string | null;
  base_volume: number | string;
  target_volume: number | string;
  high: number | string;
  low: number | string;
  product_type: string;
  open_interest: number | string;
  open_interest_in_usd: number | string;
  index_price: number | string | null;
  funding_rate: number | string | null;
}

interface MyxContractsResponse {
  code: number;
  msg: string | null;
  data: MyxContractApiEntry[];
}

function toNum(value: number | string | null | undefined, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  const parsed = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNullableNum(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export class MYXMarketClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string = 'https://api.myx.finance') {
    this.baseUrl = baseUrl;
  }

  async getMarketContracts(): Promise<MyxContractsResponse> {
    const response = await fetch(`${this.baseUrl}/v2/quote/market/contracts`);
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`MYX market contracts request failed [status=${response.status}]: ${body}`);
    }
    const json = (await response.json()) as MyxContractsResponse;
    if (json.code !== 9200) {
      throw new Error(`MYX API returned non-success code: ${json.code} ${json.msg ?? ''}`);
    }
    return json;
  }

  async getTrackedPairData(tickers: string[]): Promise<MarketSnapshot[]> {
    const json = await this.getMarketContracts();
    const snapshots: MarketSnapshot[] = [];

    for (const ticker of tickers) {
      const entry = json.data.find((e) => e.ticker_id === ticker);
      if (!entry) {
        console.warn(`[myx] ticker ${ticker} not found in /v2/quote/market/contracts`);
        continue;
      }

      const pool = await getPoolByTicker(ticker).catch(() => null);

      snapshots.push({
        eventId: crypto.randomUUID(),
        source: 'myx',
        eventType: 'market_snapshot',
        timestamp: Date.now(),
        blockNumber: null,
        rawHash: null,
        contractIndex: entry.contract_index,
        pair: ticker.replace('_', '/'),
        poolId: pool?.poolId ?? null,
        lastPrice: toNum(entry.last_price),
        indexPrice: toNum(entry.index_price),
        fundingRate: toNullableNum(entry.funding_rate),
        openInterest: toNum(entry.open_interest),
        openInterestUsd: toNum(entry.open_interest_in_usd),
        baseVolume: toNum(entry.base_volume),
        quoteVolume: toNum(entry.target_volume),
      });
    }

    return snapshots;
  }
}
