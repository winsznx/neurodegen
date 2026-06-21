import { describe, it, expect } from 'vitest';
import { fmtUSD, fmtPct, fmtNum, fmtAddr, fmtRel, fmtSide, bscScanTx, bscScanAddr } from './format';

describe('fmtUSD', () => {
  it('formats normal amounts with 2 decimals', () => {
    expect(fmtUSD(1234.5678)).toBe('$1,234.57');
  });
  it('returns dash for null/undefined/NaN', () => {
    expect(fmtUSD(null)).toBe('-');
    expect(fmtUSD(undefined)).toBe('-');
    expect(fmtUSD(Number.NaN)).toBe('-');
  });
  it('uses compact notation above 1M when opted in', () => {
    expect(fmtUSD(1_500_000, { compact: true })).toMatch(/1\.5M/);
  });
});

describe('fmtPct', () => {
  it('signs positive values', () => {
    expect(fmtPct(0.1234)).toBe('+12.34%');
  });
  it('does not over-sign negative values', () => {
    expect(fmtPct(-0.05)).toBe('-5.00%');
  });
  it('emits colour emoji when requested', () => {
    expect(fmtPct(0.01, { emoji: true })).toBe('🟢 +1.00%');
    expect(fmtPct(-0.01, { emoji: true })).toBe('🔴 -1.00%');
  });
});

describe('fmtAddr', () => {
  it('truncates a 40-char EVM address', () => {
    const a = '0x1234567890abcdef1234567890abcdef12345678';
    expect(fmtAddr(a)).toBe('0x1234…5678');
  });
  it('returns dash for empty', () => {
    expect(fmtAddr('')).toBe('-');
    expect(fmtAddr(null)).toBe('-');
  });
  it('leaves a short non-hex string alone', () => {
    expect(fmtAddr('foo')).toBe('foo');
  });
});

describe('fmtRel', () => {
  const NOW = 1_750_000_000_000;
  it('formats seconds-ago', () => {
    expect(fmtRel(NOW - 5_000, NOW)).toMatch(/5 seconds ago|now/);
  });
  it('formats minutes-ago', () => {
    expect(fmtRel(NOW - 120_000, NOW)).toBe('2 minutes ago');
  });
  it('formats hours', () => {
    expect(fmtRel(NOW - 3_600_000, NOW)).toBe('1 hour ago');
  });
  it('returns dash for invalid', () => {
    expect(fmtRel('not-a-date', NOW)).toBe('-');
  });
});

describe('fmtSide', () => {
  it('maps directional values to emojis', () => {
    expect(fmtSide('long')).toBe('📈 LONG');
    expect(fmtSide('short')).toBe('📉 SHORT');
    expect(fmtSide('spot')).toBe('⚪️ SPOT');
  });
});

describe('fmtNum', () => {
  it('formats with thousands separator', () => {
    expect(fmtNum(1234567)).toBe('1,234,567');
  });
  it('compacts above 10k', () => {
    expect(fmtNum(12345, { compact: true })).toMatch(/12\.35K|12.3K/);
  });
});

describe('BscScan helpers', () => {
  it('builds tx URL', () => {
    expect(bscScanTx('0xabc')).toBe('https://bscscan.com/tx/0xabc');
  });
  it('builds address URL', () => {
    expect(bscScanAddr('0xdef')).toBe('https://bscscan.com/address/0xdef');
  });
});
