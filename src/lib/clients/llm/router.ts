import {
  NARRATIVE_MODEL_ID,
  NARRATIVE_FALLBACK_MODEL_ID,
  NARRATIVE_DGRID_PRIMARY,
  NARRATIVE_DGRID_FALLBACK,
  QUANT_MODEL_ID,
  QUANT_DGRID_PRIMARY,
  QUANT_DGRID_FALLBACK,
  RISK_PRIMARY_MODEL,
  RISK_FALLBACK_MODEL,
  RISK_LAST_RESORT_MODEL,
  MODEL_RETRY_DELAY_MS,
} from '@/config/cognition';
import {
  PREFER_BYOK_ROUTING,
  DISABLE_DGRID_ROUTING,
  ENABLE_BYOK_ROUTING,
} from '@/config/features';
import { callClaudeMessages } from './claudeClient';
import { callOpenAIChatCompletions } from './openaiClient';
import { callDGridMessages, callDGridChatCompletions } from './dgridClient';
import type { LLMCallResult, LLMCallParams } from './claudeClient';
import type {
  EndpointFormat,
  ModelCallRecord,
  RoutingDecision,
} from '@/types/cognition';

export type CommitteeMember = 'narrative' | 'quant' | 'risk';

export interface RouterCallParams {
  member: CommitteeMember;
  systemPrompt: string;
  userContent: string;
}

export interface RouterCallResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  modelId: string;
  endpointFormat: EndpointFormat;
  routingDecision: RoutingDecision;
  latencyMs: number;
  attempts: ModelCallRecord[];
}

