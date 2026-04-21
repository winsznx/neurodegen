import { describe, it, expect } from 'vitest';
import { buildIncreaseOrderParams, buildDecreaseOrderParams } from './myxOrderBuilder';
import { Direction, OrderType, TriggerType } from '@myx-trade/sdk';
import type { ActionRecommendation } from '@/types/cognition';
import type { MyxOrderContext } from '@/types/myx';
import type { PositionState } from '@/types/execution';
import type { RegimeParameters } from '@/lib/services/cognition/regimeClassifier';

const AGENT_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`;
const POOL_ID = '0xabc123abc123abc123abc123abc123abc123abc123abc123abc123abc123abc1';
const MARKET_ID = 'BTC_USDT-market';

const CONTEXT: MyxOrderContext = {
  pair: 'BTC/USDT',
  poolId: POOL_ID,
  marketId: MARKET_ID,
  contractIndex: 1,
  positionId: 'pos-001',
  address: AGENT_ADDRESS,
  executionFeeToken: '0x55d398326f99059fF775485246999027B3197955',
  chainId: 56,
};

const DEFAULT_PARAMS: RegimeParameters = {
  positionSizeMultiplier: 1,
  maxLeverage: 10,
  tpPercentage: 0.05,
  slPercentage: 0.03,
  cooldownAfterLossMs: 900_000,
};

function action(overrides: Partial<ActionRecommendation> = {}): ActionRecommendation {
  return {
    action: 'open_long',
    pair: 'BTC/USDT',
    confidence: 0.8,
    positionSizeUSD: 20,
    leverageMultiplier: 10,
    tpPercentage: 0.05,
    slPercentage: 0.03,
    rationale: 'test',
    ...overrides,
  };
}

describe('buildIncreaseOrderParams', () => {
  it('marks open_long as Direction.LONG', () => {
    const params = buildIncreaseOrderParams(action({ action: 'open_long' }), DEFAULT_PARAMS, 65000, CONTEXT);
    expect(params.direction).toBe(Direction.LONG);
  });

  it('marks open_short as Direction.SHORT', () => {
    const params = buildIncreaseOrderParams(action({ action: 'open_short' }), DEFAULT_PARAMS, 65000, CONTEXT);
    expect(params.direction).toBe(Direction.SHORT);
  });

  it('sets orderType MARKET and triggerType NONE', () => {
    const params = buildIncreaseOrderParams(action(), DEFAULT_PARAMS, 65000, CONTEXT);
    expect(params.orderType).toBe(OrderType.MARKET);
    expect(params.triggerType).toBe(TriggerType.NONE);
  });

  it('price is "0" for market orders', () => {
    const params = buildIncreaseOrderParams(action(), DEFAULT_PARAMS, 65000, CONTEXT);
    expect(params.price).toBe('0');
  });

  it('computes size from notional / index price', () => {
    const params = buildIncreaseOrderParams(action({ positionSizeUSD: 20, leverageMultiplier: 10 }), DEFAULT_PARAMS, 100, CONTEXT);
    expect(parseFloat(params.size)).toBeCloseTo(2, 5);
  });

  it('sets long TP above and SL below index price', () => {
    const params = buildIncreaseOrderParams(action({ action: 'open_long' }), DEFAULT_PARAMS, 1000, CONTEXT);
    expect(parseFloat(params.tpPrice!)).toBeCloseTo(1050, 2);
    expect(parseFloat(params.slPrice!)).toBeCloseTo(970, 2);
  });

  it('sets short TP below and SL above index price', () => {
    const params = buildIncreaseOrderParams(action({ action: 'open_short' }), DEFAULT_PARAMS, 1000, CONTEXT);
    expect(parseFloat(params.tpPrice!)).toBeCloseTo(950, 2);
    expect(parseFloat(params.slPrice!)).toBeCloseTo(1030, 2);
  });

  it('passes through context fields', () => {
    const params = buildIncreaseOrderParams(action(), DEFAULT_PARAMS, 65000, CONTEXT);
    expect(params.poolId).toBe(POOL_ID);
    expect(params.address).toBe(AGENT_ADDRESS);
    expect(params.chainId).toBe(56);
    expect(params.positionId).toBe('pos-001');
  });
});

describe('buildDecreaseOrderParams', () => {
  const position: PositionState = {
    positionId: 'pos-001',
    pair: 'BTC/USDT',
    pairIndex: 1,
    isLong: true,
    entryPrice: 65000,
    exitPrice: null,
    collateralUsd: 20,
    sizeAmount: 2,
    leverage: 10,
    tpPrice: 68250,
    slPrice: 63050,
    status: 'managed',
    orderId: null,
    entryTxHash: '0xabc',
    exitTxHash: null,
    exitReason: null,
    realizedPnlUsd: null,
    reasoningGraphId: 'rg-1',
    openedAt: new Date().toISOString(),
    closedAt: null,
  };

  it('collateralAmount is "0" for full close', () => {
    const params = buildDecreaseOrderParams(position, CONTEXT);
    expect(params.collateralAmount).toBe('0');
  });

  it('size matches position sizeAmount', () => {
    const params = buildDecreaseOrderParams(position, CONTEXT);
    expect(parseFloat(params.size)).toBeCloseTo(2, 5);
  });

  it('direction matches position isLong', () => {
    const longParams = buildDecreaseOrderParams(position, CONTEXT);
    expect(longParams.direction).toBe(Direction.LONG);
    const shortParams = buildDecreaseOrderParams({ ...position, isLong: false }, CONTEXT);
    expect(shortParams.direction).toBe(Direction.SHORT);
  });
});
