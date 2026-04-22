import type { AggregateMetrics } from '@/types/perception';
import type { RegimeLabel, ReasoningGraph, ModelCall, ActionRecommendation } from '@/types/cognition';
import type { ClaudeSentimentOutput, GPT4oExtractionOutput, LlamaClassificationOutput } from '@/lib/utils/prompts';
import type { ModelCallAttempt } from './fallbackHandler';
import type { RegimeParameters } from './regimeClassifier';
import { BASE_POSITION_SIZE_USD, MIN_CONFIDENCE_TO_ACT, MIN_POSITION_SIZE_USD } from '@/config';

interface ModelResult<T> {
  parsed: T;
  attempts: ModelCallAttempt[];
  systemPrompt: string;
  userContent: string;
}

interface DirectionalTotals {
  bullish: number;
  bearish: number;
  neutral: number;
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
    const directionalTotals = this.getDirectionalTotals(extraction);

    const probeOverride = this.deriveProbeOverride(
      sentiment,
      extraction,
      classification,
      directionalTotals,
      regime
    );
    const effectiveClassification = probeOverride ?? classification;
    const dominantDirection = this.getDominantDirection(extraction);
    const aggregationLogic =
      `Claude sentiment (score: ${sentiment.sentimentScore}, confidence: ${sentiment.confidenceLevel})` +
      ` + GPT-4o features (${extraction.features.length} features, dominant direction: ${dominantDirection})` +
      ` + Llama classification (action: ${classification.action}, confidence: ${classification.confidence}).` +
      (probeOverride
        ? ` Probe override applied -> ${probeOverride.action} at ${probeOverride.confidence} confidence.`
        : '') +
      ` Regime: ${regime} with multiplier ${regimeParameters.positionSizeMultiplier}.`;
    const isHold = effectiveClassification.action === 'hold' || effectiveClassification.confidence < MIN_CONFIDENCE_TO_ACT;
    const pair = this.selectPair(inputMetrics);

    let rationale = effectiveClassification.rationale;
    if (effectiveClassification.confidence < MIN_CONFIDENCE_TO_ACT && effectiveClassification.action !== 'hold') {
      rationale = `Confidence ${effectiveClassification.confidence} below threshold ${MIN_CONFIDENCE_TO_ACT}. Overridden to hold. Original: ${rationale}`.slice(0, 200);
    }

    const finalAction: ActionRecommendation = {
      action: isHold ? 'hold' : effectiveClassification.action,
      pair,
      confidence: effectiveClassification.confidence,
      positionSizeUSD: isHold
        ? null
        : probeOverride
          ? MIN_POSITION_SIZE_USD
          : BASE_POSITION_SIZE_USD * regimeParameters.positionSizeMultiplier,
      leverageMultiplier: isHold
        ? null
        : probeOverride
          ? Math.min(3, regimeParameters.maxLeverage)
          : regimeParameters.maxLeverage,
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
    const counts = this.getDirectionalTotals(extraction);
    if (counts.bullish >= counts.bearish && counts.bullish >= counts.neutral) return 'bullish';
    if (counts.bearish >= counts.bullish && counts.bearish >= counts.neutral) return 'bearish';
    return 'neutral';
  }

  private getDirectionalTotals(extraction: GPT4oExtractionOutput): DirectionalTotals {
    const totals: DirectionalTotals = { bullish: 0, bearish: 0, neutral: 0 };
    for (const feature of extraction.features) {
      totals[feature.direction] += feature.weight;
    }
    return totals;
  }

  private deriveProbeOverride(
    sentiment: ClaudeSentimentOutput,
    extraction: GPT4oExtractionOutput,
    classification: LlamaClassificationOutput,
    directionalTotals: DirectionalTotals,
    regime: RegimeLabel
  ): LlamaClassificationOutput | null {
    if (classification.action !== 'hold') return null;
    if (regime === 'volatile') return null;
    if (extraction.features.length < 4) return null;

    const bullishEdge = directionalTotals.bullish - directionalTotals.bearish;
    const bearishEdge = directionalTotals.bearish - directionalTotals.bullish;
    const positiveSentiment = sentiment.sentimentScore >= 0.5 && sentiment.confidenceLevel >= 0.65;
    const negativeSentiment = sentiment.sentimentScore <= -0.5 && sentiment.confidenceLevel >= 0.65;
    const bullishProbeFallback =
      sentiment.sentimentScore >= 0.2 &&
      sentiment.confidenceLevel >= 0.8 &&
      bullishEdge >= 2.0 &&
      directionalTotals.bearish <= 0.25;
    const bearishProbeFallback =
      sentiment.sentimentScore <= -0.2 &&
      sentiment.confidenceLevel >= 0.8 &&
      bearishEdge >= 2.0 &&
      directionalTotals.bullish <= 0.25;

    if (positiveSentiment && bullishEdge >= 1.25) {
      return {
        action: 'open_long',
        confidence: Math.max(classification.confidence, 0.35),
        rationale:
          `Probe long override: bullish features ${directionalTotals.bullish.toFixed(2)} vs bearish ${directionalTotals.bearish.toFixed(2)} with sentiment ${sentiment.sentimentScore.toFixed(2)} (${sentiment.confidenceLevel.toFixed(2)} conf).`.slice(0, 400),
      };
    }

    if (bullishProbeFallback) {
      return {
        action: 'open_long',
        confidence: Math.max(classification.confidence, 0.28),
        rationale:
          `Fallback probe long: feature edge ${bullishEdge.toFixed(2)} stayed strongly bullish despite cautious classifier hold; sentiment remained positive at ${sentiment.sentimentScore.toFixed(2)} with ${sentiment.confidenceLevel.toFixed(2)} confidence.`.slice(0, 400),
      };
    }

    if (negativeSentiment && bearishEdge >= 1.25) {
      return {
        action: 'open_short',
        confidence: Math.max(classification.confidence, 0.35),
        rationale:
          `Probe short override: bearish features ${directionalTotals.bearish.toFixed(2)} vs bullish ${directionalTotals.bullish.toFixed(2)} with sentiment ${sentiment.sentimentScore.toFixed(2)} (${sentiment.confidenceLevel.toFixed(2)} conf).`.slice(0, 400),
      };
    }

    if (bearishProbeFallback) {
      return {
        action: 'open_short',
        confidence: Math.max(classification.confidence, 0.28),
        rationale:
          `Fallback probe short: feature edge ${bearishEdge.toFixed(2)} stayed strongly bearish despite cautious classifier hold; sentiment remained negative at ${sentiment.sentimentScore.toFixed(2)} with ${sentiment.confidenceLevel.toFixed(2)} confidence.`.slice(0, 400),
      };
    }

    return null;
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
