import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ALLOWED_TOKEN_SYMBOLS,
  allowedTokenSymbols,
  isAllowedTokenAddress,
  isAllowedTokenSymbol,
  loadAllowlistFromEnv,
  setAllowedTokens,
} from './allowedTokens';

const ORIGINAL_ENV = process.env.ALLOWED_TOKENS_JSON;

beforeEach(() => {
  // Reset runtime allowlist to seed via setAllowedTokens with original seed members
  setAllowedTokens({
    USDT: '0x55d398326f99059fF775485246999027B3197955',
    BUSD: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
    CAKE: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
    WBNB: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    BNB: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
  });
});

afterEach(() => {
  if (ORIGINAL_ENV === undefined) {
    delete process.env.ALLOWED_TOKENS_JSON;
  } else {
    process.env.ALLOWED_TOKENS_JSON = ORIGINAL_ENV;
  }
});

describe('isAllowedTokenSymbol', () => {
  it('matches case-insensitively', () => {
    // #given the seed allowlist
    expect(isAllowedTokenSymbol('cake')).toBe(true);
    expect(isAllowedTokenSymbol('CAKE')).toBe(true);
    expect(isAllowedTokenSymbol('FAKE')).toBe(false);
  });
});

describe('isAllowedTokenAddress', () => {
  it('matches case-insensitively against runtime allowlist', () => {
    // #given a known seed address (CAKE)
    expect(isAllowedTokenAddress('0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82')).toBe(true);
    expect(isAllowedTokenAddress('0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82')).toBe(true);
    expect(isAllowedTokenAddress('0x0000000000000000000000000000000000000000')).toBe(false);
  });
});

describe('loadAllowlistFromEnv', () => {
  it('returns loaded=false when env var is unset', () => {
    // #given no env var
    delete process.env.ALLOWED_TOKENS_JSON;

    // #when loaded
    const result = loadAllowlistFromEnv();

    // #then loaded=false and source=seed
    expect(result.loaded).toBe(false);
    expect(result.source).toBe('seed');
  });

  it('returns loaded=false for malformed JSON', () => {
    // #given garbage JSON
    process.env.ALLOWED_TOKENS_JSON = '{this is not json';

    // #when loaded
    const result = loadAllowlistFromEnv();

    // #then loaded=false with a parse error reason
    expect(result.loaded).toBe(false);
    expect(result.reason).toMatch(/JSON parse failed/);
  });

  it('loads a valid {SYMBOL: 0xaddress} map and updates the runtime allowlist', () => {
    // #given a valid JSON map with two new tokens
    process.env.ALLOWED_TOKENS_JSON = JSON.stringify({
      ETH: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
      BTCB: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c',
    });

    // #when loaded
    const result = loadAllowlistFromEnv();

    // #then loaded=true with the right count and runtime allowlist swapped
    expect(result.loaded).toBe(true);
    expect(result.count).toBe(2);
    expect(isAllowedTokenSymbol('ETH')).toBe(true);
    expect(isAllowedTokenSymbol('BTCB')).toBe(true);
    expect(isAllowedTokenSymbol('CAKE')).toBe(false); // replaced
    expect(allowedTokenSymbols().sort()).toEqual(['BTCB', 'ETH']);
  });

  it('skips entries with malformed addresses', () => {
    // #given a JSON map with one valid and one malformed entry
    process.env.ALLOWED_TOKENS_JSON = JSON.stringify({
      ETH: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
      BOGUS: 'not-an-address',
    });

    // #when loaded
    const result = loadAllowlistFromEnv();

    // #then only the valid entry sticks
    expect(result.loaded).toBe(true);
    expect(result.count).toBe(1);
    expect(isAllowedTokenSymbol('ETH')).toBe(true);
    expect(isAllowedTokenSymbol('BOGUS')).toBe(false);
  });

  it('rejects non-object JSON (arrays, primitives)', () => {
    // #given an array
    process.env.ALLOWED_TOKENS_JSON = '[1, 2, 3]';

    // #when loaded
    const result = loadAllowlistFromEnv();

    // #then rejected
    expect(result.loaded).toBe(false);
    expect(result.reason).toMatch(/expected/);
  });

  it('static ALLOWED_TOKEN_SYMBOLS export is stable for prompt-building', () => {
    // #given the constant export used in the Risk Classifier prompt
    // #then it contains the canonical seed tokens (does not change at runtime)
    expect(ALLOWED_TOKEN_SYMBOLS).toContain('USDT');
    expect(ALLOWED_TOKEN_SYMBOLS).toContain('CAKE');
  });
});
