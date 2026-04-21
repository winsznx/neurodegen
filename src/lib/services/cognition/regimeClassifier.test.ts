import { describe, it, expect } from 'vitest';
import { RegimeClassifier } from './regimeClassifier';
import type { AggregateMetrics } from '@/types/perception';

function makeMetrics(overrides: Partial<AggregateMetrics> = {}): AggregateMetrics {
  return {
    computedAt: Date.now(),
    launchVelocityPerHour: 1,
    capitalInflowBNBPerHour: 0.5,
    graduationVelocityPerHour: 0,
    activeLaunches: 0,
    topTokensByInflow: [],
    myxMetrics: {},
    ...overrides,
  };
}

describe('RegimeClassifier', () => {
  it('returns quiet for low activity', () => {
    const c = new RegimeClassifier();
    const { regime, parameters } = c.classify(makeMetrics());
    expect(regime).toBe('quiet');
    expect(parameters.positionSizeMultiplier).toBe(0.5);
    expect(parameters.maxLeverage).toBe(5);
  });

  it('returns active for moderate velocity and inflow', () => {
    const c = new RegimeClassifier();
    const { regime, parameters } = c.classify(makeMetrics({
      launchVelocityPerHour: 10,
      capitalInflowBNBPerHour: 5,
    }));
    expect(regime).toBe('active');
    expect(parameters.positionSizeMultiplier).toBe(1.0);
    expect(parameters.maxLeverage).toBe(10);
  });

  it('returns retail_frenzy for high launch velocity', () => {
    const c = new RegimeClassifier();
    const { regime } = c.classify(makeMetrics({ launchVelocityPerHour: 25 }));
    expect(regime).toBe('retail_frenzy');
  });

  it('returns retail_frenzy for high capital inflow', () => {
    const c = new RegimeClassifier();
    const { regime } = c.classify(makeMetrics({ capitalInflowBNBPerHour: 15 }));
    expect(regime).toBe('retail_frenzy');
  });

  it('returns retail_frenzy for high graduation velocity', () => {
    const c = new RegimeClassifier();
    const { regime, parameters } = c.classify(makeMetrics({ graduationVelocityPerHour: 3 }));
    expect(regime).toBe('retail_frenzy');
    expect(parameters.positionSizeMultiplier).toBe(1.5);
    expect(parameters.maxLeverage).toBe(15);
  });

  it('returns volatile when funding trend flips and OI imbalance > 0.3', () => {
    const c = new RegimeClassifier();

    c.classify(makeMetrics({
      myxMetrics: {
        'BTC/USDT': { crowdScore: 0.5, fundingRateCurrent: 0.0001, fundingTrendDirection: 'rising', openInterestUsd: 100000 },
      },
    }));

    const { regime, parameters } = c.classify(makeMetrics({
      myxMetrics: {
        'BTC/USDT': { crowdScore: 0.5, fundingRateCurrent: -0.0001, fundingTrendDirection: 'falling', openInterestUsd: 100000 },
      },
    }));

    expect(regime).toBe('volatile');
    expect(parameters.positionSizeMultiplier).toBe(0.3);
    expect(parameters.maxLeverage).toBe(3);
  });

  it('volatile takes priority over retail_frenzy', () => {
    const c = new RegimeClassifier();

    c.classify(makeMetrics({
      launchVelocityPerHour: 25,
      myxMetrics: {
        'BTC/USDT': { crowdScore: 0.5, fundingRateCurrent: 0.0001, fundingTrendDirection: 'rising', openInterestUsd: 100000 },
      },
    }));

    const { regime } = c.classify(makeMetrics({
      launchVelocityPerHour: 25,
      myxMetrics: {
        'BTC/USDT': { crowdScore: 0.5, fundingRateCurrent: -0.0001, fundingTrendDirection: 'falling', openInterestUsd: 100000 },
      },
    }));

    expect(regime).toBe('volatile');
  });

  it('does not flag volatile without OI imbalance > 0.3', () => {
    const c = new RegimeClassifier();

    c.classify(makeMetrics({
      myxMetrics: {
        'BTC/USDT': { crowdScore: 0.1, fundingRateCurrent: 0.0001, fundingTrendDirection: 'rising', openInterestUsd: 100000 },
      },
    }));

    const { regime } = c.classify(makeMetrics({
      myxMetrics: {
        'BTC/USDT': { crowdScore: 0.1, fundingRateCurrent: -0.0001, fundingTrendDirection: 'falling', openInterestUsd: 100000 },
      },
    }));

    expect(regime).not.toBe('volatile');
  });
});
