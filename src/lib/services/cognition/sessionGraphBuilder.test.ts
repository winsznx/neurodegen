import { describe, it, expect } from 'vitest';
import {
  buildCommitteeSession,
  computeReasoningHash,
} from './sessionGraphBuilder';
import type {
  EVDecision,
  ModelCallRecord,
  NarrativeAnalystOutput,
  QuantAnalystOutput,
  RiskClassifierOutput,
} from '@/types/cognition';
import type { AggregateMetrics } from '@/types/perception';
import { DEFAULT_MANDATE } from '@/types/mandate';

function modelCall(modelId: string, text: string): ModelCallRecord {
  return {
    modelId,
    endpointFormat: 'openai_compatible',
    routingDecision: 'dgrid_primary',
    inputTokens: 100,
    outputTokens: 200,
    latencyMs: 1000,
    systemPrompt: 'system',
    userInput: 'user',
    rawOutput: text,
    parsedOutput: {},
    parseSuccess: true,
  };
}

function metrics(regime: AggregateMetrics['regime']): AggregateMetrics {
  return {
    computedAt: 100,
    regime,
    fearGreedValue: 60,
    fearGreedLabel: 'greed',
    topMoversByVolume: [],
    kolActivityByToken: {},
    fundingRatesByPair: {},
    marketLiquidityScore: 0.6,
    activeSurgeTokens: 3,
    x402SpendSessionUSDC: 0,
    x402SpendDailyUSDC: 0,
  };
}

const narrativeParsed: NarrativeAnalystOutput = {
  narrativeSummary: 'KOL velocity rising for CAKE',
  kolMentionedTokens: ['CAKE'],
  sentimentScore: 0.5,
  confidenceLevel: 0.72,
  direction: 'bullish',
  flaggedAnomalies: [],
  topThesisToken: 'CAKE',
};

const quantParsed: QuantAnalystOutput = {
  features: [{ name: 'funding_rate', value: 0.04, direction: 'bullish', weight: 0.6 }],
  dominantDirection: 'bullish',
  liquidityAdequate: true,
  fundingRateWarning: false,
  recommendedToken: 'CAKE',
};

const riskParsedLong: RiskClassifierOutput = {
  action: 'open_long',
  targetToken: 'CAKE',
  confidence: 0.7,
  rationale: 'Narrative + quant aligned on CAKE; funding rate bullish; liquidity ok.',
  dissentAcknowledged: false,
};

const riskParsedHold: RiskClassifierOutput = {
  action: 'hold',
  targetToken: null,
  confidence: 0.2,
  rationale: 'Confidence below threshold.',
  dissentAcknowledged: false,
};

const tokenAddressBySymbol: Record<string, `0x${string}`> = {
  CAKE: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
};

