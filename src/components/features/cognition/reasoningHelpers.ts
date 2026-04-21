import type { ModelCall } from '@/types/cognition';
import type {
  ClaudeSentimentOutput,
  GPT4oExtractionOutput,
  LlamaClassificationOutput,
} from '@/lib/utils/prompts';

export type ReasoningTask = 'sentiment' | 'extraction' | 'classification' | 'unknown';

export function detectTask(modelId: string): ReasoningTask {
  const id = modelId.toLowerCase();
  if (id.includes('claude') || id.includes('anthropic')) return 'sentiment';
  if (id.includes('gpt') || id.includes('4o') || id.includes('openai')) return 'extraction';
  if (
    id.includes('deepseek') ||
    id.includes('llama') ||
    id.includes('groq') ||
    id.includes('mistral') ||
    id.includes('qwen')
  ) return 'classification';
  return 'unknown';
}

export function taskLabel(task: ReasoningTask): string {
  switch (task) {
    case 'sentiment': return 'sentiment analysis';
    case 'extraction': return 'feature extraction';
    case 'classification': return 'decision';
    case 'unknown': return 'model call';
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function castSentiment(call: ModelCall): ClaudeSentimentOutput | null {
  if (!call.parseSuccess || !isPlainObject(call.parsedOutput)) return null;
  const p = call.parsedOutput;
  if (
    typeof p.narrativeSummary !== 'string' ||
    typeof p.sentimentScore !== 'number' ||
    typeof p.confidenceLevel !== 'number'
  ) return null;
  return {
    narrativeSummary: p.narrativeSummary,
    sentimentScore: clamp(p.sentimentScore, -1, 1),
    confidenceLevel: clamp(p.confidenceLevel, 0, 1),
    flaggedPatterns: Array.isArray(p.flaggedPatterns)
      ? p.flaggedPatterns.filter((x): x is string => typeof x === 'string')
      : [],
  };
}

export function castExtraction(call: ModelCall): GPT4oExtractionOutput | null {
  if (!call.parseSuccess || !isPlainObject(call.parsedOutput)) return null;
  const p = call.parsedOutput;
  if (!Array.isArray(p.features)) return null;
  const features: GPT4oExtractionOutput['features'] = [];
  for (const f of p.features) {
    if (!isPlainObject(f)) continue;
    const name = typeof f.name === 'string' ? f.name : null;
    const value = typeof f.value === 'string' || typeof f.value === 'number' ? f.value : null;
    const direction = f.direction === 'bullish' || f.direction === 'bearish' || f.direction === 'neutral' ? f.direction : null;
    const weight = typeof f.weight === 'number' ? clamp(f.weight, 0, 1) : null;
    if (name === null || value === null || direction === null || weight === null) continue;
    features.push({ name, value, direction, weight });
  }
  return { features };
}

export function castClassification(call: ModelCall): LlamaClassificationOutput | null {
  if (!call.parseSuccess || !isPlainObject(call.parsedOutput)) return null;
  const p = call.parsedOutput;
  const validActions: LlamaClassificationOutput['action'][] = [
    'open_long', 'open_short', 'close_position', 'adjust_parameters', 'hold',
  ];
  if (
    typeof p.action !== 'string' ||
    !validActions.includes(p.action as LlamaClassificationOutput['action']) ||
    typeof p.confidence !== 'number' ||
    typeof p.rationale !== 'string'
  ) return null;
  return {
    action: p.action as LlamaClassificationOutput['action'],
    confidence: clamp(p.confidence, 0, 1),
    rationale: p.rationale,
  };
}

export function sentimentLabel(score: number): { label: string; tone: 'green' | 'red' | 'yellow' | 'neutral' } {
  if (score >= 0.5) return { label: 'greed', tone: 'green' };
  if (score >= 0.1) return { label: 'bullish', tone: 'green' };
  if (score > -0.1) return { label: 'neutral', tone: 'neutral' };
  if (score > -0.5) return { label: 'bearish', tone: 'red' };
  return { label: 'fear', tone: 'red' };
}

function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}
