import type {
  AggregateMetrics,
  CMCFearGreedEvent,
  CMCFundingEvent,
  CMCLiquidityEvent,
  CMCQuoteEvent,
  CMCSocialEvent,
  PerceptionEvent,
  RegimeLabel,
} from '@/types/perception';

interface AggregatorOptions {
  regime: RegimeLabel;
  fearGreedFallbackValue?: number;
  surgeThresholdPct?: number;
  x402SpendSessionUSDC: number;
  x402SpendDailyUSDC: number;
  computedAt?: number;
}

/**
 * Build an AggregateMetrics snapshot from the hot-state event window.
 * Pure function: no I/O, no side effects.
 *
 * Inputs: a flat list of perception events (already deduped by HotStateStore)
 * + the current regime classification + bookkeeping for x402 spend.
 *
 * Outputs: a `AggregateMetrics` ready for `committee_sessions.input_metrics`
 * and `metrics.payload`.
 */
export function aggregateMetrics(
  events: PerceptionEvent[],
  options: AggregatorOptions,
): AggregateMetrics {
  const now = options.computedAt ?? Date.now();
  const surgeThresholdPct = options.surgeThresholdPct ?? 5;

  const latestByToken = new Map<string, CMCQuoteEvent>();
  const fearGreedLatest = pickLatestFearGreed(events, options.fearGreedFallbackValue);
  const fundingLatestByPair = new Map<string, CMCFundingEvent>();
  const socialLatestByToken = new Map<string, CMCSocialEvent>();
  const liquidityLatest: CMCLiquidityEvent[] = [];

  for (const event of events) {
    if (event.eventType === 'quote_update') {
      const incoming = event as CMCQuoteEvent;
      const existing = latestByToken.get(incoming.tokenSymbol);
      if (!existing || incoming.timestamp > existing.timestamp) {
        latestByToken.set(incoming.tokenSymbol, incoming);
      }
    } else if (event.eventType === 'funding_rate_update') {
      const incoming = event as CMCFundingEvent;
      const existing = fundingLatestByPair.get(incoming.pair);
      if (!existing || incoming.timestamp > existing.timestamp) {
        fundingLatestByPair.set(incoming.pair, incoming);
      }
    } else if (event.eventType === 'social_signal') {
      const incoming = event as CMCSocialEvent;
      const existing = socialLatestByToken.get(incoming.tokenSymbol);
      if (!existing || incoming.timestamp > existing.timestamp) {
        socialLatestByToken.set(incoming.tokenSymbol, incoming);
      }
    } else if (event.eventType === 'dex_liquidity_snapshot') {
      liquidityLatest.push(event as CMCLiquidityEvent);
    }
  }

  // Surge tokens + top movers, sorted by absolute 1h percent change desc.
  const ranked = [...latestByToken.values()].sort(
    (a, b) => Math.abs(b.percentChange1h) - Math.abs(a.percentChange1h),
  );
  const surgeCount = ranked.filter((q) => Math.abs(q.percentChange1h) >= surgeThresholdPct).length;
  const topMoversByVolume = ranked.slice(0, 10).map((q) => ({
    symbol: q.tokenSymbol,
    address: q.tokenAddress,
    percentChange1h: q.percentChange1h,
    volume24hUSD: q.volume24hUSD,
  }));

  const kolActivityByToken: AggregateMetrics['kolActivityByToken'] = {};
  for (const [token, social] of socialLatestByToken.entries()) {
    kolActivityByToken[token] = {
      mentionCount: social.kolMentionCount,
      velocityPerHour: social.velocityPerHour,
      sentimentDirection: social.sentimentDirection,
    };
  }

  const fundingRatesByPair: AggregateMetrics['fundingRatesByPair'] = {};
  for (const [pair, funding] of fundingLatestByPair.entries()) {
    fundingRatesByPair[pair] = {
      rateAnnualized: funding.fundingRateAnnualized,
      direction: funding.direction,
    };
  }

  const fearGreedValue = fearGreedLatest?.value ?? options.fearGreedFallbackValue ?? 50;
  const fearGreedLabel = fearGreedLatest?.label ?? 'neutral';

  return {
    computedAt: now,
    regime: options.regime,
    fearGreedValue,
    fearGreedLabel,
    topMoversByVolume,
    kolActivityByToken,
    fundingRatesByPair,
    marketLiquidityScore: computeMarketLiquidityScore(liquidityLatest),
    activeSurgeTokens: surgeCount,
    x402SpendSessionUSDC: options.x402SpendSessionUSDC,
    x402SpendDailyUSDC: options.x402SpendDailyUSDC,
  };
}

function pickLatestFearGreed(
  events: PerceptionEvent[],
  fallback: number | undefined,
): CMCFearGreedEvent | null {
  let latest: CMCFearGreedEvent | null = null;
  for (const event of events) {
    if (event.eventType === 'fear_greed_update') {
      const incoming = event as CMCFearGreedEvent;
      if (!latest || incoming.timestamp > latest.timestamp) latest = incoming;
    }
  }
  if (latest) return latest;
  if (fallback !== undefined) {
    return {
      eventId: 'synthetic-fallback',
      source: 'cmc_hub',
      eventType: 'fear_greed_update',
      timestamp: 0,
      value: fallback,
      label:
        fallback < 25
          ? 'extreme_fear'
          : fallback < 45
            ? 'fear'
            : fallback <= 55
              ? 'neutral'
              : fallback < 75
                ? 'greed'
                : 'extreme_greed',
    };
  }
  return null;
}

function computeMarketLiquidityScore(samples: CMCLiquidityEvent[]): number {
  if (samples.length === 0) return 0;
  // 0..1 score: normalize log10(liquidityUSD) into a band roughly [3, 9].
  let sum = 0;
  for (const sample of samples) {
    const log = Math.log10(Math.max(sample.liquidityUSD, 1));
    sum += Math.max(0, Math.min(1, (log - 3) / 6));
  }
  return Number((sum / samples.length).toFixed(4));
}
