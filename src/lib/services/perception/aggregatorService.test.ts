import { describe, it, expect } from 'vitest';
import { AggregatorService } from './aggregatorService';
import type { LaunchEvent, PurchaseEvent, MarketSnapshot } from '@/types/perception';

function makeLaunch(tokenAddress: string, hoursAgo: number): LaunchEvent {
  return {
    eventId: crypto.randomUUID(),
    source: 'fourmeme',
    eventType: 'token_create',
    timestamp: Date.now() - hoursAgo * 3600_000,
    blockNumber: null,
    rawHash: null,
    tokenAddress,
    creatorAddress: '0xcreator',
    tokenName: 'Test',
    tokenSymbol: 'T',
    initialSupplyOnCurve: 800_000_000n * 10n ** 18n,
  };
}

function makePurchase(tokenAddress: string, bnbWei: bigint, hoursAgo: number): PurchaseEvent {
  return {
    eventId: crypto.randomUUID(),
    source: 'fourmeme',
    eventType: 'token_purchase',
    timestamp: Date.now() - hoursAgo * 3600_000,
    blockNumber: null,
    rawHash: null,
    tokenAddress,
    buyerAddress: '0xbuyer',
    bnbAmount: bnbWei,
    tokenAmount: 1000n * 10n ** 18n,
    currentCurveBalance: 750_000_000n * 10n ** 18n,
  };
}

function makeSnapshot(
  pair: string,
  fundingRate: number | null,
  openInterestUsd = 1_000_000
): MarketSnapshot {
  return {
    eventId: crypto.randomUUID(),
    source: 'myx',
    eventType: 'market_snapshot',
    timestamp: Date.now(),
    blockNumber: null,
    rawHash: null,
    contractIndex: 1,
    pair,
    poolId: null,
    lastPrice: 65000,
    indexPrice: 65000,
    fundingRate,
    openInterest: 100,
    openInterestUsd,
    baseVolume: 0,
    quoteVolume: 0,
  };
}

describe('AggregatorService.computeMetrics', () => {
  it('returns zero velocities for empty events', () => {
    const agg = new AggregatorService();
    const result = agg.computeMetrics([], []);
    expect(result.launchVelocityPerHour).toBe(0);
    expect(result.capitalInflowBNBPerHour).toBe(0);
    expect(result.graduationVelocityPerHour).toBe(0);
    expect(result.activeLaunches).toBe(0);
    expect(result.topTokensByInflow).toHaveLength(0);
  });

  it('calculates launchVelocityPerHour correctly', () => {
    const agg = new AggregatorService();
    const events = Array.from({ length: 10 }, (_, i) => makeLaunch(`0xtoken${i}`, 1));
    const result = agg.computeMetrics(events, []);
    expect(result.launchVelocityPerHour).toBe(10 / 4);
  });

  it('calculates capitalInflowBNBPerHour correctly', () => {
    const agg = new AggregatorService();
    const oneEth = 10n ** 18n;
    const events = [
      makePurchase('0xt1', 2n * oneEth, 1),
      makePurchase('0xt1', 3n * oneEth, 2),
    ];
    const result = agg.computeMetrics(events, []);
    expect(result.capitalInflowBNBPerHour).toBe(5 / 4);
  });

  it('crowdScore reflects funding direction and magnitude', () => {
    const agg = new AggregatorService();
    const snapshot = makeSnapshot('BTC/USDT', 0.001);
    const result = agg.computeMetrics([], [snapshot]);
    expect(result.myxMetrics['BTC/USDT'].crowdScore).toBeCloseTo(1, 5);
  });

  it('crowdScore clamps negative funding to -1', () => {
    const agg = new AggregatorService();
    const snapshot = makeSnapshot('BTC/USDT', -0.01);
    const result = agg.computeMetrics([], [snapshot]);
    expect(result.myxMetrics['BTC/USDT'].crowdScore).toBe(-1);
  });

  it('crowdScore is 0 when funding is null', () => {
    const agg = new AggregatorService();
    const snapshot = makeSnapshot('BTC/USDT', null);
    const result = agg.computeMetrics([], [snapshot]);
    expect(result.myxMetrics['BTC/USDT'].crowdScore).toBe(0);
  });

  it('detects rising funding trend', () => {
    const agg = new AggregatorService();
    for (let i = 0; i < 8; i++) {
      agg.computeMetrics([], [makeSnapshot('ETH/USDT', i * 0.0001)]);
    }
    const result = agg.computeMetrics([], [makeSnapshot('ETH/USDT', 0.0008)]);
    expect(result.myxMetrics['ETH/USDT'].fundingTrendDirection).toBe('rising');
  });

  it('detects falling funding trend', () => {
    const agg = new AggregatorService();
    for (let i = 7; i >= 0; i--) {
      agg.computeMetrics([], [makeSnapshot('ETH/USDT', i * 0.0001)]);
    }
    const result = agg.computeMetrics([], [makeSnapshot('ETH/USDT', 0)]);
    expect(result.myxMetrics['ETH/USDT'].fundingTrendDirection).toBe('falling');
  });
});
