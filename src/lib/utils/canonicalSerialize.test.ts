import { describe, it, expect } from 'vitest';
import { canonicalize } from './canonicalSerialize';

describe('canonicalize', () => {
  it('produces identical output for objects with different key orders', () => {
    // #given two objects with the same data but different key insertion order
    const a = { b: 2, a: 1, c: { y: 'y', x: 'x' } };
    const b = { c: { x: 'x', y: 'y' }, a: 1, b: 2 };

    // #when canonicalized
    const sa = canonicalize(a);
    const sb = canonicalize(b);

    // #then they hash to the same string
    expect(sa).toBe(sb);
    expect(sa).toBe('{"a":1,"b":2,"c":{"x":"x","y":"y"}}');
  });

  it('preserves array order', () => {
    // #given a list whose semantic order matters
    const a = [3, 1, 2];

    // #when canonicalized
    const out = canonicalize(a);

    // #then order is preserved
    expect(out).toBe('[3,1,2]');
  });

  it('serializes BigInt as a decimal string', () => {
    // #given an object containing a BigInt
    const a = { reservesWei: 12_345_678_901_234_567_890n };

    // #when canonicalized
    const out = canonicalize(a);

    // #then BigInt becomes a string
    expect(out).toBe('{"reservesWei":"12345678901234567890"}');
  });

  it('serializes Date as ISO string', () => {
    // #given an object containing a Date
    const a = { at: new Date('2026-01-01T00:00:00.000Z') };

    // #when canonicalized
    const out = canonicalize(a);

    // #then Date becomes its ISO string
    expect(out).toBe('{"at":"2026-01-01T00:00:00.000Z"}');
  });

  it('omits undefined values', () => {
    // #given an object with mixed defined and undefined keys
    const a = { a: 1, b: undefined, c: 3 };

    // #when canonicalized
    const out = canonicalize(a);

    // #then undefined-valued key is omitted
    expect(out).toBe('{"a":1,"c":3}');
  });

  it('rejects cycles', () => {
    // #given an object with a self-reference
    const a: Record<string, unknown> = { x: 1 };
    a.self = a;

    // #when/then canonicalize throws
    expect(() => canonicalize(a)).toThrow(/cycle/);
  });

  it('rejects non-finite numbers', () => {
    // #given an object containing NaN
    const a = { x: NaN };

    // #then canonicalize throws to refuse silent corruption
    expect(() => canonicalize(a)).toThrow(/non-finite/);
  });

  it('handles deeply nested structures with sorted output', () => {
    // #given a deep, mixed structure with deliberately scrambled key order
    const v = {
      zeta: { gamma: [3, 2, 1], alpha: 'z' },
      alpha: { z: 'a', y: 'b', x: 'c' },
      beta: 2,
    };

    // #when canonicalized
    const out = canonicalize(v);

    // #then keys at every level are sorted, arrays untouched
    expect(out).toBe(
      '{"alpha":{"x":"c","y":"b","z":"a"},"beta":2,"zeta":{"alpha":"z","gamma":[3,2,1]}}',
    );
  });

  it('treats two objects with equivalent BigInt-string fields identically', () => {
    // #given two structurally equivalent inputs where one uses BigInt and one uses pre-serialized string
    const fromBigint = canonicalize({ wei: 1_000n });
    const fromString = canonicalize({ wei: '1000' });

    // #then both produce the same canonical output
    expect(fromBigint).toBe(fromString);
  });
});
