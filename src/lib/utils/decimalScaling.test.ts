import { describe, it, expect } from 'vitest';
import {
  toCollateralScale,
  toPriceScale,
  fromCollateralScale,
  fromPriceScale,
} from './decimalScaling';

describe('toCollateralScale', () => {
  it('scales a USD amount to 1e18 bigint', () => {
    const result = toCollateralScale(50.0);
    expect(result).toBe(50n * 10n ** 18n);
  });

  it('returns 0n for zero', () => {
    expect(toCollateralScale(0)).toBe(0n);
  });

  it('handles negative values for collateral withdrawal', () => {
    const result = toCollateralScale(-50.0);
    expect(result).toBe(-50n * 10n ** 18n);
  });

  it('handles fractional amounts', () => {
    const result = toCollateralScale(1.5);
    expect(result).toBe(15n * 10n ** 17n);
  });
});

describe('toPriceScale', () => {
  it('scales a USD price to 1e30 bigint', () => {
    const result = toPriceScale(65000.0);
    expect(result).toBe(65000n * 10n ** 30n);
  });

  it('returns 0n for zero', () => {
    expect(toPriceScale(0)).toBe(0n);
  });

  it('handles large values without precision loss', () => {
    const result = toPriceScale(100000.0);
    expect(result).toBe(100000n * 10n ** 30n);
  });
});

describe('fromCollateralScale', () => {
  it('converts 1e18 bigint to USD number', () => {
    const scaled = 50n * 10n ** 18n;
    expect(fromCollateralScale(scaled)).toBe(50);
  });

  it('returns 0 for zero', () => {
    expect(fromCollateralScale(0n)).toBe(0);
  });

  it('handles negative values', () => {
    const scaled = -50n * 10n ** 18n;
    expect(fromCollateralScale(scaled)).toBe(-50);
  });
});

describe('fromPriceScale', () => {
  it('converts 1e30 bigint to USD number', () => {
    const scaled = 65000n * 10n ** 30n;
    expect(fromPriceScale(scaled)).toBe(65000);
  });

  it('returns 0 for zero', () => {
    expect(fromPriceScale(0n)).toBe(0);
  });
});

describe('round-trip conversions', () => {
  it('collateral round-trip preserves value', () => {
    const original = 50.0;
    const roundTripped = fromCollateralScale(toCollateralScale(original));
    expect(roundTripped).toBe(original);
  });

  it('price round-trip preserves value', () => {
    const original = 65000.0;
    const roundTripped = fromPriceScale(toPriceScale(original));
    expect(roundTripped).toBe(original);
  });

  it('collateral round-trip with fractional value', () => {
    const original = 20.5;
    const roundTripped = fromCollateralScale(toCollateralScale(original));
    expect(roundTripped).toBeCloseTo(original, 10);
  });

  it('negative collateral round-trip', () => {
    const original = -50.0;
    const roundTripped = fromCollateralScale(toCollateralScale(original));
    expect(roundTripped).toBe(original);
  });
});