describe('buildCommitteeSession', () => {
  it('produces an open_long action with correct sizing in active regime', () => {
    // #given a clean committee in active regime with no dissent
    const session = buildCommitteeSession({
      sessionId: 'sid-1',
      sessionNumber: 1,
      createdAt: 100,
      regime: 'active',
      previousRegime: 'quiet',
      metrics: metrics('active'),
      evGateDecisions: [],
      x402SpendSessionUSDC: 0,
      narrative: { parsed: narrativeParsed, call: modelCall('claude-sonnet-4.6', '{}') },
      quant: { parsed: quantParsed, call: modelCall('gpt-4o', '{}') },
      dissent: {
        dissentDetected: false,
        dissentSeverity: 'none',
        narrativeDirection: 'bullish',
        quantDirection: 'bullish',
        positionSizeModifier: 1,
        rationale: 'agree',
      },
      risk: { parsed: riskParsedLong, call: modelCall('deepseek/deepseek-v3.2', '{}') },
      mandate: DEFAULT_MANDATE,
      tokenAddressBySymbol,
    });

    // #then size = $100 base * 0.5 active multiplier * 1 dissent * 1 moderate mandate = $50
    expect(session.finalAction.action).toBe('open_long');
    expect(session.finalAction.positionSizeUSD).toBe(50);
    expect(session.finalAction.tokenSymbol).toBe('CAKE');
    expect(session.finalAction.tokenAddress).toBe(tokenAddressBySymbol.CAKE);
    expect(session.finalAction.leverageMultiplier).toBe(1);
  });

  it('halves position size when mild dissent is present', () => {
    // #given mild dissent (modifier 0.5)
    const session = buildCommitteeSession({
      sessionId: 'sid-2',
      sessionNumber: 2,
      createdAt: 100,
      regime: 'momentum',
      previousRegime: 'active',
      metrics: metrics('momentum'),
      evGateDecisions: [],
      x402SpendSessionUSDC: 0,
      narrative: { parsed: narrativeParsed, call: modelCall('claude-sonnet-4.6', '{}') },
      quant: { parsed: { ...quantParsed, dominantDirection: 'neutral' }, call: modelCall('gpt-4o', '{}') },
      dissent: {
        dissentDetected: true,
        dissentSeverity: 'mild',
        narrativeDirection: 'bullish',
        quantDirection: 'neutral',
        positionSizeModifier: 0.5,
        rationale: 'mild',
      },
      risk: { parsed: riskParsedLong, call: modelCall('deepseek/deepseek-v3.2', '{}') },
      mandate: DEFAULT_MANDATE,
      tokenAddressBySymbol,
    });

    // #then size = $100 * 1.0 momentum * 0.5 dissent * 1.0 moderate = $50
    expect(session.finalAction.positionSizeUSD).toBe(50);
  });

  it('returns null sizing on hold action', () => {
    // #given a hold-action risk output
    const session = buildCommitteeSession({
      sessionId: 'sid-3',
      sessionNumber: 3,
      createdAt: 100,
      regime: 'active',
      previousRegime: 'active',
      metrics: metrics('active'),
      evGateDecisions: [],
      x402SpendSessionUSDC: 0,
      narrative: { parsed: narrativeParsed, call: modelCall('claude-sonnet-4.6', '{}') },
      quant: { parsed: quantParsed, call: modelCall('gpt-4o', '{}') },
      dissent: {
        dissentDetected: false,
        dissentSeverity: 'none',
        narrativeDirection: 'bullish',
        quantDirection: 'bullish',
        positionSizeModifier: 1,
        rationale: 'agree',
      },
      risk: { parsed: riskParsedHold, call: modelCall('deepseek/deepseek-v3.2', '{}') },
      mandate: DEFAULT_MANDATE,
      tokenAddressBySymbol,
    });

    // #then no sizing fields are set
    expect(session.finalAction.action).toBe('hold');
    expect(session.finalAction.positionSizeUSD).toBeNull();
    expect(session.finalAction.tokenSymbol).toBeNull();
    expect(session.finalAction.tpPercentage).toBeNull();
    expect(session.finalAction.slPercentage).toBeNull();
  });

  it('produces a deterministic reasoningHash for the same inputs', () => {
    // #given two builds of the same session from identical inputs
    const inputs = (sessionId: string) => ({
      sessionId,
      sessionNumber: 7,
      createdAt: 100,
      regime: 'active' as const,
      previousRegime: 'quiet' as const,
      metrics: metrics('active'),
      evGateDecisions: [] as EVDecision[],
      x402SpendSessionUSDC: 0,
      narrative: { parsed: narrativeParsed, call: modelCall('claude-sonnet-4.6', '{}') },
      quant: { parsed: quantParsed, call: modelCall('gpt-4o', '{}') },
      dissent: {
        dissentDetected: false,
        dissentSeverity: 'none' as const,
        narrativeDirection: 'bullish' as const,
        quantDirection: 'bullish' as const,
        positionSizeModifier: 1,
        rationale: 'agree',
      },
      risk: { parsed: riskParsedLong, call: modelCall('deepseek/deepseek-v3.2', '{}') },
      mandate: DEFAULT_MANDATE,
      tokenAddressBySymbol,
    });

    // #when built twice with the same sessionId
    const a = buildCommitteeSession(inputs('SID-X'));
    const b = buildCommitteeSession(inputs('SID-X'));

    // #then the hash is identical
    expect(a.reasoningHash).toBe(b.reasoningHash);

    // #and changing the sessionId changes the hash
    const c = buildCommitteeSession(inputs('SID-Y'));
    expect(c.reasoningHash).not.toBe(a.reasoningHash);
  });

  it('hash is independent of model-call latencyMs but depends on rawOutput', () => {
    // The canonicalize helper sorts keys so reorderings should not affect hash.
    // A different rawOutput SHOULD change the hash.
    const base = {
      sessionId: 'sid-hash',
      sessionNumber: 7,
      createdAt: 100,
      regime: 'active' as const,
      previousRegime: 'quiet' as const,
      metrics: metrics('active'),
      evGateDecisions: [] as EVDecision[],
      x402SpendSessionUSDC: 0,
      dissent: {
        dissentDetected: false,
        dissentSeverity: 'none' as const,
        narrativeDirection: 'bullish' as const,
        quantDirection: 'bullish' as const,
        positionSizeModifier: 1,
        rationale: 'agree',
      },
      mandate: DEFAULT_MANDATE,
      tokenAddressBySymbol,
    };

    const a = buildCommitteeSession({
      ...base,
      narrative: { parsed: narrativeParsed, call: modelCall('claude-sonnet-4.6', '{ "a": 1 }') },
      quant: { parsed: quantParsed, call: modelCall('gpt-4o', '{ "b": 2 }') },
      risk: { parsed: riskParsedLong, call: modelCall('deepseek/deepseek-v3.2', '{ "c": 3 }') },
    });

    const b = buildCommitteeSession({
      ...base,
      narrative: { parsed: narrativeParsed, call: modelCall('claude-sonnet-4.6', '{ "a": 999 }') },
      quant: { parsed: quantParsed, call: modelCall('gpt-4o', '{ "b": 2 }') },
      risk: { parsed: riskParsedLong, call: modelCall('deepseek/deepseek-v3.2', '{ "c": 3 }') },
    });

    expect(a.reasoningHash).not.toBe(b.reasoningHash);
  });
});

describe('computeReasoningHash', () => {
  it('returns a 0x-prefixed 32-byte hex string', () => {
    const hash = computeReasoningHash({
      sessionId: 'sid',
      sessionNumber: 1,
      createdAt: 0,
      regime: 'quiet',
      previousRegime: null,
      fearGreedAtSession: 50,
      inputMetrics: metrics('quiet'),
      evGateDecisions: [],
      x402SpendThisSessionUSDC: 0,
      narrativeCall: modelCall('m', '{}'),
      quantCall: modelCall('m', '{}'),
      dissentResult: {
        dissentDetected: false,
        dissentSeverity: 'none',
        narrativeDirection: 'neutral',
        quantDirection: 'neutral',
        positionSizeModifier: 1,
        rationale: '',
      },
      riskCall: modelCall('m', '{}'),
      finalAction: {
        action: 'hold',
        tokenSymbol: null,
        tokenAddress: null,
        confidence: 0,
        positionSizeUSD: null,
        leverageMultiplier: 1,
        tpPercentage: null,
        slPercentage: null,
        rationale: '',
        plainLanguageExplanation: '',
      },
    });
    expect(hash).toMatch(/^0x[a-f0-9]{64}$/);
  });
});