interface CandidateStep {
  modelId: string;
  endpointFormat: EndpointFormat;
  routingDecision: RoutingDecision;
  caller: (p: LLMCallParams) => Promise<LLMCallResult>;
  preflight: () => boolean;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeAttempt(
  step: CandidateStep,
  result: LLMCallResult,
  latencyMs: number,
  params: { systemPrompt: string; userContent: string },
): ModelCallRecord {
  return {
    modelId: step.modelId,
    endpointFormat: step.endpointFormat,
    routingDecision: step.routingDecision,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    latencyMs,
    systemPrompt: params.systemPrompt,
    userInput: params.userContent,
    rawOutput: result.text,
    parsedOutput: {},
    parseSuccess: true,
  };
}

function makeFailedAttempt(
  step: CandidateStep,
  error: unknown,
  latencyMs: number,
  params: { systemPrompt: string; userContent: string },
): ModelCallRecord {
  return {
    modelId: step.modelId,
    endpointFormat: step.endpointFormat,
    routingDecision: step.routingDecision,
    inputTokens: 0,
    outputTokens: 0,
    latencyMs,
    systemPrompt: params.systemPrompt,
    userInput: params.userContent,
    rawOutput: `ERROR: ${error instanceof Error ? error.message : String(error)}`,
    parsedOutput: {},
    parseSuccess: false,
  };
}

function envSet(name: string): boolean {
  return !!process.env[name];
}

function narrativeCandidates(): CandidateStep[] {
  const byok: CandidateStep = {
    modelId: NARRATIVE_MODEL_ID,
    endpointFormat: 'claude_native',
    routingDecision: 'direct',
    caller: (p) => callClaudeMessages(p),
    preflight: () => ENABLE_BYOK_ROUTING && envSet('ANTHROPIC_API_KEY'),
  };
  const dgridPrimary: CandidateStep = {
    modelId: NARRATIVE_DGRID_PRIMARY,
    endpointFormat: 'claude_native',
    routingDecision: 'dgrid_primary',
    caller: (p) => callDGridMessages(p),
    preflight: () => !DISABLE_DGRID_ROUTING && envSet('DGRID_API_KEY'),
  };
  const dgridFallback: CandidateStep = {
    modelId: NARRATIVE_DGRID_FALLBACK,
    endpointFormat: 'claude_native',
    routingDecision: 'dgrid_fallback',
    caller: (p) => callDGridMessages(p),
    preflight: () => !DISABLE_DGRID_ROUTING && envSet('DGRID_API_KEY'),
  };
  // Last-resort cross-family substitution: GPT-4o-mini via DGrid in OpenAI format.
  const lastResort: CandidateStep = {
    modelId: QUANT_DGRID_FALLBACK,
    endpointFormat: 'openai_compatible',
    routingDecision: 'dgrid_fallback',
    caller: (p) => callDGridChatCompletions(p),
    preflight: () => !DISABLE_DGRID_ROUTING && envSet('DGRID_API_KEY'),
  };
  return PREFER_BYOK_ROUTING
    ? [byok, dgridPrimary, dgridFallback, lastResort]
    : [dgridPrimary, byok, dgridFallback, lastResort];
}

function quantCandidates(): CandidateStep[] {
  const byok: CandidateStep = {
    modelId: QUANT_MODEL_ID,
    endpointFormat: 'openai_compatible',
    routingDecision: 'direct',
    caller: (p) => callOpenAIChatCompletions(p),
    preflight: () => ENABLE_BYOK_ROUTING && envSet('OPENAI_API_KEY'),
  };
  const dgridPrimary: CandidateStep = {
    modelId: QUANT_DGRID_PRIMARY,
    endpointFormat: 'openai_compatible',
    routingDecision: 'dgrid_primary',
    caller: (p) => callDGridChatCompletions(p),
    preflight: () => !DISABLE_DGRID_ROUTING && envSet('DGRID_API_KEY'),
  };
  const dgridFallback: CandidateStep = {
    modelId: QUANT_DGRID_FALLBACK,
    endpointFormat: 'openai_compatible',
    routingDecision: 'dgrid_fallback',
    caller: (p) => callDGridChatCompletions(p),
    preflight: () => !DISABLE_DGRID_ROUTING && envSet('DGRID_API_KEY'),
  };
  const lastResort: CandidateStep = {
    modelId: NARRATIVE_FALLBACK_MODEL_ID,
    endpointFormat: 'claude_native',
    routingDecision: 'dgrid_fallback',
    caller: (p) => callDGridMessages(p),
    preflight: () => !DISABLE_DGRID_ROUTING && envSet('DGRID_API_KEY'),
  };
  return PREFER_BYOK_ROUTING
    ? [byok, dgridPrimary, dgridFallback, lastResort]
    : [dgridPrimary, byok, dgridFallback, lastResort];
}

function riskCandidates(): CandidateStep[] {
  const primary: CandidateStep = {
    modelId: RISK_PRIMARY_MODEL,
    endpointFormat: 'openai_compatible',
    routingDecision: 'dgrid_primary',
    caller: (p) => callDGridChatCompletions(p),
    preflight: () => !DISABLE_DGRID_ROUTING && envSet('DGRID_API_KEY'),
  };
  const fallback: CandidateStep = {
    modelId: RISK_FALLBACK_MODEL,
    endpointFormat: 'openai_compatible',
    routingDecision: 'dgrid_fallback',
    caller: (p) => callDGridChatCompletions(p),
    preflight: () => !DISABLE_DGRID_ROUTING && envSet('DGRID_API_KEY'),
  };
  const lastResort: CandidateStep = {
    modelId: RISK_LAST_RESORT_MODEL,
    endpointFormat: 'openai_compatible',
    routingDecision: 'dgrid_fallback',
    caller: (p) => callDGridChatCompletions(p),
    preflight: () => !DISABLE_DGRID_ROUTING && envSet('DGRID_API_KEY'),
  };
  return [primary, fallback, lastResort];
}

function candidatesFor(member: CommitteeMember): CandidateStep[] {
  if (member === 'narrative') return narrativeCandidates();
  if (member === 'quant') return quantCandidates();
  return riskCandidates();
}

/**
 * Route an LLM call for a committee member through BYOK → DGrid → fallback substitution.
 *
 * Returns the first successful call plus an `attempts` array recording every
 * try (success or failure). Throws only when every candidate fails or no
 * candidate's preflight passes (no env keys present).
 */
export async function routeCommitteeCall(
  params: RouterCallParams,
): Promise<RouterCallResult> {
  const candidates = candidatesFor(params.member);
  const eligible = candidates.filter((c) => c.preflight());
  if (eligible.length === 0) {
    throw new Error(
      `No eligible LLM candidate for ${params.member} — set ANTHROPIC_API_KEY, OPENAI_API_KEY, or DGRID_API_KEY`,
    );
  }

  const attempts: ModelCallRecord[] = [];
  const startWall = Date.now();

  for (let i = 0; i < eligible.length; i++) {
    const step = eligible[i];
    const callStart = Date.now();
    try {
      const result = await step.caller({
        systemPrompt: params.systemPrompt,
        userContent: params.userContent,
        modelId: step.modelId,
      });
      attempts.push(makeAttempt(step, result, Date.now() - callStart, params));
      return {
        text: result.text,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        modelId: result.modelId,
        endpointFormat: step.endpointFormat,
        routingDecision: step.routingDecision,
        latencyMs: Date.now() - startWall,
        attempts,
      };
    } catch (err) {
      attempts.push(makeFailedAttempt(step, err, Date.now() - callStart, params));
      if (i < eligible.length - 1) {
        await delay(MODEL_RETRY_DELAY_MS);
      }
    }
  }

  throw new Error(
    `All ${eligible.length} LLM candidates failed for ${params.member} (last error in attempts[].rawOutput)`,
  );
}
