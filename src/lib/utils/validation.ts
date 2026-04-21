import { z } from 'zod';
import type { ClaudeSentimentOutput, GPT4oExtractionOutput, LlamaClassificationOutput } from './prompts';

export const claudeSentimentSchema = z.object({
  narrativeSummary: z.string(),
  sentimentScore: z.number().min(-1).max(1),
  confidenceLevel: z.number().min(0).max(1),
  flaggedPatterns: z.array(z.string()),
}) satisfies z.ZodType<ClaudeSentimentOutput>;

export const gpt4oExtractionSchema = z.object({
  features: z.array(
    z.object({
      name: z.string(),
      value: z.union([z.string(), z.number(), z.null()]),
      direction: z.enum(['bullish', 'bearish', 'neutral']),
      weight: z.number().min(0).max(1),
    })
  ),
}) satisfies z.ZodType<GPT4oExtractionOutput>;

// rationale is clipped to 400 chars via transform — models (especially DeepSeek) routinely
// overshoot the prompt's stated limit; clipping is strictly better than parse-fail which
// silently drops the decision to `hold` and kills the trade.
export const llamaClassificationSchema = z.object({
  action: z.enum(['open_long', 'open_short', 'close_position', 'adjust_parameters', 'hold']),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1).transform((s) => s.trim().slice(0, 400)),
}) satisfies z.ZodType<LlamaClassificationOutput>;

export function parseModelOutput<T>(
  raw: string,
  schema: z.ZodType<T>,
  modelId: string
): T {
  let jsonStr = raw.trim();
  if (jsonStr.startsWith('```json')) {
    jsonStr = jsonStr.slice(7);
  } else if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.slice(3);
  }
  if (jsonStr.endsWith('```')) {
    jsonStr = jsonStr.slice(0, -3);
  }
  jsonStr = jsonStr.trim();

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
