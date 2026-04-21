import { describe, it, expect } from 'vitest';
import {
  sanitizeTokenName,
  buildClaudeSentimentPrompt,
  buildGPT4oExtractionPrompt,
  buildLlamaClassificationPrompt,
} from './prompts';
import type { LaunchEvent, PurchaseEvent, AggregateMetrics, MarketSnapshot } from '@/types/perception';

const mockMetrics: AggregateMetrics = {
  computedAt: Date.now(),
  launchVelocityPerHour: 5,
  capitalInflowBNBPerHour: 2,
  graduationVelocityPerHour: 0.5,
  activeLaunches: 3,
  topTokensByInflow: [],
  myxMetrics: {},
};

const mockLaunch: LaunchEvent = {
  eventId: '1', source: 'fourmeme', eventType: 'token_create',
  timestamp: Date.now(), blockNumber: null, rawHash: null,
  tokenAddress: '0x1', creatorAddress: '0x2',
  tokenName: 'Test<script>alert("xss")</script>Token',
  tokenSymbol: 'T$T!',
  initialSupplyOnCurve: 800_000_000n * 10n ** 18n,
};

const mockPurchase: PurchaseEvent = {
  eventId: '2', source: 'fourmeme', eventType: 'token_purchase',
  timestamp: Date.now(), blockNumber: null, rawHash: null,
  tokenAddress: '0x1', buyerAddress: '0x3',
  bnbAmount: 10n ** 18n, tokenAmount: 1000n * 10n ** 18n,
  currentCurveBalance: 750_000_000n * 10n ** 18n,
};

describe('sanitizeTokenName', () => {
  it('strips non-alphanumeric/space/underscore/hyphen characters', () => {
    expect(sanitizeTokenName('Hello$World!')).toBe('HelloWorld');
  });

  it('truncates to 100 characters', () => {
    const long = 'A'.repeat(200);
    expect(sanitizeTokenName(long)).toHaveLength(100);
  });

  it('handles empty string', () => {
    expect(sanitizeTokenName('')).toBe('');
  });

  it('returns empty for string of only special characters', () => {
    expect(sanitizeTokenName('$!@#%^&*()')).toBe('');
  });

  it('preserves spaces, underscores, and hyphens', () => {
    expect(sanitizeTokenName('Hello World_Foo-Bar')).toBe('Hello World_Foo-Bar');
  });
});

describe('buildClaudeSentimentPrompt', () => {
  it('system prompt contains UNTRUSTED USER INPUT', () => {
    const { systemPrompt } = buildClaudeSentimentPrompt([mockLaunch], [mockPurchase], mockMetrics);
    expect(systemPrompt).toContain('UNTRUSTED USER INPUT');
  });

  it('user content has sanitized token names', () => {
    const { userContent } = buildClaudeSentimentPrompt([mockLaunch], [mockPurchase], mockMetrics);
    expect(userContent).not.toContain('<script>');
    expect(userContent).toContain('TestscriptalertxssscriptToken');
  });

  it('user content contains DATA section', () => {
    const { userContent } = buildClaudeSentimentPrompt([mockLaunch], [mockPurchase], mockMetrics);
    expect(userContent).toContain('<DATA>');
    expect(userContent).toContain('</DATA>');
  });
});

describe('buildGPT4oExtractionPrompt', () => {
  it('system prompt contains JSON schema instruction', () => {
    const { systemPrompt } = buildGPT4oExtractionPrompt(mockMetrics, []);
    expect(systemPrompt).toContain('Respond ONLY with the JSON schema');
  });
});

describe('buildLlamaClassificationPrompt', () => {
  it('includes regime label in user content', () => {
    const sentiment = { narrativeSummary: 'test', sentimentScore: 0.5, confidenceLevel: 0.8, flaggedPatterns: [] };
    const extraction = { features: [] };
    const { userContent } = buildLlamaClassificationPrompt(sentiment, extraction, 'active');
    expect(userContent).toContain('active');
  });
});
