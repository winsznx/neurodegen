import { describe, it, expect } from 'vitest';
import { RiskManager } from './riskManager';
import type { PositionState } from '@/types/execution';

function makePosition(overrides: Partial<PositionState> = {}): PositionState {
  return {
    positionId: crypto.randomUUID(),
    pair: 'BTC/USDT', pairIndex: 0, isLong: true,
    entryPrice: 65000, exitPrice: null, collateralUsd: 20, sizeAmount: 200,
    leverage: 10, tpPrice: null, slPrice: null, status: 'managed',
    orderId: null, entryTxHash: null, exitTxHash: null, exitReason: null,
    realizedPnlUsd: null, reasoningGraphId: 'rg1',
    openedAt: new Date().toISOString(), closedAt: null,
    ...overrides,
  };
}

describe('RiskManager', () => {
  const rm = new RiskManager();

  it('allows position when no open positions and small size', () => {
    const result = rm.canOpenPosition(20, [], 1000, 0);
    expect(result.allowed).toBe(true);
  });

  it('rejects when at MAX_CONCURRENT_POSITIONS', () => {
    const positions = [makePosition(), makePosition(), makePosition()];
    const result = rm.canOpenPosition(20, positions, 1000, 0);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Max concurrent positions');
  });

  it('rejects when size exceeds PER_POSITION_SIZE_CAP_USD', () => {
    const result = rm.canOpenPosition(100, [], 1000, 0);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('exceeds cap');
  });

  it('rejects when daily loss exceeds MAX_DAILY_LOSS_USD', () => {
    const result = rm.canOpenPosition(20, [], 1000, 150);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Daily loss');
  });

  it('rejects at exact daily loss limit', () => {
    const result = rm.canOpenPosition(20, [], 1000, 100);
    expect(result.allowed).toBe(false);
  });

  describe('isInCooldown', () => {
    it('returns false when lastLossTimestamp is null', () => {
      expect(rm.isInCooldown(null, 900_000)).toBe(false);
    });

    it('returns true within cooldown period', () => {
      expect(rm.isInCooldown(Date.now() - 100, 900_000)).toBe(true);
    });

    it('returns false after cooldown expires', () => {
      expect(rm.isInCooldown(Date.now() - 1_000_000, 900_000)).toBe(false);
    });
  });
});
