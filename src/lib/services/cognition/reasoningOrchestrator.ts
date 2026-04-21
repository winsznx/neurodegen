import type { LaunchEvent, PurchaseEvent, AggregateMetrics, MarketSnapshot } from '@/types/perception';
import type { ReasoningGraph } from '@/types/cognition';
import {
  buildClaudeSentimentPrompt,
  buildGPT4oExtractionPrompt,
  buildLlamaClassificationPrompt,
  type ClaudeSentimentOutput,
  type GPT4oExtractionOutput,
  type LlamaClassificationOutput,
} from '@/lib/utils/prompts';
import {
  parseModelOutput,
  claudeSentimentSchema,
  gpt4oExtractionSchema,
  llamaClassificationSchema,
} from '@/lib/utils/validation';
import { insertReasoningChain } from '@/lib/queries/reasoningChains';
import type { FallbackHandler } from './fallbackHandler';
import type { RegimeClassifier } from './regimeClassifier';
import type { ReasoningGraphBuilder } from './reasoningGraphBuilder';

export class ReasoningOrchestrator {
  constructor(
    private fallbackHandler: FallbackHandler,
    private regimeClassifier: RegimeClassifier,
    private graphBuilder: ReasoningGraphBuilder
  ) {}

  async runCycle(
    recentLaunches: LaunchEvent[],
    recentPurchases: PurchaseEvent[],
    metrics: AggregateMetrics,
    recentSnapshots: MarketSnapshot[]
  ): Promise<ReasoningGraph> {
    const { regime, parameters: regimeParameters } = this.regimeClassifier.classify(metrics);

    const sentimentPrompt = buildClaudeSentimentPrompt(recentLaunches, recentPurchases, metrics);
    const extractionPrompt = buildGPT4oExtractionPrompt(metrics, recentSnapshots);

    const [sentimentRaw, extractionRaw] = await Promise.all([
      this.fallbackHandler.callWithFallback('sentiment', sentimentPrompt.systemPrompt, sentimentPrompt.userContent),
      this.fallbackHandler.callWithFallback('extraction', extractionPrompt.systemPrompt, extractionPrompt.userContent),
    ]);

    const sentimentParsed = this.safeParse<ClaudeSentimentOutput>(
      sentimentRaw.responseText, claudeSentimentSchema, sentimentRaw.finalModelId,
      { narrativeSummary: '', sentimentScore: 0, confidenceLevel: 0, flaggedPatterns: ['SENTIMENT_PARSE_FAILED'] }
    );

    const extractionParsed = this.safeParse<GPT4oExtractionOutput>(
      extractionRaw.responseText, gpt4oExtractionSchema, extractionRaw.finalModelId,
      { features: [] }
    );

    const classificationPrompt = buildLlamaClassificationPrompt(sentimentParsed, extractionParsed, regime);
    const classificationRaw = await this.fallbackHandler.callWithFallback(
      'classification', classificationPrompt.systemPrompt, classificationPrompt.userContent
    );

    const classificationParsed = this.safeParse<LlamaClassificationOutput>(
      classificationRaw.responseText, llamaClassificationSchema, classificationRaw.finalModelId,
      { action: 'hold', confidence: 0, rationale: 'CLASSIFICATION_PARSE_FAILED' }
    );

    const graph = this.graphBuilder.build(
      regime, metrics,
      { parsed: sentimentParsed, attempts: sentimentRaw.attempts, systemPrompt: sentimentPrompt.systemPrompt, userContent: sentimentPrompt.userContent },
      { parsed: extractionParsed, attempts: extractionRaw.attempts, systemPrompt: extractionPrompt.systemPrompt, userContent: extractionPrompt.userContent },
      { parsed: classificationParsed, attempts: classificationRaw.attempts, systemPrompt: classificationPrompt.systemPrompt, userContent: classificationPrompt.userContent },
      regimeParameters
    );

    await insertReasoningChain(graph);
    return graph;
  }

  private safeParse<T>(
    raw: string,
    schema: import('zod').ZodType<T>,
    modelId: string,
    fallback: T
  ): T {
    try {
      return parseModelOutput(raw, schema, modelId);
    } catch (err) {
      console.error(`[reasoning-orchestrator] Parse failed for ${modelId}:`, err instanceof Error ? err.message : String(err));
      return fallback;
    }
  }
}
