import { z } from 'zod';
import { buildRiskUserContent, RISK_SYSTEM_PROMPT } from '@/lib/utils/prompts';
import { routeCommitteeCall, type RouterCallResult } from '@/lib/clients/llm/router';
import type {
  DissentResult,
  ModelCallRecord,
  NarrativeAnalystOutput,
  QuantAnalystOutput,
  RiskClassifierOutput,
} from '@/types/cognition';
import type { RegimeLabel } from '@/types/perception';
import { MIN_CONFIDENCE_TO_ACT } from '@/config/cognition';

const Action = z.union([
  z.literal('open_long'),
  z.literal('close_position'),
  z.literal('adjust_parameters'),
  z.literal('hold'),
]);

const RiskSchema: z.ZodType<RiskClassifierOutput> = z
  .object({
    action: Action,
    targetToken: z.union([z.string(), z.null()]),
    confidence: z.number(),
    rationale: z.string().max(400),
    dissentAcknowledged: z.boolean(),
  })
  .strip();

function extractJson(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) return trimmed;
  const match = trimmed.match(/\{[\s\S]*\}/);
  return match ? match[0] : trimmed;
}

function safeParse(raw: string, modelId: string): RiskClassifierOutput {
  try {
    const json = JSON.parse(extractJson(raw)) as unknown;
    return RiskSchema.parse(json);
  } catch (err) {
    return {
      action: 'hold',
      targetToken: null,
      confidence: 0,
      rationale: `parse_error_from_${modelId}: ${err instanceof Error ? err.message.slice(0, 120) : 'unknown'}`,
      dissentAcknowledged: false,
    };
  }
}

/**
 * Apply hard-coded post-parse safety: confidence floor + dissent forcing + liquidity gate.
 * This is enforced regardless of what the model says, so a misbehaving model cannot trade
 * past our boundary.
 */
function enforceSafetyRails(
  parsed: RiskClassifierOutput,
  dissent: DissentResult,
  quant: QuantAnalystOutput,
  allowedTokenSet: Set<string>,
): RiskClassifierOutput {
  let action = parsed.action;
  let targetToken = parsed.targetToken;
  let rationale = parsed.rationale;
  const overrides: string[] = [];

  if (parsed.confidence < MIN_CONFIDENCE_TO_ACT && action !== 'hold') {
    overrides.push(`confidence ${parsed.confidence.toFixed(2)} < ${MIN_CONFIDENCE_TO_ACT}`);
    action = 'hold';
  }
  if (dissent.dissentSeverity === 'strong' && action !== 'hold') {
    overrides.push('strong dissent');
    action = 'hold';
  }
  if (!quant.liquidityAdequate && action !== 'hold') {
    overrides.push('liquidity inadequate');
    action = 'hold';
  }
  if (action !== 'hold' && targetToken && !allowedTokenSet.has(targetToken.toUpperCase())) {
    overrides.push(`token ${targetToken} not in allowlist`);
    action = 'hold';
    targetToken = null;
  }

  if (overrides.length > 0) {
    rationale = `[overridden: ${overrides.join('; ')}] ${rationale}`.slice(0, 400);
  }

  return {
    action,
    targetToken,
    confidence: parsed.confidence,
    rationale,
    dissentAcknowledged: dissent.dissentDetected
      ? true
      : parsed.dissentAcknowledged,
  };
}

export interface RiskClassifierResult {
  parsed: RiskClassifierOutput;
  call: ModelCallRecord;
  attempts: ModelCallRecord[];
}

export async function runRiskClassifier(args: {
  narrative: NarrativeAnalystOutput;
  quant: QuantAnalystOutput;
  dissent: DissentResult;
  regime: RegimeLabel;
  allowedTokenSymbols: string[];
  mandateRiskLevel: 'conservative' | 'moderate' | 'aggressive';
}): Promise<RiskClassifierResult> {
  const userContent = buildRiskUserContent(args);
  const routed: RouterCallResult = await routeCommitteeCall({
    member: 'risk',
    systemPrompt: RISK_SYSTEM_PROMPT,
    userContent,
  });
  const allowed = new Set(args.allowedTokenSymbols.map((s) => s.toUpperCase()));
  const parsed = enforceSafetyRails(
    safeParse(routed.text, routed.modelId),
    args.dissent,
    args.quant,
    allowed,
  );
  const head = routed.attempts.find((a) => a.parseSuccess) ?? routed.attempts[routed.attempts.length - 1];
  const call: ModelCallRecord = {
    ...head,
    parsedOutput: parsed as unknown as Record<string, unknown>,
    parseSuccess: head.parseSuccess,
  };
  return { parsed, call, attempts: routed.attempts };
}
