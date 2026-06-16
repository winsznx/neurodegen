import { z } from 'zod';
import { buildNarrativeUserContent, NARRATIVE_SYSTEM_PROMPT } from '@/lib/utils/prompts';
import { routeCommitteeCall, type RouterCallResult } from '@/lib/clients/llm/router';
import type { AggregateMetrics } from '@/types/perception';
import type { ModelCallRecord, NarrativeAnalystOutput } from '@/types/cognition';

const NarrativeSchema: z.ZodType<NarrativeAnalystOutput> = z
  .object({
    narrativeSummary: z.string().max(500),
    kolMentionedTokens: z.array(z.string()),
    sentimentScore: z.number(),
    confidenceLevel: z.number(),
    direction: z.union([z.literal('bullish'), z.literal('bearish'), z.literal('neutral')]),
    flaggedAnomalies: z.array(z.string()),
    topThesisToken: z.union([z.string(), z.null()]),
  })
  .strip();

function extractJson(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) return trimmed;
  const match = trimmed.match(/\{[\s\S]*\}/);
  return match ? match[0] : trimmed;
}

function safeParse(raw: string, modelId: string): NarrativeAnalystOutput {
  try {
    const json = JSON.parse(extractJson(raw)) as unknown;
    return NarrativeSchema.parse(json);
  } catch (err) {
    return {
      narrativeSummary: `parse_error_from_${modelId}: ${err instanceof Error ? err.message.slice(0, 100) : 'unknown'}`,
      kolMentionedTokens: [],
      sentimentScore: 0,
      confidenceLevel: 0,
      direction: 'neutral',
      flaggedAnomalies: ['NARRATIVE_PARSE_FAILED'],
      topThesisToken: null,
    };
  }
}

export interface NarrativeAnalystResult {
  parsed: NarrativeAnalystOutput;
  call: ModelCallRecord;
  attempts: ModelCallRecord[];
}

export async function runNarrativeAnalyst(
  metrics: AggregateMetrics,
): Promise<NarrativeAnalystResult> {
  const userContent = buildNarrativeUserContent(metrics);
  const routed: RouterCallResult = await routeCommitteeCall({
    member: 'narrative',
    systemPrompt: NARRATIVE_SYSTEM_PROMPT,
    userContent,
  });
  const parsed = safeParse(routed.text, routed.modelId);
  const head = routed.attempts.find((a) => a.parseSuccess) ?? routed.attempts[routed.attempts.length - 1];
  const call: ModelCallRecord = {
    ...head,
    parsedOutput: parsed as unknown as Record<string, unknown>,
    parseSuccess: parsed.flaggedAnomalies.includes('NARRATIVE_PARSE_FAILED') ? false : head.parseSuccess,
  };
  return { parsed, call, attempts: routed.attempts };
}
