import type { AggregateMetrics } from '@/types/perception';
import type { RegimeLabel, ReasoningGraph, ModelCall, ActionRecommendation } from '@/types/cognition';
import type { ClaudeSentimentOutput, GPT4oExtractionOutput, LlamaClassificationOutput } from '@/lib/utils/prompts';
import type { ModelCallAttempt } from './fallbackHandler';
import type { RegimeParameters } from './regimeClassifier';
import { BASE_POSITION_SIZE_USD, MIN_CONFIDENCE_TO_ACT } from '@/config';

interface ModelResult<T> {
  parsed: T;
  attempts: ModelCallAttempt[];
  systemPrompt: string;
  userContent: string;
}

function buildModelCalls(results: ModelResult<unknown>[]): ModelCall[] {
  const calls: ModelCall[] = [];
  for (const result of results) {
    for (const attempt of result.attempts) {
      calls.push({
        callId: crypto.randomUUID(),
        modelId: attempt.modelId,
        endpointFormat: attempt.endpointFormat,
        routingDecision: attempt.routingDecision,
        inputTokens: attempt.inputTokens || Math.ceil(result.userContent.length / 4),
        outputTokens: attempt.outputTokens || Math.ceil(attempt.responseText.length / 4),
        latencyMs: attempt.latencyMs,
        timestamp: Date.now(),
        systemPrompt: result.systemPrompt,
        userInput: result.userContent,
        rawOutput: attempt.responseText,
        parsedOutput: attempt.success ? (result.parsed as Record<string, unknown>) : {},
        parseSuccess: attempt.success,
      });
    }
  }
  return calls;
}

export class ReasoningGraphBuilder {
  build(
    regime: RegimeLabel,
    inputMetrics: AggregateMetrics,
    sentimentResult: ModelResult<ClaudeSentimentOutput>,
    extractionResult: ModelResult<GPT4oExtractionOutput>,
    classificationResult: ModelResult<LlamaClassificationOutput>,
    regimeParameters: RegimeParameters
  ): ReasoningGraph {
    const sentiment = sentimentResult.parsed;
    const extraction = extractionResult.parsed;
    const classification = classificationResult.parsed;

    const dominantDirection = this.getDominantDirection(extraction);
    const aggregationLogic =
      `Claude sentiment (score: ${sentiment.sentimentScore}, confidence: ${sentiment.confidenceLevel})` +
      ` + GPT-4o features (${extraction.features.length} features, dominant direction: ${dominantDirection})` +
      ` + Llama classification (action: ${classification.action}, confidence: ${classification.confidence}).` +
      ` Regime: ${regime} with multiplier ${regimeParameters.positionSizeMultiplier}.`;

    const isHold = classification.action === 'hold' || classification.confidence < MIN_CONFIDENCE_TO_ACT;
    const pair = this.selectPair(inputMetrics);

    let rationale = classification.rationale;
    if (classification.confidence < MIN_CONFIDENCE_TO_ACT && classification.action !== 'hold') {
      rationale = `Confidence ${classification.confidence} below threshold ${MIN_CONFIDENCE_TO_ACT}. Overridden to hold. Original: ${rationale}`.slice(0, 200);
    }

    const finalAction: ActionRecommendation = {
      action: isHold ? 'hold' : classification.action,
      pair,
      confidence: classification.confidence,
      positionSizeUSD: isHold ? null : BASE_POSITION_SIZE_USD * regimeParameters.positionSizeMultiplier,
      leverageMultiplier: isHold ? null : regimeParameters.maxLeverage,
      tpPercentage: isHold ? null : regimeParameters.tpPercentage,
      slPercentage: isHold ? null : regimeParameters.slPercentage,
      rationale,
    };

    const modelCalls = buildModelCalls([sentimentResult, extractionResult, classificationResult]);

    return {
      graphId: crypto.randomUUID(),
      createdAt: Date.now(),
      regime,
      inputMetrics,
      modelCalls,
      aggregationLogic,
      finalAction,
      executionResult: null,
    };
  }

  private getDominantDirection(extraction: GPT4oExtractionOutput): string {
    if (extraction.features.length === 0) return 'neutral';
    const counts = { bullish: 0, bearish: 0, neutral: 0 };
    for (const f of extraction.features) counts[f.direction] += f.weight;
    if (counts.bullish >= counts.bearish && counts.bullish >= counts.neutral) return 'bullish';
    if (counts.bearish >= counts.bullish && counts.bearish >= counts.neutral) return 'bearish';
    return 'neutral';
  }

  private selectPair(metrics: AggregateMetrics): string {
    let maxImbalance = 0;
    let selectedPair = 'BTC/USDT';
    for (const [pair, data] of Object.entries(metrics.myxMetrics)) {
      const abs = Math.abs(data.crowdScore);
      if (abs > maxImbalance) {
        maxImbalance = abs;
        selectedPair = pair;
      }
    }
    return selectedPair;
  }
}
