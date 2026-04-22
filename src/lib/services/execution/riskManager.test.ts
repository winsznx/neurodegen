import { describe, it, expect } from 'vitest';
import { RiskManager } from './riskManager';
import type { PositionState } from '@/types/execution';
import {
  BASE_POSITION_SIZE_USD,
  PER_POSITION_SIZE_CAP_USD,
  MAX_CONCURRENT_POSITIONS,
  MAX_DAILY_LOSS_USD,
  MAX_LEVERAGE_HARD_CAP,
} from '@/config/risk';

function makePosition(overrides: Partial<PositionState> = {}): PositionState {
  return {
    positionId: crypto.randomUUID(),
    pair: 'BTC/USDT', pairIndex: 0, isLong: true,
    entryPrice: 65000, exitPrice: null, collateralUsd: BASE_POSITION_SIZE_USD, sizeAmount: 200,
    leverage: 10, tpPrice: null, slPrice: null, status: 'managed',
    orderId: null, entryTxHash: null, exitTxHash: null, exitReason: null,
    realizedPnlUsd: null, reasoningGraphId: 'rg1',
    openedAt: new Date().toISOString(), closedAt: null,
    ...overrides,
  };
}

describe('RiskManager', () => {
  const rm = new RiskManager();

  it('allows a within-cap position when the book is empty and no daily loss', () => {
    // #given
    const size = BASE_POSITION_SIZE_USD;
    // #when
    const result = rm.canOpenPosition(size, 5, [], 1000, 0);
    // #then
    expect(result.allowed).toBe(true);
  });

  it('rejects when open positions equal MAX_CONCURRENT_POSITIONS', () => {
    // #given
    const positions = Array.from({ length: MAX_CONCURRENT_POSITIONS }, () => makePosition());
    // #when
    const result = rm.canOpenPosition(BASE_POSITION_SIZE_USD, 5, positions, 1000, 0);
    // #then
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Max concurrent positions');
  });

  it('rejects when requested size exceeds PER_POSITION_SIZE_CAP_USD', () => {
    // #given
    const oversized = PER_POSITION_SIZE_CAP_USD + 1;
    // #when
    const result = rm.canOpenPosition(oversized, 5, [], 1000, 0);
    // #then
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('exceeds cap');
  });

  it('rejects leverage above MAX_LEVERAGE_HARD_CAP', () => {
    // #when
    const result = rm.canOpenPosition(BASE_POSITION_SIZE_USD, MAX_LEVERAGE_HARD_CAP + 1, [], 1000, 0);
    // #then
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('hard cap');
  });

  it('rejects when daily realized loss has crossed MAX_DAILY_LOSS_USD', () => {
    // #given
    const over = MAX_DAILY_LOSS_USD + 0.01;
    // #when
    const result = rm.canOpenPosition(BASE_POSITION_SIZE_USD, 5, [], 1000, over);
    // #then
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Daily loss');
  });

  it('rejects at exactly the daily loss limit', () => {
    // #given
    const atLimit = MAX_DAILY_LOSS_USD;
    // #when
    const result = rm.canOpenPosition(BASE_POSITION_SIZE_USD, 5, [], 1000, atLimit);
    // #then
    expect(result.allowed).toBe(false);
  });

  it('resizes collateral to remaining wallet headroom', () => {
    // #given
    const positions = [makePosition({ collateralUsd: 4 })];
    // #when
    const sized = rm.resolveExecutableCollateralUsd(6, positions, 8);
    // #then
    expect(sized).toBe(4);
  });

  describe('isInCooldown', () => {
    it('returns false when lastLossTimestamp is null', () => {
      // #given / #when / #then
      expect(rm.isInCooldown(null, 900_000)).toBe(false);
    });

    it('returns true within the cooldown window', () => {
      // #given
      const justNow = Date.now() - 100;
      // #when / #then
      expect(rm.isInCooldown(justNow, 900_000)).toBe(true);
    });

    it('returns false once the cooldown has elapsed', () => {
      // #given
      const longAgo = Date.now() - 1_000_000;
      // #when / #then
      expect(rm.isInCooldown(longAgo, 900_000)).toBe(false);
    });
  });
});
