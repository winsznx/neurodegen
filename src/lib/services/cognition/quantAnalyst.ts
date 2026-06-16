import { z } from 'zod';
import { buildQuantUserContent, QUANT_SYSTEM_PROMPT } from '@/lib/utils/prompts';
import { routeCommitteeCall, type RouterCallResult } from '@/lib/clients/llm/router';
import type { AggregateMetrics } from '@/types/perception';
import type { ModelCallRecord, QuantAnalystOutput } from '@/types/cognition';

const Direction = z.union([z.literal('bullish'), z.literal('bearish'), z.literal('neutral')]);

const QuantSchema: z.ZodType<QuantAnalystOutput> = z
  .object({
    features: z.array(
      z.object({
        name: z.string(),
        value: z.union([z.number(), z.string()]),
        direction: Direction,
        weight: z.number(),
      }),
    ),
    dominantDirection: Direction,
    liquidityAdequate: z.boolean(),
    fundingRateWarning: z.boolean(),
    recommendedToken: z.union([z.string(), z.null()]),
  })
  .strip();

function extractJson(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) return trimmed;
  const match = trimmed.match(/\{[\s\S]*\}/);
  return match ? match[0] : trimmed;
}

function safeParse(raw: string, modelId: string): QuantAnalystOutput {
  try {
    const json = JSON.parse(extractJson(raw)) as unknown;
    return QuantSchema.parse(json);
  } catch (err) {
    return {
      features: [
        {
          name: 'PARSE_ERROR',
          value: `${modelId}: ${err instanceof Error ? err.message.slice(0, 80) : 'unknown'}`,
          direction: 'neutral',
          weight: 0,
        },
      ],
      dominantDirection: 'neutral',
      liquidityAdequate: false,
      fundingRateWarning: false,
      recommendedToken: null,
    };
  }
}

export interface QuantAnalystResult {
  parsed: QuantAnalystOutput;
  call: ModelCallRecord;
  attempts: ModelCallRecord[];
}

export async function runQuantAnalyst(metrics: AggregateMetrics): Promise<QuantAnalystResult> {
  const userContent = buildQuantUserContent(metrics);
  const routed: RouterCallResult = await routeCommitteeCall({
    member: 'quant',
    systemPrompt: QUANT_SYSTEM_PROMPT,
    userContent,
  });
  const parsed = safeParse(routed.text, routed.modelId);
  const head = routed.attempts.find((a) => a.parseSuccess) ?? routed.attempts[routed.attempts.length - 1];
  const call: ModelCallRecord = {
    ...head,
    parsedOutput: parsed as unknown as Record<string, unknown>,
    parseSuccess: parsed.features.some((f) => f.name === 'PARSE_ERROR') ? false : head.parseSuccess,
  };
  return { parsed, call, attempts: routed.attempts };
}
