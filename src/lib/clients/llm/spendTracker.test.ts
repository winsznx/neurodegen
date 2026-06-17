import { afterEach, describe, expect, it } from 'vitest';
import { llmSpendTracker } from './spendTracker';

afterEach(() => {
  llmSpendTracker.reset();
});

describe('llmSpendTracker', () => {
  it('records cost against canonical retail rates', () => {
    // #given a known-price model call
    llmSpendTracker.recordCall('gpt-4o', 1_000_000, 0);
    // #then daily USD equals the input rate ($2.50/M)
    expect(llmSpendTracker.status().dailyUSD).toBeCloseTo(2.5, 4);
  });

  it('falls back to a default rate for unknown model IDs', () => {
    // #given a never-before-seen model
    llmSpendTracker.recordCall('unknown/model', 1_000_000, 0);
    // #then it falls back to the canonical-retail default ($2.50/M input)
    expect(llmSpendTracker.status().dailyUSD).toBeCloseTo(2.5, 4);
  });

  it('trips the hard kill once the ceiling is hit', () => {
    // #given a $5/day ceiling and an expensive call that pushes us over
    expect(llmSpendTracker.isKilled()).toBe(false);

    // GPT-4o output is $10/M; 600k output tokens = $6 which exceeds $5 ceiling
    llmSpendTracker.recordCall('gpt-4o', 0, 600_000);

    // #then kill switch is active and ensureBudget throws
    expect(llmSpendTracker.isKilled()).toBe(true);
    expect(() => llmSpendTracker.ensureBudget()).toThrow(/LLM_DAILY_SPEND_LIMIT_HIT/);
  });

  it('ensureBudget is a no-op below the ceiling', () => {
    // #given a small call well under the ceiling
    llmSpendTracker.recordCall('deepseek/deepseek-v3.2', 1000, 1000);

    // #then ensureBudget does not throw
    expect(() => llmSpendTracker.ensureBudget()).not.toThrow();
  });
});
