import type { AggregateMetrics, RegimeLabel } from './perception';

export interface EVDecision {
  shouldFetchPremium: boolean;
  projectedAlphaUSD: number;
  x402CostUSDC: number;
  gasCostUSD: number;
  evRatio: number;
  rationale: string;
  triggeringSignal: string;
  thresholdUsed: number;
}

export interface NarrativeAnalystOutput {
  narrativeSummary: string;
  kolMentionedTokens: string[];
  sentimentScore: number;
  confidenceLevel: number;
  direction: 'bullish' | 'bearish' | 'neutral';
  flaggedAnomalies: string[];
  topThesisToken: string | null;
}

export interface QuantFeature {
  name: string;
  value: number | string;
  direction: 'bullish' | 'bearish' | 'neutral';
  weight: number;
}

export interface QuantAnalystOutput {
  features: QuantFeature[];
  dominantDirection: 'bullish' | 'bearish' | 'neutral';
  liquidityAdequate: boolean;
  fundingRateWarning: boolean;
  recommendedToken: string | null;
}

export type ActionType =
  | 'open_long'
  | 'close_position'
  | 'adjust_parameters'
  | 'hold';

export interface RiskClassifierOutput {
  action: ActionType;
  targetToken: string | null;
  confidence: number;
  rationale: string;
  dissentAcknowledged: boolean;
}

export type DissentSeverity = 'none' | 'mild' | 'strong';
export type DirectionalLabel = 'bullish' | 'bearish' | 'neutral';

export interface DissentResult {
  dissentDetected: boolean;
  dissentSeverity: DissentSeverity;
  narrativeDirection: DirectionalLabel;
  quantDirection: DirectionalLabel;
  positionSizeModifier: number;
  rationale: string;
}

export type EndpointFormat = 'claude_native' | 'openai_compatible';
export type RoutingDecision = 'direct' | 'dgrid_fallback' | 'dgrid_primary';

export interface ModelCallRecord {
  modelId: string;
  endpointFormat: EndpointFormat;
  routingDecision: RoutingDecision;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  systemPrompt: string;
  userInput: string;
  rawOutput: string;
  parsedOutput: Record<string, unknown>;
  parseSuccess: boolean;
}

export interface ActionRecommendation {
  action: ActionType;
  tokenSymbol: string | null;
  tokenAddress: `0x${string}` | null;
  confidence: number;
  positionSizeUSD: number | null;
  leverageMultiplier: 1;
  tpPercentage: number | null;
  slPercentage: number | null;
  rationale: string;
  plainLanguageExplanation: string;
}

export interface CommitteeSession {
  sessionId: string;
  sessionNumber: number;
  createdAt: number;
  regime: RegimeLabel;
  previousRegime: RegimeLabel | null;
  fearGreedAtSession: number;
  inputMetrics: AggregateMetrics;
  evGateDecisions: EVDecision[];
  x402SpendThisSessionUSDC: number;
  narrativeCall: ModelCallRecord;
  quantCall: ModelCallRecord;
  dissentResult: DissentResult;
  riskCall: ModelCallRecord;
  finalAction: ActionRecommendation;
  reasoningHash: `0x${string}`;
  attestationCommitTx: `0x${string}` | null;
  executionResult: ExecutionResultRecord | null;
}

export interface ExecutionResultRecord {
  executed: boolean;
  twakTxHash: `0x${string}` | null;
  bscscanUrl: string | null;
  attestationRevealTx: `0x${string}` | null;
  failureReason: string | null;
}
