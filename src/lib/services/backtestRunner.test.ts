import { describe, it, expect } from 'vitest';
import { runBacktest, type BacktestStep } from './backtestRunner';
import type {
  CMCFearGreedEvent,
  CMCQuoteEvent,
  PerceptionEvent,
} from '@/types/perception';

function quote(symbol: string, change1h: number, ts: number, price = 1): CMCQuoteEvent {
  return {
    eventId: `q-${symbol}-${ts}`,
    source: 'cmc_hub',
    eventType: 'quote_update',
    timestamp: ts,
    tokenSymbol: symbol,
    tokenAddress: '0x0000000000000000000000000000000000000000',
    priceUSD: price,
    volume24hUSD: 1_000_000,
    percentChange1h: change1h,
    percentChange24h: 0,
    marketCapUSD: 100_000_000,
    cmcRank: 70,
  };
}

function fg(value: number, ts: number): CMCFearGreedEvent {
  return {
    eventId: `fg-${ts}`,
    source: 'cmc_hub',
    eventType: 'fear_greed_update',
    timestamp: ts,
    value,
    label:
      value < 25
        ? 'extreme_fear'
        : value < 45
          ? 'fear'
          : value <= 55
            ? 'neutral'
            : value < 75
              ? 'greed'
              : 'extreme_greed',
  };
}

function activeStep(seed: number): BacktestStep {
  // 3 surge tokens with >5% 1h move → active regime per REGIME_SURGE_ACTIVE_MIN
  const events: PerceptionEvent[] = [
    quote('CAKE', 6, seed, 2.84 + seed * 0.01),
    quote('FLOKI', 7, seed, 0.0002),
    quote('PEPE', 8, seed, 0.000003),
    quote('BTC', 1, seed, 66000),
    fg(60, seed),
  ];
  return {
    timestamp: seed,
    events,
    narrativeFixture: {
      narrativeSummary: 'KOL velocity rising',
      kolMentionedTokens: ['CAKE'],
      sentimentScore: 0.5,
      confidenceLevel: 0.7,
      direction: 'bullish',
      flaggedAnomalies: [],
      topThesisToken: 'CAKE',
    },
    quantFixture: {
      features: [],
      dominantDirection: 'bullish',
      liquidityAdequate: true,
      fundingRateWarning: false,
      recommendedToken: 'CAKE',
    },
    riskFixture: {
      action: 'open_long',
      targetToken: 'CAKE',
      confidence: 0.7,
      rationale: 'aligned',
      dissentAcknowledged: false,
    },
    priceUSDBySymbol: { CAKE: 2.84 + seed * 0.01 },
  };
}

describe('runBacktest', () => {
  it('reproduces identical results for identical inputs and seed', async () => {
    // #given a 3-step active fixture run twice with the same seed
    const steps = [activeStep(1), activeStep(2), activeStep(3)];

    // #when the backtest runs twice
    const a = await runBacktest(steps, { seed: 'fixed' });
    const b = await runBacktest(steps, { seed: 'fixed' });

    // #then fixture hash and session hashes match
    expect(a.fixtureHash).toBe(b.fixtureHash);
    expect(a.sessions.map((s) => s.reasoningHash)).toEqual(b.sessions.map((s) => s.reasoningHash));
  });

  it('produces a different fixture hash for a different seed', async () => {
    // #given the same steps with two different seeds
    const steps = [activeStep(1), activeStep(2)];

    // #when run twice with distinct seeds
    const a = await runBacktest(steps, { seed: 'A' });
    const b = await runBacktest(steps, { seed: 'B' });

    // #then the seeds yield different fixture hashes
    expect(a.fixtureHash).not.toBe(b.fixtureHash);
  });

  it('classifies a long with proper PnL accumulation across steps', async () => {
    // #given two active steps where CAKE rises 1%
    const steps: BacktestStep[] = [
      { ...activeStep(1), priceUSDBySymbol: { CAKE: 2.84 } },
      { ...activeStep(2), priceUSDBySymbol: { CAKE: 2.87 } },
    ];
    // Add the exit price for the first step to be the second step's entry price.
    steps[0].exitPriceUSDBySymbol = { CAKE: 2.87 };

    // #when run
    const result = await runBacktest(steps);

    // #then the first trade's PnL reflects the price move
    const first = result.simulatedTrades[0];
    expect(first.action).toBe('open_long');
    expect(first.entryPriceUSD).toBe(2.84);
    expect(first.exitPriceUSD).toBe(2.87);
    expect(first.pnlPct).toBeCloseTo((2.87 - 2.84) / 2.84, 5);
    // Only the first trade has both entry + exit fixtures; the last step has no next step.
    expect(result.cumulativePnLPct).toBeCloseTo((2.87 - 2.84) / 2.84, 5);
  });
});
