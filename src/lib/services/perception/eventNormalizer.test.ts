import { describe, it, expect } from 'vitest';
import {
  normalizeFourMemeEvent,
  normalizeMarketSnapshot,
  normalizePriceUpdate,
} from './eventNormalizer';

describe('normalizeFourMemeEvent', () => {
  const baseRaw = {
    Block: { Time: '2026-04-14T10:00:00Z', Number: 12345 },
    Transaction: { Hash: '0xabc', From: '0xbuyer' },
  };

  it('normalizes TokenCreate into LaunchEvent', () => {
    const raw = {
      ...baseRaw,
      Arguments: [
        { Name: 'token', Value: { address: '0xtoken1' } },
        { Name: 'creator', Value: { address: '0xcreator1' } },
        { Name: 'name', Value: { string: 'TestToken' } },
        { Name: 'symbol', Value: { string: 'TT' } },
        { Name: 'initialSupply', Value: { integer: '800000000000000000000000000' } },
      ],
    };

    const result = normalizeFourMemeEvent(raw, 'TokenCreate');
    expect(result.source).toBe('fourmeme');
    expect(result.eventType).toBe('token_create');
    expect(result.eventId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.blockNumber).toBe(12345);
    expect(result.rawHash).toBe('0xabc');
    if (result.eventType === 'token_create') {
      expect(result.tokenAddress).toBe('0xtoken1');
      expect(result.creatorAddress).toBe('0xcreator1');
      expect(result.tokenName).toBe('TestToken');
      expect(result.tokenSymbol).toBe('TT');
    }
  });

  it('normalizes TokenPurchase into PurchaseEvent', () => {
    const raw = {
      ...baseRaw,
      Arguments: [
        { Name: 'token', Value: { address: '0xtoken2' } },
        { Name: 'buyer', Value: { address: '0xbuyer1' } },
        { Name: 'bnbAmount', Value: { integer: '1000000000000000000' } },
        { Name: 'tokenAmount', Value: { integer: '5000000000000000000000' } },
        { Name: 'curveBalance', Value: { integer: '750000000000000000000000000' } },
      ],
    };

    const result = normalizeFourMemeEvent(raw, 'TokenPurchase');
    expect(result.source).toBe('fourmeme');
    expect(result.eventType).toBe('token_purchase');
    if (result.eventType === 'token_purchase') {
      expect(result.bnbAmount).toBe(1000000000000000000n);
      expect(result.tokenAddress).toBe('0xtoken2');
    }
  });

  it('normalizes LiquidityAdded into GraduationEvent', () => {
    const raw = {
      ...baseRaw,
      Arguments: [
        { Name: 'token', Value: { address: '0xtoken3' } },
        { Name: 'bnbAmount', Value: { integer: '18000000000000000000' } },
        { Name: 'lpBurned', Value: { string: 'true' } },
      ],
    };

    const result = normalizeFourMemeEvent(raw, 'LiquidityAdded');
    expect(result.source).toBe('fourmeme');
    expect(result.eventType).toBe('liquidity_added');
  });

  it('throws on missing required fields', () => {
    const raw = { ...baseRaw, Arguments: [] };
    expect(() => normalizeFourMemeEvent(raw, 'TokenCreate')).toThrow(
      /Missing required field/
    );
  });

  it('throws on unknown event type', () => {
    expect(() => normalizeFourMemeEvent({}, 'UnknownEvent')).toThrow(
      /Unknown Four.meme event type/
    );
  });

  it('generates unique UUIDs for each event', () => {
    const raw = {
      ...baseRaw,
      Arguments: [
        { Name: 'token', Value: { address: '0xt' } },
        { Name: 'creator', Value: { address: '0xc' } },
        { Name: 'name', Value: { string: 'A' } },
        { Name: 'symbol', Value: { string: 'A' } },
      ],
    };
    const a = normalizeFourMemeEvent(raw, 'TokenCreate');
    const b = normalizeFourMemeEvent(raw, 'TokenCreate');
    expect(a.eventId).not.toBe(b.eventId);
  });
});

describe('normalizeMarketSnapshot', () => {
  it('parses MYX v2 schema into MarketSnapshot', () => {
    // #given — MYX API response shape (contract_index, ticker_id, numeric values)
    const raw = {
      contract_index: 1,
      ticker_id: 'BTC_USDT',
      last_price: 65000.0,
      index_price: 65001.5,
      funding_rate: 0.0001,
      open_interest: 100.0,
      open_interest_in_usd: 6_500_000,
      base_volume: 10,
      target_volume: 650_000,
    };

    // #when — normalize against ticker "BTC_USDT"
    const result = normalizeMarketSnapshot(raw, 'BTC_USDT');

    // #then — numeric pass-through, pair converted to slash form
    expect(result.source).toBe('myx');
    expect(result.contractIndex).toBe(1);
    expect(result.pair).toBe('BTC/USDT');
    expect(result.lastPrice).toBe(65000);
    expect(result.fundingRate).toBe(0.0001);
    expect(result.openInterestUsd).toBe(6_500_000);
  });

  it('handles null funding_rate without coercing to zero', () => {
    // #given — funding rate null on a less-traded pair
    const raw = {
      contract_index: 2,
      last_price: 2000,
      index_price: 2000,
      funding_rate: null,
      open_interest: 0,
      open_interest_in_usd: 0,
      base_volume: 0,
      target_volume: 0,
    };

    // #when
    const result = normalizeMarketSnapshot(raw, 'ETH_USDT');

    // #then — fundingRate stays null, not NaN or 0
    expect(result.fundingRate).toBeNull();
  });
});

describe('normalizePriceUpdate', () => {
  it('returns PriceUpdate with correct fields', () => {
    const raw = {
      price: '6500000000000',
      confidence: '1000000',
      exponent: -8,
      publishTime: 1713100000,
    };

    const result = normalizePriceUpdate(raw, '0xfeed1', 'BTC/USD');
    expect(result.source).toBe('pyth');
    expect(result.eventType).toBe('price_update');
    expect(result.feedId).toBe('0xfeed1');
    expect(result.pair).toBe('BTC/USD');
    expect(result.price).toBe(6500000000000n);
    expect(result.exponent).toBe(-8);
  });
});
