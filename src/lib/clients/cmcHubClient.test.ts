import { describe, it, expect } from 'vitest';
import { validatePaymentRequirement } from './cmcHubClient';

describe('validatePaymentRequirement', () => {
  const ok = {
    scheme: 'exact',
    network: 'base',
    chainId: 8453,
    asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    payTo: '0xfacilitator',
    maxAmountRequired: 10_000, // 0.01 USDC
  };

  it('accepts a well-formed Base USDC exact-scheme requirement', () => {
    // #given valid req
    // #when validated
    const result = validatePaymentRequirement(ok);
    // #then null (no reason to reject)
    expect(result).toBeNull();
  });

  it('rejects a non-exact scheme', () => {
    // #given upto scheme
    // #when
    const result = validatePaymentRequirement({ ...ok, scheme: 'upto' });
    // #then
    expect(result).toMatch(/unsupported scheme/);
  });

  it('rejects a non-Base network', () => {
    const result = validatePaymentRequirement({ ...ok, network: 'ethereum' });
    expect(result).toMatch(/unsupported network/);
  });

  it('rejects a wrong chainId', () => {
    const result = validatePaymentRequirement({ ...ok, chainId: 1 });
    expect(result).toMatch(/unexpected chainId/);
  });

  it('rejects a tampered asset address', () => {
    const result = validatePaymentRequirement({ ...ok, asset: '0xdeadbeef' });
    expect(result).toMatch(/unexpected asset/);
  });

  it('rejects missing payTo', () => {
    const result = validatePaymentRequirement({ ...ok, payTo: undefined });
    expect(result).toMatch(/missing payTo/);
  });

  it('rejects an invalid maxAmountRequired', () => {
    const result = validatePaymentRequirement({ ...ok, maxAmountRequired: 0 });
    expect(result).toMatch(/invalid maxAmountRequired/);
  });

  it('rejects a price above the cap', () => {
    // #given 1 USDC requested (way above 0.02 cap)
    const result = validatePaymentRequirement({ ...ok, maxAmountRequired: 1_000_000 });
    // #then
    expect(result).toMatch(/exceeds cap/);
  });
});
