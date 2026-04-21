import { describe, it, expect } from 'vitest';
import { sizeMirrorForUser } from './copyTradeSizing';
import type { PositionState } from '@/types/execution';
import type { Subscription } from '@/types/users';
import type { ActionRecommendation } from '@/types/cognition';

function pos(overrides: Partial<PositionState> = {}): PositionState {
  return {
    positionId: 'src-1', pair: 'BTC/USDT', pairIndex: 1, isLong: true,
    entryPrice: 100, exitPrice: null, collateralUsd: 20, sizeAmount: 2, leverage: 10,
    tpPrice: 110, slPrice: 95, status: 'managed',
    orderId: null, entryTxHash: null, exitTxHash: null, exitReason: null,
    realizedPnlUsd: null, reasoningGraphId: 'rg-1',
    openedAt: new Date().toISOString(), closedAt: null,
    ...overrides,
  };
}

function sub(overrides: Partial<Subscription> = {}): Subscription {
  return {
    subscriptionId: 's-1', userId: 'u-1',
    active: true, sessionSignerGranted: true,
    leverageMultiplier: 1, maxPositionUsd: 25, minConfidence: 0.3,
    pausedUntil: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function rec(overrides: Partial<ActionRecommendation> = {}): ActionRecommendation {
  return {
    action: 'open_long', pair: 'BTC/USDT', confidence: 0.8,
    positionSizeUSD: 20, leverageMultiplier: 10,
    tpPercentage: 0.05, slPercentage: 0.03, rationale: 'test',
    ...overrides,
  };
}

describe('sizeMirrorForUser', () => {
  it('mirrors 1:1 when multiplier is 1 and cap exceeds agent size', () => {
    // #given an active, granted subscription at 1x multiplier and $25 cap
    // #when the agent's $20 @ 10x hits our sizing fn
    const result = sizeMirrorForUser(pos(), sub(), rec(), 100);
    // #then the mirror matches exactly with no skip
    expect(result.skipReason).toBeNull();
    expect(result.collateralUsd).toBe(20);
    expect(result.leverage).toBe(10);
    expect(result.sizeAmount).toBeCloseTo(2, 6);
  });

  it('clamps collateral to user max cap', () => {
    // #given user caps at $10, agent opens at $20
    const result = sizeMirrorForUser(pos({ collateralUsd: 20 }), sub({ maxPositionUsd: 10 }), rec(), 100);
    // #then collateral is clamped to 10
    expect(result.collateralUsd).toBe(10);
  });

  it('scales leverage by user multiplier', () => {
    // #given user's leverageMultiplier=0.5
    const result = sizeMirrorForUser(pos({ leverage: 10 }), sub({ leverageMultiplier: 0.5 }), rec(), 100);
    // #then effective leverage is 5x
    expect(result.leverage).toBe(5);
  });

  it('skips when subscription is inactive', () => {
    const result = sizeMirrorForUser(pos(), sub({ active: false }), rec(), 100);
    expect(result.skipReason).toBe('subscription_inactive');
  });

  it('skips when signer not granted', () => {
    const result = sizeMirrorForUser(pos(), sub({ sessionSignerGranted: false }), rec(), 100);
    expect(result.skipReason).toBe('signer_not_granted');
  });

  it('skips when confidence below user threshold', () => {
    // #given user set min_confidence=0.7, agent confidence=0.4
    const result = sizeMirrorForUser(pos(), sub({ minConfidence: 0.7 }), rec({ confidence: 0.4 }), 100);
    // #then skipped with explicit reason
    expect(result.skipReason).toMatch(/confidence_below_user_threshold/);
  });

  it('skips on invalid index price', () => {
    const result = sizeMirrorForUser(pos(), sub(), rec(), 0);
    expect(result.skipReason).toBe('invalid_index_price');
  });

  it('respects MYX hard cap on leverage even with aggressive multiplier', () => {
    // #given agent 25x leverage and user wants 2x more = 50x, hard cap is 50
    const result = sizeMirrorForUser(pos({ leverage: 25 }), sub({ leverageMultiplier: 2 }), rec(), 100);
    // #then effective leverage is 50, not higher
    expect(result.leverage).toBeLessThanOrEqual(50);
  });

  it('computes sizeAmount = notional / indexPrice', () => {
    // #given collateral=$20 at 10x = $200 notional at $50 price
    const result = sizeMirrorForUser(pos({ collateralUsd: 20, leverage: 10 }), sub(), rec(), 50);
    // #then sizeAmount is 4 units
    expect(result.sizeAmount).toBeCloseTo(4, 6);
  });
});
