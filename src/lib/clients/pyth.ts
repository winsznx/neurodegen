import type { PriceUpdate } from '@/types/perception';
import { PYTH_FEED_IDS } from '@/config/chains';

export class PythHermesClient {
  private readonly hermesUrl: string;

  constructor(hermesUrl: string = 'https://hermes.pyth.network') {
    this.hermesUrl = hermesUrl;
  }

  async getLatestPriceUpdate(feedIds: string[]): Promise<PriceUpdate[]> {
    const params = feedIds.map((id) => `ids[]=${id}`).join('&');
    const response = await fetch(`${this.hermesUrl}/api/latest_vaas?${params}`);

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Pyth Hermes request failed [status=${response.status}]: ${body}`);
    }

    const vaas = (await response.json()) as string[];
    const updates: PriceUpdate[] = [];

    for (let i = 0; i < vaas.length; i++) {
      const feedId = feedIds[i];
      const pair = this.feedIdToPair(feedId);
      const decoded = this.decodeVAA(vaas[i]);

      updates.push({
        eventId: crypto.randomUUID(),
        source: 'pyth',
        eventType: 'price_update',
        timestamp: Date.now(),
        blockNumber: null,
        rawHash: null,
        feedId,
        pair,
        price: decoded.price,
        confidence: decoded.confidence,
        exponent: decoded.exponent,
        publishTime: decoded.publishTime,
      });
    }

    return updates;
  }

  async getLatestVAAs(
    feedIds: string[]
  ): Promise<Array<{ vaaBytes: Uint8Array; publishTime: number }>> {
    const params = feedIds.map((id) => `ids[]=${id}`).join('&');
    const response = await fetch(`${this.hermesUrl}/api/latest_vaas?${params}`);

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Pyth Hermes VAA request failed [status=${response.status}]: ${body}`);
    }

    const vaas = (await response.json()) as string[];
    const results: Array<{ vaaBytes: Uint8Array; publishTime: number }> = [];

    for (const vaa of vaas) {
      const bytes = Uint8Array.from(atob(vaa), (c) => c.charCodeAt(0));
      const decoded = this.decodeVAA(vaa);
      const stalenessSeconds = Math.floor(Date.now() / 1000) - decoded.publishTime;

      if (stalenessSeconds > 60) {
        throw new Error(
          `Pyth VAA is stale: publishTime=${decoded.publishTime}, staleness=${stalenessSeconds}s`
        );
      }

      results.push({ vaaBytes: bytes, publishTime: decoded.publishTime });
    }

    return results;
  }

  private decodeVAA(base64Vaa: string): {
    price: bigint;
    confidence: bigint;
    exponent: number;
    publishTime: number;
  } {
    const bytes = Uint8Array.from(atob(base64Vaa), (c) => c.charCodeAt(0));
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    const payloadOffset = bytes.length - 40;
    const price = view.getBigInt64(payloadOffset, false);
    const confidence = view.getBigUint64(payloadOffset + 8, false);
    const exponent = view.getInt32(payloadOffset + 16, false);
    const publishTime = view.getUint32(payloadOffset + 20, false);

    return {
      price,
      confidence: BigInt(confidence),
      exponent,
      publishTime,
    };
  }

  private feedIdToPair(feedId: string): string {
    const mapping: Record<string, string> = {
      [PYTH_FEED_IDS.BTC_USD]: 'BTC/USD',
      [PYTH_FEED_IDS.ETH_USD]: 'ETH/USD',
      [PYTH_FEED_IDS.BNB_USD]: 'BNB/USD',
    };
    return mapping[feedId] ?? 'UNKNOWN';
  }
}
