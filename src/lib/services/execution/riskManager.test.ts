import { describe, it, expect } from 'vitest';
import {
  classifyDrawdownTier,
  defaultRiskManagerState,
  RiskManager,
  updateDrawdownFromValue,
} from './riskManager';
import { DEFAULT_MANDATE } from '@/types/mandate';
import type { ActionRecommendation } from '@/types/cognition';

function openLong(sizeUSD: number): ActionRecommendation {
  return {
    action: 'open_long',
    tokenSymbol: 'CAKE',
    tokenAddress: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
    confidence: 0.7,
    positionSizeUSD: sizeUSD,
    leverageMultiplier: 1,
    tpPercentage: 0.05,
    slPercentage: 0.03,
    rationale: 'test',
    plainLanguageExplanation: 'test',
  };
}

describe('classifyDrawdownTier', () => {
  it('returns each tier at its boundary using global thresholds', () => {
    // #given values straddling each ladder threshold (no mandate override)
    expect(classifyDrawdownTier(0.0)).toBe('normal');
    expect(classifyDrawdownTier(0.149)).toBe('normal');
    expect(classifyDrawdownTier(0.15)).toBe('alert');
    expect(classifyDrawdownTier(0.2)).toBe('defensive');
    expect(classifyDrawdownTier(0.25)).toBe('halt');
    expect(classifyDrawdownTier(0.3)).toBe('disqualified');
  });

  it('honors a more conservative mandate halt threshold', () => {
    // #given a mandate that halts at 18% (more conservative than the 25% global)
    // #then the halt fires at 18% and defensive runs from the global 15%
    // alert floor up to the mandate halt (alert band collapses entirely
    // because defensive's lower bound is clamped to the alert threshold)
    expect(classifyDrawdownTier(0.17, 0.18)).toBe('defensive');
    expect(classifyDrawdownTier(0.18, 0.18)).toBe('halt');
    expect(classifyDrawdownTier(0.16, 0.18)).toBe('defensive');
    expect(classifyDrawdownTier(0.149, 0.18)).toBe('normal');
  });

  it('preserves an alert band when the mandate halt is far enough above the global alert', () => {
    // #given a mandate that halts at 22% - leaves 15%-17% as the alert band
    expect(classifyDrawdownTier(0.16, 0.22)).toBe('alert');
    expect(classifyDrawdownTier(0.18, 0.22)).toBe('defensive');
    expect(classifyDrawdownTier(0.22, 0.22)).toBe('halt');
  });

  it('caps an aggressive mandate at the 25% global halt', () => {
    // #given a mandate trying to set halt at 28% (above global)
    // #then halt still fires at the 25% global ceiling
    expect(classifyDrawdownTier(0.249, 0.28)).toBe('defensive');
    expect(classifyDrawdownTier(0.25, 0.28)).toBe('halt');
  });
});

