import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HotStateStore } from './hotState';
import type { PerceptionEvent, LaunchEvent, MarketSnapshot, AggregateMetrics } from '@/types/perception';

function makeFourmemeEvent(): LaunchEvent {
  return {
    eventId: crypto.randomUUID(),
    source: 'fourmeme',
    eventType: 'token_create',
    timestamp: Date.now(),
    blockNumber: null,
    rawHash: null,
    tokenAddress: '0xtoken',
    creatorAddress: '0xcreator',
    tokenName: 'Test',
    tokenSymbol: 'T',
    initialSupplyOnCurve: 800_000_000n * 10n ** 18n,
  };
}

function makeMyxEvent(): MarketSnapshot {
  return {
    eventId: crypto.randomUUID(),
    source: 'myx',
    eventType: 'market_snapshot',
    timestamp: Date.now(),
    blockNumber: null,
    rawHash: null,
    contractIndex: 1,
    pair: 'BTC/USDT',
    poolId: null,
    lastPrice: 65000,
    indexPrice: 65000,
    fundingRate: 0,
    openInterest: 100,
    openInterestUsd: 6_500_000,
    baseVolume: 0,
    quoteVolume: 0,
  };
}

function makeEvent(source: 'fourmeme' | 'myx' = 'fourmeme'): PerceptionEvent {
  return source === 'myx' ? makeMyxEvent() : makeFourmemeEvent();
}

describe('HotStateStore', () => {
  let store: HotStateStore;

  beforeEach(() => {
    store = new HotStateStore(30);
  });

  it('adds and retrieves events', () => {
    const event = makeEvent();
    store.addEvent(event);
    const events = store.getRecentEvents();
    expect(events).toHaveLength(1);
    expect(events[0].eventId).toBe(event.eventId);
  });

  it('returns correct event count', () => {
    store.addEvent(makeEvent());
    store.addEvent(makeEvent());
    store.addEvent(makeEvent());
    expect(store.getEventCount()).toBe(3);
  });

  it('filters events by source', () => {
    store.addEvent(makeEvent('fourmeme'));
    store.addEvent(makeEvent('fourmeme'));
    store.addEvent(makeEvent('myx'));

    const fourmeme = store.getRecentEvents('fourmeme');
    expect(fourmeme).toHaveLength(2);

    const myx = store.getRecentEvents('myx');
    expect(myx).toHaveLength(1);
  });

  it('limits returned events', () => {
    for (let i = 0; i < 10; i++) store.addEvent(makeEvent());
    const events = store.getRecentEvents(undefined, 3);
    expect(events).toHaveLength(3);
  });

  it('evicts expired events', () => {
    const store = new HotStateStore(0.0001);
    store.addEvent(makeEvent());

    vi.useFakeTimers();
    vi.advanceTimersByTime(120_000);
    store.evict();
    vi.useRealTimers();

    expect(store.getEventCount()).toBe(0);
  });

  it('sets and gets metrics', () => {
    expect(store.getMetrics()).toBeNull();

    const metrics: AggregateMetrics = {
      computedAt: Date.now(),
      launchVelocityPerHour: 5,
      capitalInflowBNBPerHour: 2.5,
      graduationVelocityPerHour: 0.5,
      activeLaunches: 3,
      topTokensByInflow: [],
      myxMetrics: {},
    };

    store.setMetrics(metrics);
    expect(store.getMetrics()).toBe(metrics);
    expect(store.getMetrics()?.launchVelocityPerHour).toBe(5);
  });

  it('returns events sorted by timestamp DESC', () => {
    const older = makeEvent();
    older.timestamp = Date.now() - 10_000;
    const newer = makeEvent();
    newer.timestamp = Date.now();

    store.addEvent(older);
    store.addEvent(newer);

    const events = store.getRecentEvents();
    expect(events[0].timestamp).toBeGreaterThan(events[1].timestamp);
  });
});
