import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/config/features', () => ({
  ENABLE_MOMENTUM_FILTER: true,
}));

vi.mock('@/config/execution', () => ({
  ORACLE_DIVERGENCE_MAX_PCT: 0.02,
  MAX_SLIPPAGE_PCT: 0.01,
  SECURITY_RISK_SCORE_MAX: 80,
  GAS_BUFFER_BNB: 0.001,
}));

vi.mock('@/config/risk', () => ({
  MIN_POSITION_SIZE_USD: 5,
}));

vi.mock('@/lib/utils/allowedTokens', () => ({
  isAllowedTokenSymbol: () => true,
}));

vi.mock('@/lib/clients/chain', () => ({
  publicClient: {
    getBalance: vi.fn().mockResolvedValue(10n ** 18n), // 1 BNB
  },
}));

vi.mock('@/config/chains', () => ({
  BSC_WBNB_ADDRESS: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
}));

import { PreExecutionChecker } from './preExecutionChecker';
import type {
  PreExecutionCheckerInputs,
} from './preExecutionChecker';
import type { ActionRecommendation } from '@/types/cognition';

const baseRecommendation: ActionRecommendation = {
  action: 'open_long',
  tokenSymbol: 'CAKE',
  tokenAddress: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
  confidence: 0.7,
  positionSizeUSD: 10,
  leverageMultiplier: 1,
  tpPercentage: 0.05,
  slPercentage: 0.02,
  rationale: 'test',
  plainLanguageExplanation: 'test',
};

function makeInputs(
  overrides: Partial<PreExecutionCheckerInputs> = {},
): PreExecutionCheckerInputs {
  return {
    recommendation: baseRecommendation,
    state: {
      currentDrawdownFromPeak: 0,
      consecutiveLosses: 0,
      positionsOpenCount: 0,
      totalExposureUSD: 0,
      dailyPnLUSD: 0,
      dailyTradeCount: 0,
      lastProbeTradeAt: null,
      peakPortfolioValueUSD: 100,
    },
    openPositions: [],
    cmcPriceUSD: 2.0,
    pythSymbol: null,
    liquidityAdequate: true,
    fundingRateWarning: false,
    securityRiskScore: 10,
    isHoneypot: false,
    portfolio: {
      totalValueUSD: 50,
      positions: [],
      drawdownFromPeak: 0,
      availableCapitalUSD: 50,
      snapshotAt: Date.now(),
    },
    agentAddress: '0x1a59eD9BB4890a8ac02746BFC00EDeCBBBe375fF',
    tokenMomentum: null,
    ...overrides,
  };
}

const fakeDeps = {
  twak: {} as never,
  pyth: { fetchSinglePrice: vi.fn() } as never,
  risk: {
    canAct: vi.fn().mockReturnValue({
      approved: true,
      rejectionReason: null,
      adjustedPositionSizeUSD: 10,
    }),
  } as never,
};

describe('PreExecutionChecker — momentum filter (Phase I)', () => {
  let checker: PreExecutionChecker;

  beforeEach(() => {
    checker = new PreExecutionChecker(fakeDeps);
  });

  it('rejects open_long when BOTH 1h and 24h pct-changes are non-positive', async () => {
    // #given — falling knife: both timeframes red
    const inputs = makeInputs({
      tokenMomentum: { pct1h: -2.5, pct24h: -8.0 },
    });

    // #when
    const result = await checker.runChecks(inputs);

    // #then
    expect(result.passed).toBe(false);
    const momentum = result.checks.find((c) => c.name === 'momentum_not_adverse');
    expect(momentum?.passed).toBe(false);
    expect(momentum?.message).toContain('1h=-2.50%');
    expect(momentum?.message).toContain('24h=-8.00%');
  });

  it('allows open_long when 1h is positive even if 24h is negative (reversal)', async () => {
    // #given — token bouncing off a dip
    const inputs = makeInputs({
      tokenMomentum: { pct1h: 1.5, pct24h: -3.0 },
    });

    // #when
    const result = await checker.runChecks(inputs);

    // #then
    const momentum = result.checks.find((c) => c.name === 'momentum_not_adverse');
    expect(momentum?.passed).toBe(true);
    expect(momentum?.message).toContain('at least one timeframe');
  });

  it('allows open_long when both timeframes are positive (uptrend)', async () => {
    // #given
    const inputs = makeInputs({
      tokenMomentum: { pct1h: 2.0, pct24h: 6.0 },
    });

    // #when
    const result = await checker.runChecks(inputs);

    // #then
    const momentum = result.checks.find((c) => c.name === 'momentum_not_adverse');
    expect(momentum?.passed).toBe(true);
  });

  it('passes through when tokenMomentum is null (missing data, do not block)', async () => {
    // #given — no recent CMC quote in hotState
    const inputs = makeInputs({ tokenMomentum: null });

    // #when
    const result = await checker.runChecks(inputs);

    // #then
    const momentum = result.checks.find((c) => c.name === 'momentum_not_adverse');
    expect(momentum?.passed).toBe(true);
    expect(momentum?.value).toBe('no_data');
  });

  it('skips the filter for close_position even with adverse momentum', async () => {
    // #given — closing into a red market is exactly what we want
    const inputs = makeInputs({
      recommendation: { ...baseRecommendation, action: 'close_position' },
      tokenMomentum: { pct1h: -5.0, pct24h: -10.0 },
    });

    // #when
    const result = await checker.runChecks(inputs);

    // #then
    const momentum = result.checks.find((c) => c.name === 'momentum_not_adverse');
    expect(momentum?.passed).toBe(true);
    expect(momentum?.message).toContain('only applies to open_long');
  });

  it('treats exactly 0% as adverse on both timeframes (no momentum is also bad)', async () => {
    // #given — flat market, both 0
    const inputs = makeInputs({
      tokenMomentum: { pct1h: 0, pct24h: 0 },
    });

    // #when
    const result = await checker.runChecks(inputs);

    // #then — refuse: <=0 on both means there's literally no upward signal
    const momentum = result.checks.find((c) => c.name === 'momentum_not_adverse');
    expect(momentum?.passed).toBe(false);
  });
});
