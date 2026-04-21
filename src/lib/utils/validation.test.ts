import { describe, it, expect } from 'vitest';
import {
  parseModelOutput,
  claudeSentimentSchema,
  gpt4oExtractionSchema,
  llamaClassificationSchema,
} from './validation';

describe('parseModelOutput', () => {
  it('parses valid Claude sentiment JSON', () => {
    const raw = JSON.stringify({
      narrativeSummary: 'Test summary',
      sentimentScore: 0.5,
      confidenceLevel: 0.8,
      flaggedPatterns: ['pattern1'],
    });
    const result = parseModelOutput(raw, claudeSentimentSchema, 'test-model');
    expect(result.sentimentScore).toBe(0.5);
    expect(result.flaggedPatterns).toEqual(['pattern1']);
  });

  it('parses valid GPT-4o extraction JSON', () => {
    const raw = JSON.stringify({
      features: [{ name: 'oi_imbalance', value: 0.3, direction: 'bullish', weight: 0.7 }],
    });
    const result = parseModelOutput(raw, gpt4oExtractionSchema, 'test-model');
    expect(result.features).toHaveLength(1);
    expect(result.features[0].direction).toBe('bullish');
  });

  it('parses valid Llama classification JSON', () => {
    const raw = JSON.stringify({
      action: 'open_long', confidence: 0.85, rationale: 'Strong bullish signals',
    });
    const result = parseModelOutput(raw, llamaClassificationSchema, 'test-model');
    expect(result.action).toBe('open_long');
  });

  it('strips ```json fences before parsing', () => {
    const raw = '```json\n{"action": "hold", "confidence": 0.1, "rationale": "Low signal"}\n```';
    const result = parseModelOutput(raw, llamaClassificationSchema, 'test-model');
    expect(result.action).toBe('hold');
  });

  it('throws with model ID on invalid JSON', () => {
    expect(() => parseModelOutput('not json', claudeSentimentSchema, 'claude-test'))
      .toThrow(/claude-test/);
  });

  it('throws with Zod details on wrong schema', () => {
    const raw = JSON.stringify({ narrativeSummary: 'test' });
    expect(() => parseModelOutput(raw, claudeSentimentSchema, 'claude-test'))
      .toThrow(/Schema validation failed/);
  });
});

describe('claudeSentimentSchema', () => {
  it('rejects sentimentScore outside [-1, 1]', () => {
    const raw = JSON.stringify({
      narrativeSummary: 'x', sentimentScore: 1.5, confidenceLevel: 0.5, flaggedPatterns: [],
    });
    expect(() => parseModelOutput(raw, claudeSentimentSchema, 'test')).toThrow();
  });
});

describe('llamaClassificationSchema', () => {
  it('rejects confidence outside [0, 1]', () => {
    const raw = JSON.stringify({ action: 'hold', confidence: 2.0, rationale: 'test' });
    expect(() => parseModelOutput(raw, llamaClassificationSchema, 'test')).toThrow();
  });

  it('rejects invalid action value', () => {
    const raw = JSON.stringify({ action: 'buy_everything', confidence: 0.5, rationale: 'test' });
    expect(() => parseModelOutput(raw, llamaClassificationSchema, 'test')).toThrow();
  });

  it('rejects rationale over 200 characters', () => {
    const raw = JSON.stringify({ action: 'hold', confidence: 0.5, rationale: 'x'.repeat(201) });
    expect(() => parseModelOutput(raw, llamaClassificationSchema, 'test')).toThrow();
  });
});
