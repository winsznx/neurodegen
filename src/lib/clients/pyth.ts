import { PYTH_FEED_IDS } from '@/config/chains';
import type { PythFeedSymbol } from '@/config/chains';

const DEFAULT_HERMES_URL = 'https://hermes.pyth.network';

export interface PythPriceFetch {
  feedId: string;
  pair: string;
  priceUSD: number;
  confidenceUSD: number;
  publishTime: number;
  stalenessSeconds: number;
}

interface HermesParsedPrice {
  price: {
    price: string;
    conf: string;
    expo: number;
    publish_time: number;
  };
  ema_price?: unknown;
  id: string;
}

interface HermesParsedResponse {
  parsed: HermesParsedPrice[];
}

export class PythHermesClient {
  private readonly hermesUrl: string;

  constructor(hermesUrl: string = process.env.PYTH_HERMES_URL ?? DEFAULT_HERMES_URL) {
    this.hermesUrl = hermesUrl;
  }

  async fetchLatestPrices(feedIds: string[]): Promise<PythPriceFetch[]> {
    if (feedIds.length === 0) return [];
    const params = feedIds.map((id) => `ids[]=${id}`).join('&');
    const response = await fetch(`${this.hermesUrl}/v2/updates/price/latest?${params}&parsed=true&encoding=base64`);

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Pyth Hermes request failed [status=${response.status}]: ${body}`);
    }

    const body = (await response.json()) as HermesParsedResponse;
    const parsed = body.parsed ?? [];
    const nowSec = Math.floor(Date.now() / 1000);
    const out: PythPriceFetch[] = [];
    for (const entry of parsed) {
      const rawPrice = Number(entry.price.price);
      const rawConf = Number(entry.price.conf);
      const expo = entry.price.expo;
      const scale = Math.pow(10, expo);
      const feedId = `0x${entry.id.replace(/^0x/, '')}`;
      out.push({
        feedId,
        pair: this.feedIdToPair(feedId),
        priceUSD: rawPrice * scale,
        confidenceUSD: rawConf * scale,
        publishTime: entry.price.publish_time,
        stalenessSeconds: nowSec - entry.price.publish_time,
      });
    }
    return out;
  }

  async fetchSinglePrice(symbol: PythFeedSymbol): Promise<PythPriceFetch> {
    const feedId = PYTH_FEED_IDS[symbol];
    const [first] = await this.fetchLatestPrices([feedId]);
    if (!first) throw new Error(`Pyth returned no price for ${symbol}`);
    return first;
  }

  private feedIdToPair(feedId: string): string {
    const reverse: Record<string, string> = {
      [PYTH_FEED_IDS.BTC_USD]: 'BTC/USD',
      [PYTH_FEED_IDS.ETH_USD]: 'ETH/USD',
      [PYTH_FEED_IDS.BNB_USD]: 'BNB/USD',
    };
    return reverse[feedId.toLowerCase()] ?? reverse[feedId] ?? 'UNKNOWN';
  }
}

export const pythHermesClient = new PythHermesClient();
