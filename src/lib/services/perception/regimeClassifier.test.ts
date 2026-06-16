import { describe, it, expect } from 'vitest';
import {
  advanceRegimeState,
  classifyRegime,
  emptyRegimeState,
} from './regimeClassifier';
import type { AggregateMetrics } from '@/types/perception';
import { REGIME_VOLATILE_EXIT_COOLDOWN_MS } from '@/config/regime';

function snapshot(overrides: Partial<AggregateMetrics> = {}): AggregateMetrics {
  return {
    computedAt: 0,
    regime: 'quiet',
    fearGreedValue: 50,
    fearGreedLabel: 'neutral',
    topMoversByVolume: [],
    kolActivityByToken: {},
    fundingRatesByPair: {},
    marketLiquidityScore: 0.5,
    activeSurgeTokens: 0,
    x402SpendSessionUSDC: 0,
    x402SpendDailyUSDC: 0,
    ...overrides,
  };
}

describe('classifyRegime', () => {
  it('returns quiet for F&G in 40-60 band with no surge tokens', () => {
    // #given a baseline F&G 50, zero surge tokens
    const state = emptyRegimeState();

    // #when classified
    const result = classifyRegime(snapshot({ fearGreedValue: 50 }), state);

    // #then quiet
    expect(result.regime).toBe('quiet');
    expect(result.parameters.hibernate).toBe(true);
  });

  it('returns active when F&G in 40-70 band with >=3 surge tokens', () => {
    // #given F&G 65, 3 surge tokens, no KOL velocity
    const state = emptyRegimeState();

    // #when classified
    const result = classifyRegime(
      snapshot({ fearGreedValue: 65, activeSurgeTokens: 3 }),
      state,
    );

    // #then active
    expect(result.regime).toBe('active');
    expect(result.parameters.positionSizeMultiplier).toBe(0.5);
  });

  it('returns momentum when F&G > 60 with KOL velocity hit on >=2 tokens', () => {
    // #given F&G 72, 5 surge tokens, 2 KOL-hot tokens
    const state = emptyRegimeState();

    // #when classified
    const result = classifyRegime(
      snapshot({
        fearGreedValue: 72,
        activeSurgeTokens: 5,
        kolActivityByToken: {
          CAKE: { mentionCount: 30, velocityPerHour: 6, sentimentDirection: 'positive' },
          FLOKI: { mentionCount: 22, velocityPerHour: 8, sentimentDirection: 'positive' },
        },
      }),
      state,
    );

    // #then momentum
    expect(result.regime).toBe('momentum');
    expect(result.parameters.positionSizeMultiplier).toBe(1.0);
  });

  it('returns volatile when F&G drops below 25', () => {
    // #given F&G 20
    const state = emptyRegimeState();

    // #when classified
    const result = classifyRegime(snapshot({ fearGreedValue: 20 }), state);

    // #then volatile
    expect(result.regime).toBe('volatile');
    expect(result.parameters.positionSizeMultiplier).toBe(0.1);
  });

  it('returns volatile when any funding-rate spike crosses 0.1%/8h', () => {
    // #given otherwise-active metrics with one funding spike
    const state = emptyRegimeState();

    // #when classified
    const result = classifyRegime(
      snapshot({
        fearGreedValue: 60,
        activeSurgeTokens: 3,
        fundingRatesByPair: {
          'BNB/USDT': { rateAnnualized: 0.002, direction: 'rising' },
        },
      }),
      state,
    );

    // #then volatile (funding-rate trumps F&G)
    expect(result.regime).toBe('volatile');
  });

  it('holds volatile through the exit cooldown even when metrics recover', () => {
    // #given a state already in volatile
    const state = emptyRegimeState();
    state.lastRegime = 'volatile';

    // #when metrics recover within the cooldown window
    const t0 = 1_000_000;
    const first = classifyRegime(
      snapshot({ fearGreedValue: 55, activeSurgeTokens: 0 }),
      state,
      t0,
    );

    // #then still volatile (first non-volatile snapshot starts the cooldown)
    expect(first.regime).toBe('volatile');

    advanceRegimeState(state, first);

    // #when classified again before the cooldown elapses
    const beforeCooldown = classifyRegime(
      snapshot({ fearGreedValue: 55, activeSurgeTokens: 0 }),
      state,
      t0 + REGIME_VOLATILE_EXIT_COOLDOWN_MS - 1,
    );

    // #then still volatile
    expect(beforeCooldown.regime).toBe('volatile');

    // #when classified again after the cooldown elapses
    const afterCooldown = classifyRegime(
      snapshot({ fearGreedValue: 55, activeSurgeTokens: 0 }),
      state,
      t0 + REGIME_VOLATILE_EXIT_COOLDOWN_MS + 1,
    );

    // #then exits to quiet
    expect(afterCooldown.regime).toBe('quiet');
  });

  it('tracks previousRegime across calls', () => {
    // #given a state starting fresh
    const state = emptyRegimeState();

    // #when classified twice with different metrics
    const r1 = classifyRegime(snapshot({ fearGreedValue: 50 }), state);
    advanceRegimeState(state, r1);

    const r2 = classifyRegime(
      snapshot({ fearGreedValue: 65, activeSurgeTokens: 3 }),
      state,
    );

    // #then previousRegime reflects r1
    expect(r2.previousRegime).toBe('quiet');
    expect(r2.regime).toBe('active');
  });

  it('all four regimes can be reached given the right metrics', () => {
    // V1 regression: confirm quiet, active, momentum, volatile are all reachable
    // (V1's classifier had `active`/`volatile` dead branches per V1 audit §5).
    const state = () => emptyRegimeState();

    const quiet = classifyRegime(snapshot({ fearGreedValue: 50 }), state()).regime;
    const active = classifyRegime(
      snapshot({ fearGreedValue: 55, activeSurgeTokens: 3 }),
      state(),
    ).regime;
    const momentum = classifyRegime(
      snapshot({
        fearGreedValue: 70,
        activeSurgeTokens: 5,
        kolActivityByToken: {
          a: { mentionCount: 1, velocityPerHour: 6, sentimentDirection: 'positive' },
          b: { mentionCount: 1, velocityPerHour: 6, sentimentDirection: 'positive' },
        },
      }),
      state(),
    ).regime;
    const volatile = classifyRegime(snapshot({ fearGreedValue: 90 }), state()).regime;

    expect(new Set([quiet, active, momentum, volatile])).toEqual(
      new Set(['quiet', 'active', 'momentum', 'volatile']),
    );
  });
});
