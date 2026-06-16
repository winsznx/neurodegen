import { describe, it, expect } from 'vitest';
import { aggregateMetrics } from './aggregatorService';
import type {
  CMCFearGreedEvent,
  CMCFundingEvent,
  CMCQuoteEvent,
  CMCSocialEvent,
} from '@/types/perception';

function quote(symbol: string, change1h: number, ts: number): CMCQuoteEvent {
  return {
    eventId: crypto.randomUUID(),
    source: 'cmc_hub',
    eventType: 'quote_update',
    timestamp: ts,
    tokenSymbol: symbol,
    tokenAddress: '0x0000000000000000000000000000000000000000',
    priceUSD: 1,
    volume24hUSD: 1_000_000,
    percentChange1h: change1h,
    percentChange24h: 0,
    marketCapUSD: 10_000_000,
    cmcRank: 100,
  };
}

function fg(value: number, ts: number): CMCFearGreedEvent {
  return {
    eventId: crypto.randomUUID(),
    source: 'cmc_hub',
    eventType: 'fear_greed_update',
    timestamp: ts,
    value,
    label: value < 25 ? 'extreme_fear' : value < 45 ? 'fear' : value <= 55 ? 'neutral' : value < 75 ? 'greed' : 'extreme_greed',
  };
}

function funding(pair: string, rate: number, ts: number): CMCFundingEvent {
  return {
    eventId: crypto.randomUUID(),
    source: 'cmc_hub',
    eventType: 'funding_rate_update',
    timestamp: ts,
    pair,
    fundingRateAnnualized: rate,
    direction: rate > 0.001 ? 'rising' : rate < -0.001 ? 'falling' : 'stable',
  };
}

function social(symbol: string, velocity: number, mentions: number, ts: number): CMCSocialEvent {
  return {
    eventId: crypto.randomUUID(),
    source: 'cmc_hub',
    eventType: 'social_signal',
    timestamp: ts,
    tokenSymbol: symbol,
    kolMentionCount: mentions,
    velocityPerHour: velocity,
    sentimentDirection: 'positive',
  };
}

describe('aggregateMetrics', () => {
  it('counts surge tokens above the threshold', () => {
    // #given a mix of strong-mover and weak-mover quotes
    const events = [
      quote('A', 6, 1),
      quote('B', 3, 1),
      quote('C', 8, 1),
      quote('D', 1, 1),
      fg(60, 1),
    ];

    // #when aggregated
    const metrics = aggregateMetrics(events, {
      regime: 'active',
      x402SpendSessionUSDC: 0,
      x402SpendDailyUSDC: 0,
    });

    // #then only quotes with |change1h| >= 5% count as surge
    expect(metrics.activeSurgeTokens).toBe(2);
    expect(metrics.topMoversByVolume[0].symbol).toBe('C');
  });

  it('picks the latest fear-and-greed when multiple are present', () => {
    // #given two F&G readings, the later one wins
    const events = [fg(40, 1), fg(70, 2)];

    // #when aggregated
    const metrics = aggregateMetrics(events, {
      regime: 'active',
      x402SpendSessionUSDC: 0,
      x402SpendDailyUSDC: 0,
    });

    // #then the later F&G is reported
    expect(metrics.fearGreedValue).toBe(70);
    expect(metrics.fearGreedLabel).toBe('greed');
  });

  it('falls back to synthetic F&G when none is present', () => {
    // #given no F&G event but a fallback value
    const metrics = aggregateMetrics([], {
      regime: 'quiet',
      fearGreedFallbackValue: 50,
      x402SpendSessionUSDC: 0,
      x402SpendDailyUSDC: 0,
    });

    // #then the fallback value is used and labeled neutral
    expect(metrics.fearGreedValue).toBe(50);
    expect(metrics.fearGreedLabel).toBe('neutral');
  });

  it('merges KOL signals per token by latest timestamp', () => {
    // #given two CAKE social readings
    const events = [social('CAKE', 4, 10, 1), social('CAKE', 6, 20, 2), social('FLOKI', 3, 5, 1)];

    // #when aggregated
    const metrics = aggregateMetrics(events, {
      regime: 'active',
      x402SpendSessionUSDC: 0,
      x402SpendDailyUSDC: 0,
    });

    // #then the later CAKE wins and FLOKI persists
    expect(metrics.kolActivityByToken.CAKE.velocityPerHour).toBe(6);
    expect(metrics.kolActivityByToken.CAKE.mentionCount).toBe(20);
    expect(metrics.kolActivityByToken.FLOKI.mentionCount).toBe(5);
  });

  it('records funding rates per pair', () => {
    // #given two funding-rate updates for the same pair
    const events = [funding('BNB/USDT', 0.04, 1), funding('BNB/USDT', 0.08, 2)];

    // #when aggregated
    const metrics = aggregateMetrics(events, {
      regime: 'active',
      x402SpendSessionUSDC: 0,
      x402SpendDailyUSDC: 0,
    });

    // #then the latest rate is preserved
    expect(metrics.fundingRatesByPair['BNB/USDT'].rateAnnualized).toBe(0.08);
    expect(metrics.fundingRatesByPair['BNB/USDT'].direction).toBe('rising');
  });
});
