import { afterEach, describe, expect, it } from 'vitest';
import { promptCache } from './promptCache';
import type { LLMCallResult } from './claudeClient';

afterEach(() => {
  promptCache.reset();
});

function makeResult(text: string): LLMCallResult {
  return {
    text,
    inputTokens: 100,
    outputTokens: 50,
    modelId: 'test-model',
  };
}

describe('promptCache', () => {
  it('returns identical keys for identical inputs regardless of object identity', () => {
    // #given the same prompt content built two different ways
    const key1 = promptCache.computeKey('sys', 'user', 'gpt-4o');
    const key2 = promptCache.computeKey('sys', 'user', 'gpt-4o');

    // #then the keccak keys are bit-identical
    expect(key1).toBe(key2);
    expect(key1).toMatch(/^0x[a-f0-9]{64}$/);
  });

  it('returns different keys for different model IDs', () => {
    // #given the same prompt against two different model IDs
    const a = promptCache.computeKey('sys', 'user', 'gpt-4o');
    const b = promptCache.computeKey('sys', 'user', 'claude-sonnet-4.6');

    // #then keys differ
    expect(a).not.toBe(b);
  });

  it('stores and retrieves results by key', () => {
    // #given a result stored under a key
    const key = promptCache.computeKey('sys', 'user', 'gpt-4o');
    expect(promptCache.get(key)).toBeNull();

    promptCache.set(key, makeResult('first'));

    // #then the cache returns the stored result
    expect(promptCache.get(key)?.text).toBe('first');
  });

  it('tracks hit ratio across calls', () => {
    // #given a clean cache
    const key = promptCache.computeKey('sys', 'user', 'gpt-4o');
    expect(promptCache.stats().hitRatio).toBe(0);

    // #when we miss then store then hit
    promptCache.get(key); // miss
    promptCache.set(key, makeResult('cached'));
    promptCache.get(key); // hit
    promptCache.get(key); // hit

    // #then hit ratio = 2/3
    const stats = promptCache.stats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
    expect(stats.hitRatio).toBeCloseTo(2 / 3, 4);
  });
});
