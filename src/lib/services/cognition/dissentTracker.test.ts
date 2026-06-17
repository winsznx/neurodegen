import { describe, it, expect } from 'vitest';
import { computeDissent } from './dissentTracker';
import type {
  NarrativeAnalystOutput,
  QuantAnalystOutput,
} from '@/types/cognition';

function narrative(direction: NarrativeAnalystOutput['direction']): NarrativeAnalystOutput {
  return {
    narrativeSummary: '',
    kolMentionedTokens: [],
    sentimentScore: 0,
    confidenceLevel: 0.7,
    direction,
    flaggedAnomalies: [],
    topThesisToken: null,
  };
}

function quant(direction: QuantAnalystOutput['dominantDirection']): QuantAnalystOutput {
  return {
    features: [],
    dominantDirection: direction,
    liquidityAdequate: true,
    fundingRateWarning: false,
    recommendedToken: null,
  };
}

describe('computeDissent', () => {
  it('returns no dissent when both analysts agree bullish', () => {
    // #given matching bullish directions
    const result = computeDissent(narrative('bullish'), quant('bullish'));

    // #then no dissent, modifier 1.0
    expect(result.dissentDetected).toBe(false);
    expect(result.dissentSeverity).toBe('none');
    expect(result.positionSizeModifier).toBe(1);
  });

  it('returns mild dissent when one side is neutral', () => {
    // #given narrative bullish, quant neutral
    const result = computeDissent(narrative('bullish'), quant('neutral'));

    // #then mild, modifier 0.5
    expect(result.dissentDetected).toBe(true);
    expect(result.dissentSeverity).toBe('mild');
    expect(result.positionSizeModifier).toBe(0.5);
  });

  it('returns strong dissent when bullish meets bearish', () => {
    // #given conflicting bullish vs bearish directions
    const result = computeDissent(narrative('bullish'), quant('bearish'));

    // #then strong, modifier 0 (forces hold)
    expect(result.dissentDetected).toBe(true);
    expect(result.dissentSeverity).toBe('strong');
    expect(result.positionSizeModifier).toBe(0);
  });

  it('symmetrically detects bearish-narrative vs bullish-quant as strong', () => {
    // #given inverted directional conflict
    const result = computeDissent(narrative('bearish'), quant('bullish'));

    // #then strong
    expect(result.dissentSeverity).toBe('strong');
    expect(result.positionSizeModifier).toBe(0);
  });

  it('records both directions in the result', () => {
    // #given a mild dissent case
    const result = computeDissent(narrative('neutral'), quant('bearish'));

    // #then the result preserves both directions for the audit log
    expect(result.narrativeDirection).toBe('neutral');
    expect(result.quantDirection).toBe('bearish');
  });

  it('forces mild dissent when narrative parse-failed but quant agrees neutral', () => {
    // #given both look neutral but narrative parse failed
    const result = computeDissent(narrative('neutral'), quant('neutral'), {
      narrativeOk: false,
      quantOk: true,
    });

    // #then computeDissent rejects the false unanimity and halves size
    expect(result.dissentSeverity).toBe('mild');
    expect(result.positionSizeModifier).toBe(0.5);
    expect(result.rationale).toMatch(/narrative analyst parse-failed/);
  });

  it('forces mild dissent when both analysts parse-failed', () => {
    // #given both parses failed → both default to neutral
    const result = computeDissent(narrative('neutral'), quant('neutral'), {
      narrativeOk: false,
      quantOk: false,
    });

    // #then dissent is mild (not none), rationale names both
    expect(result.dissentSeverity).toBe('mild');
    expect(result.rationale).toMatch(/both analysts parse-failed/);
  });

  it('preserves "none" verdict when parses succeeded and directions match', () => {
    // #given both parsed cleanly and agree bullish
    const result = computeDissent(narrative('bullish'), quant('bullish'), {
      narrativeOk: true,
      quantOk: true,
    });

    // #then no dissent
    expect(result.dissentSeverity).toBe('none');
    expect(result.positionSizeModifier).toBe(1);
  });
});
