import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HotStateStore } from './hotState';
import type {
  AggregateMetrics,
  CMCFearGreedEvent,
  CMCQuoteEvent,
  PerceptionEvent,
  PythDivergenceEvent,
} from '@/types/perception';

function makeCmcQuoteEvent(symbol = 'CAKE'): CMCQuoteEvent {
  // #given a CMC quote event for a tracked BEP-20 token
  return {
    eventId: crypto.randomUUID(),
    source: 'cmc_hub',
    eventType: 'quote_update',
    timestamp: Date.now(),
    tokenSymbol: symbol,
    tokenAddress: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
    priceUSD: 2.84,
    volume24hUSD: 12_345_678,
    percentChange1h: 1.2,
    percentChange24h: 3.5,
    marketCapUSD: 800_000_000,
    cmcRank: 70,
  };
}

function makeFearGreedEvent(): CMCFearGreedEvent {
  // #given a global Fear & Greed reading
  return {
    eventId: crypto.randomUUID(),
    source: 'cmc_hub',
    eventType: 'fear_greed_update',
    timestamp: Date.now(),
    value: 67,
    label: 'greed',
  };
}

function makePythDivergenceEvent(): PythDivergenceEvent {
  // #given a Pyth divergence check for an oracle sanity step
  return {
    eventId: crypto.randomUUID(),
    source: 'pyth',
    eventType: 'divergence_check',
    timestamp: Date.now(),
    tokenSymbol: 'BNB',
    cmcPriceUSD: 660.12,
    pythPriceUSD: 660.05,
    divergencePercent: 0.0001,
  };
}

function makeEvent(source: PerceptionEvent['source'] = 'cmc_hub'): PerceptionEvent {
  if (source === 'pyth') return makePythDivergenceEvent();
  return makeCmcQuoteEvent();
}

describe('HotStateStore', () => {
  let store: HotStateStore;

  beforeEach(() => {
    // #given a fresh store with a 30-minute TTL
    store = new HotStateStore(30);
  });

  it('adds and retrieves events', () => {
    // #given a single CMC quote event
    const event = makeEvent();

    // #when added to the store
    store.addEvent(event);

    // #then it shows up in getRecentEvents
    const events = store.getRecentEvents();
    expect(events).toHaveLength(1);
    expect(events[0].eventId).toBe(event.eventId);
  });

  it('returns correct event count', () => {
    // #given three events of mixed sources
    store.addEvent(makeFearGreedEvent());
    store.addEvent(makeCmcQuoteEvent('BTC'));
    store.addEvent(makePythDivergenceEvent());

    // #then count reflects all three
    expect(store.getEventCount()).toBe(3);
  });

  it('filters events by source', () => {
    // #given two cmc_hub events and one pyth event
    store.addEvent(makeEvent('cmc_hub'));
    store.addEvent(makeEvent('cmc_hub'));
    store.addEvent(makeEvent('pyth'));

    // #then source filter narrows correctly
    expect(store.getRecentEvents('cmc_hub')).toHaveLength(2);
    expect(store.getRecentEvents('pyth')).toHaveLength(1);
  });

  it('limits returned events', () => {
    // #given ten events
    for (let i = 0; i < 10; i++) store.addEvent(makeEvent());

    // #when caller passes limit=3
    const events = store.getRecentEvents(undefined, 3);

    // #then only three are returned
    expect(events).toHaveLength(3);
  });

  it('evicts expired events', () => {
    // #given a store with a sub-second TTL
    const tinyTtl = new HotStateStore(0.0001);
    tinyTtl.addEvent(makeEvent());

    // #when fake time advances past the TTL and evict() runs
    vi.useFakeTimers();
    vi.advanceTimersByTime(120_000);
    tinyTtl.evict();
    vi.useRealTimers();

    // #then the event is gone
    expect(tinyTtl.getEventCount()).toBe(0);
  });

  it('sets and gets metrics', () => {
    // #given a freshly-constructed V2 AggregateMetrics snapshot
    expect(store.getMetrics()).toBeNull();

    const metrics: AggregateMetrics = {
      computedAt: Date.now(),
      regime: 'active',
      fearGreedValue: 67,
      fearGreedLabel: 'greed',
      topMoversByVolume: [
        {
          symbol: 'CAKE',
          address: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
          percentChange1h: 1.2,
          volume24hUSD: 12_345_678,
        },
      ],
      kolActivityByToken: {
        CAKE: { mentionCount: 12, velocityPerHour: 4, sentimentDirection: 'positive' },
      },
      fundingRatesByPair: {
        'BNB/USDT': { rateAnnualized: 0.04, direction: 'rising' },
      },
      marketLiquidityScore: 0.62,
      activeSurgeTokens: 4,
      x402SpendSessionUSDC: 0,
      x402SpendDailyUSDC: 0,
    };

    // #when setMetrics is called
    store.setMetrics(metrics);

    // #then getMetrics returns the same reference and key fields are stable
    expect(store.getMetrics()).toBe(metrics);
    expect(store.getMetrics()?.fearGreedValue).toBe(67);
    expect(store.getMetrics()?.regime).toBe('active');
  });

  it('returns events sorted by timestamp DESC', () => {
    // #given an older event and a newer event
    const older = makeEvent();
    older.timestamp = Date.now() - 10_000;
    const newer = makeEvent();
    newer.timestamp = Date.now();

    store.addEvent(older);
    store.addEvent(newer);

    // #then getRecentEvents puts the newer event first
    const events = store.getRecentEvents();
    expect(events[0].timestamp).toBeGreaterThan(events[1].timestamp);
  });
});