describe('RiskManager.canAct', () => {
  const portfolioUSD = 1_000;
  const baseState = defaultRiskManagerState(portfolioUSD);
  // Use a mandate with maxDrawdownPct = 0.25 to exercise the canonical
  // global ladder boundaries; mandate-specific ladder behavior is covered
  // in classifyDrawdownTier tests above.
  const globalLadderMandate = { ...DEFAULT_MANDATE, maxDrawdownPct: 0.25 };

  it('rejects when drawdown ≥ 25% halt threshold', () => {
    // #given a state with 26% drawdown
    const state = { ...baseState, currentDrawdownFromPeak: 0.26 };
    const mgr = new RiskManager(globalLadderMandate);

    // #when canAct is checked
    const verdict = mgr.canAct(openLong(100), state, [], portfolioUSD);

    // #then rejected with halt rationale
    expect(verdict.approved).toBe(false);
    expect(verdict.rejectionReason).toMatch(/halt threshold/);
  });

  it('blocks opens but allows closes in defensive band', () => {
    // #given a state in the 20-25% defensive band against a 25% mandate
    const state = { ...baseState, currentDrawdownFromPeak: 0.22 };
    const mgr = new RiskManager(globalLadderMandate);

    // #when an open_long is proposed
    const open = mgr.canAct(openLong(50), state, [], portfolioUSD);
    expect(open.approved).toBe(false);
    expect(open.rejectionReason).toMatch(/defensive/);
  });

  it('halves position size at the 15% alert tier', () => {
    // #given a state in the 15-20% alert band against a 25% mandate
    const state = { ...baseState, currentDrawdownFromPeak: 0.17 };
    const mgr = new RiskManager(globalLadderMandate);

    // #when a $80 open is requested (under per-token + headroom limits)
    const verdict = mgr.canAct(openLong(80), state, [], portfolioUSD);

    // #then approved at half size
    expect(verdict.approved).toBe(true);
    expect(verdict.adjustedPositionSizeUSD).toBe(40);
  });

  it('honors a conservative mandate that halts earlier than the global 25%', () => {
    // #given a mandate that halts at 18%
    const conservativeMandate = { ...DEFAULT_MANDATE, maxDrawdownPct: 0.18 };
    const mgr = new RiskManager(conservativeMandate);

    // #when drawdown is 19% - above the user's halt but below the global 25%
    const state = { ...baseState, currentDrawdownFromPeak: 0.19 };
    const verdict = mgr.canAct(openLong(50), state, [], portfolioUSD);

    // #then rejected with halt rationale at the mandate-honoring threshold
    expect(verdict.approved).toBe(false);
    expect(verdict.rejectionReason).toMatch(/halt threshold/);
  });

  it('rejects when consecutive losses ≥ mandate halt', () => {
    // #given 3 consecutive losses with mandate halt = 3
    const state = { ...baseState, consecutiveLosses: 3 };
    const mgr = new RiskManager({ ...DEFAULT_MANDATE, consecutiveLossHalt: 3 });

    // #when canAct is checked
    const verdict = mgr.canAct(openLong(50), state, [], portfolioUSD);

    // #then rejected with consecutive-loss rationale
    expect(verdict.approved).toBe(false);
    expect(verdict.rejectionReason).toMatch(/consecutive losses/);
  });

  it('rejects when concurrent positions ≥ MAX_CONCURRENT', () => {
    // #given the agent is already at the concurrent cap
    const fakePositions = Array.from({ length: 5 }, (_, i) => ({
      positionId: `${i}`,
      sessionId: 's',
      tokenSymbol: 'X',
      tokenAddress: '0x0000000000000000000000000000000000000000' as `0x${string}`,
      direction: 'spot' as const,
      sizeUSD: 50,
      leverage: 1,
      entryPriceUSD: 1,
      tpPriceUSD: null,
      slPriceUSD: null,
      twakTxHash: '0xabc' as `0x${string}`,
      attestationCommitTx: null,
      attestationRevealTx: null,
      status: 'MANAGED' as const,
      exitPriceUSD: null,
      pnlUSD: null,
      pnlPct: null,
      exitReason: null,
      openedAt: new Date().toISOString(),
      closedAt: null,
    }));
    const mgr = new RiskManager(DEFAULT_MANDATE);

    // #when an open is proposed
    const verdict = mgr.canAct(openLong(50), baseState, fakePositions, portfolioUSD);

    // #then rejected
    expect(verdict.approved).toBe(false);
    expect(verdict.rejectionReason).toMatch(/max concurrent/);
  });

  it('approves with size clamped by mandate.maxPositionPct', () => {
    // #given a mandate with 5% max per token and a $200 request
    const mgr = new RiskManager({ ...DEFAULT_MANDATE, maxPositionPct: 0.05 });

    // #when canAct is checked against a $1,000 portfolio
    const verdict = mgr.canAct(openLong(200), baseState, [], 1_000);

    // #then size is clamped to $50
    expect(verdict.approved).toBe(true);
    expect(verdict.adjustedPositionSizeUSD).toBe(50);
  });
});

describe('updateDrawdownFromValue', () => {
  it('tracks peak and computes drawdown from peak', () => {
    // #given a state seeded at $1,000
    let state = defaultRiskManagerState(1_000);

    // #when value rises to $1,500 (peak updates)
    state = updateDrawdownFromValue(state, 1_500);
    expect(state.peakPortfolioValueUSD).toBe(1_500);
    expect(state.currentDrawdownFromPeak).toBe(0);

    // #when value drops to $1,200 (15% under peak - alert tier)
    state = updateDrawdownFromValue(state, 1_275);
    expect(state.currentDrawdownFromPeak).toBeCloseTo(0.15, 3);
  });
});
