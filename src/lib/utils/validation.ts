import { z } from 'zod';
import type { ClaudeSentimentOutput, GPT4oExtractionOutput, LlamaClassificationOutput } from './prompts';

export const claudeSentimentSchema = z.object({
  narrativeSummary: z.string(),
  sentimentScore: z.coerce.number().min(-1).max(1),
  confidenceLevel: z.coerce.number().min(0).max(1),
  flaggedPatterns: z.array(z.string()),
}) satisfies z.ZodType<ClaudeSentimentOutput>;

export const gpt4oExtractionSchema = z.object({
  features: z.array(
    z.object({
      name: z.string(),
      value: z.union([z.string(), z.number(), z.null()]),
      direction: z.enum(['bullish', 'bearish', 'neutral']),
      weight: z.coerce.number().min(0).max(1),
    })
  ),
}) satisfies z.ZodType<GPT4oExtractionOutput>;

// rationale is clipped to 400 chars via transform — models (especially DeepSeek) routinely
// overshoot the prompt's stated limit; clipping is strictly better than parse-fail which
// silently drops the decision to `hold` and kills the trade.
export const llamaClassificationSchema = z.object({
  action: z.enum(['open_long', 'open_short', 'close_position', 'adjust_parameters', 'hold']),
  confidence: z.coerce.number().min(0).max(1),
  rationale: z.string().min(1).transform((s) => s.trim().slice(0, 400)),
}) satisfies z.ZodType<LlamaClassificationOutput>;

function extractJsonCandidate(raw: string): string {
  const fenced = raw.trim();
  let jsonStr = fenced;
  if (jsonStr.startsWith('```json')) {
    jsonStr = jsonStr.slice(7);
  } else if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.slice(3);
  }
  if (jsonStr.endsWith('```')) {
    jsonStr = jsonStr.slice(0, -3);
  }
  jsonStr = jsonStr.trim();

  if (jsonStr.startsWith('{') || jsonStr.startsWith('[')) {
    return jsonStr;
  }

  const firstBrace = jsonStr.indexOf('{');
  const lastBrace = jsonStr.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return jsonStr.slice(firstBrace, lastBrace + 1);
  }

  const firstBracket = jsonStr.indexOf('[');
  const lastBracket = jsonStr.lastIndexOf(']');
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    return jsonStr.slice(firstBracket, lastBracket + 1);
  }

  return jsonStr;
}

export function parseModelOutput<T>(
  raw: string,
  schema: z.ZodType<T>,
  modelId: string
): T {
  const jsonStr = extractJsonCandidate(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(
      `[${modelId}] Failed to parse JSON: ${raw.slice(0, 500)}`
    );
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(
      `[${modelId}] Schema validation failed: ${issues}. Raw: ${raw.slice(0, 500)}`
    );
  }

  return result.data;
}
