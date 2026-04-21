import type { AggregateMetrics } from './perception';

export type RegimeLabel = 'quiet' | 'active' | 'retail_frenzy' | 'volatile';

export interface ModelCall {
  callId: string;
  modelId: string;
  endpointFormat: 'claude_native' | 'openai_compatible' | 'gemini_native';
  routingDecision: 'dgrid' | 'byok';
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  timestamp: number;
  systemPrompt: string;
  userInput: string;
  rawOutput: string;
  parsedOutput: Record<string, unknown>;
  parseSuccess: boolean;
}

export interface ActionRecommendation {
  action: 'open_long' | 'open_short' | 'close_position' | 'adjust_parameters' | 'hold';
  pair: string;
  confidence: number;
  positionSizeUSD: number | null;
  leverageMultiplier: number | null;
  tpPercentage: number | null;
  slPercentage: number | null;
  rationale: string;
}

export interface ReasoningGraph {
  graphId: string;
  createdAt: number;
  regime: RegimeLabel;
  inputMetrics: AggregateMetrics;
  modelCalls: ModelCall[];
  aggregationLogic: string;
  finalAction: ActionRecommendation;
  executionResult: {
    executed: boolean;
    orderId: string | null;
    txHash: string | null;
    failureReason: string | null;
  } | null;
}
