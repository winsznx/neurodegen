import { callClaudeNative } from '@/lib/clients/dgrid/claude';
import { callOpenAICompatible, createDGridOpenAIClient, createByokOpenAIClient } from '@/lib/clients/dgrid/openai';
import { callClaudeAnthropicDirect } from '@/lib/clients/byok/anthropicDirect';
import {
  CLAUDE_MODEL_ID,
  CLAUDE_FALLBACK_MODEL_ID,
  CLAUDE_DIRECT_MODEL_ID,
  GPT4O_MODEL_ID,
  GPT4O_FALLBACK_MODEL_ID,
  GPT4O_DIRECT_MODEL_ID,
  LLAMA_MODEL_ID,
  LLAMA_FALLBACK_MODEL_ID,
  MODEL_CALL_TIMEOUT_MS,
  MODEL_RETRY_DELAY_MS,
} from '@/config/cognition';
import { DISABLE_DGRID_ROUTING, ENABLE_BYOK_ROUTING, PREFER_BYOK_ROUTING } from '@/config/features';

export interface ModelCallAttempt {
  modelId: string;
  endpointFormat: 'claude_native' | 'openai_compatible' | 'gemini_native';
  routingDecision: 'dgrid' | 'byok';
  success: boolean;
  error?: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  responseText: string;
}

interface FallbackResult {
  responseText: string;
  attempts: ModelCallAttempt[];
  finalModelId: string;
  finalEndpointFormat: string;
  finalRoutingDecision: string;
  latencyMs: number;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
    ),
  ]);
}

async function tryCall(
  fn: () => Promise<{ text: string; inputTokens: number; outputTokens: number }>,
  modelId: string,
  endpointFormat: ModelCallAttempt['endpointFormat'],
  routingDecision: ModelCallAttempt['routingDecision']
): Promise<ModelCallAttempt> {
  const start = Date.now();
  try {
    const result = await withTimeout(fn(), MODEL_CALL_TIMEOUT_MS);
    return {
      modelId, endpointFormat, routingDecision, success: true,
      latencyMs: Date.now() - start, inputTokens: result.inputTokens,
      outputTokens: result.outputTokens, responseText: result.text,
    };
  } catch (err) {
    return {
      modelId, endpointFormat, routingDecision, success: false,
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - start, inputTokens: 0, outputTokens: 0, responseText: '',
    };
  }
}

function byokAllowed(envKey: string): boolean {
  if (!ENABLE_BYOK_ROUTING) return false;
  return !!process.env[envKey];
}

function dgridAllowed(): boolean {
  return !DISABLE_DGRID_ROUTING && !!process.env.DGRID_API_KEY;
}

function shouldStopDgrid(attempt: ModelCallAttempt | undefined): boolean {
  if (!attempt || attempt.routingDecision !== 'dgrid' || attempt.success) return false;
  const message = (attempt.error ?? '').toLowerCase();
  return (
    message.includes('status=402') ||
    message.includes('status=429') ||
    message.includes('payment required') ||
    message.includes('quota') ||
    message.includes('credit') ||
    message.includes('rate limit') ||
    message.includes('api key environment variable is not set')
  );
}

export class FallbackHandler {
  async callWithFallback(
    task: 'sentiment' | 'extraction' | 'classification',
    systemPrompt: string,
    userContent: string
  ): Promise<FallbackResult> {
    if (task === 'sentiment') return this.sentimentChain(systemPrompt, userContent);
    if (task === 'extraction') return this.extractionChain(systemPrompt, userContent);
    return this.classificationChain(systemPrompt, userContent);
  }

  private async runCandidate(
    attempts: ModelCallAttempt[],
    fn: () => Promise<{ text: string; inputTokens: number; outputTokens: number }>,
    modelId: string,
    endpointFormat: ModelCallAttempt['endpointFormat'],
    routingDecision: ModelCallAttempt['routingDecision']
  ): Promise<FallbackResult | null> {
    const a = await tryCall(fn, modelId, endpointFormat, routingDecision);
    attempts.push(a);
    return a.success ? this.result(a, attempts) : null;
  }

  private lastAttempt(attempts: ModelCallAttempt[]): ModelCallAttempt | undefined {
    return attempts[attempts.length - 1];
  }

  private async maybeRunDgridCandidate(
    attempts: ModelCallAttempt[],
    dgridState: { available: boolean },
    fn: () => Promise<{ text: string; inputTokens: number; outputTokens: number }>,
    modelId: string,
    endpointFormat: ModelCallAttempt['endpointFormat']
  ): Promise<FallbackResult | null> {
    if (!dgridState.available) return null;
    const result = await this.runCandidate(attempts, fn, modelId, endpointFormat, 'dgrid');
    if (result) return result;
    if (shouldStopDgrid(this.lastAttempt(attempts))) {
      dgridState.available = false;
    }
    return null;
  }

  private async sentimentChain(sp: string, uc: string): Promise<FallbackResult> {
    const attempts: ModelCallAttempt[] = [];
    const dgridState = { available: dgridAllowed() };

    if (PREFER_BYOK_ROUTING && byokAllowed('ANTHROPIC_API_KEY')) {
      const byok = await this.runCandidate(
        attempts,
        () => callClaudeAnthropicDirect(sp, uc, CLAUDE_DIRECT_MODEL_ID),
        CLAUDE_DIRECT_MODEL_ID,
        'claude_native',
        'byok'
      );
      if (byok) return byok;
    }

    const r1 = await this.maybeRunDgridCandidate(
      attempts,
      dgridState,
      () => callClaudeNative(sp, uc, CLAUDE_MODEL_ID),
      CLAUDE_MODEL_ID,
      'claude_native'
    );
    if (r1) return r1;

    if (dgridState.available) {
      await delay(MODEL_RETRY_DELAY_MS);
      const r2 = await this.maybeRunDgridCandidate(
        attempts,
        dgridState,
        () => callClaudeNative(sp, uc, CLAUDE_MODEL_ID),
        CLAUDE_MODEL_ID,
        'claude_native'
      );
      if (r2) return r2;
    }

    const r3 = await this.maybeRunDgridCandidate(
      attempts,
      dgridState,
      () => callClaudeNative(sp, uc, CLAUDE_FALLBACK_MODEL_ID),
      CLAUDE_FALLBACK_MODEL_ID,
      'claude_native'
    );
    if (r3) return r3;

    const r4 = await this.maybeRunDgridCandidate(
      attempts,
      dgridState,
      () => callOpenAICompatible(GPT4O_MODEL_ID, sp, uc, createDGridOpenAIClient()),
      GPT4O_MODEL_ID,
      'openai_compatible'
    );
    if (r4) return r4;

    if (byokAllowed('ANTHROPIC_API_KEY')) {
      const r5 = await this.runCandidate(attempts,
        () => callClaudeAnthropicDirect(sp, uc, CLAUDE_DIRECT_MODEL_ID),
        CLAUDE_DIRECT_MODEL_ID, 'claude_native', 'byok');
      if (r5) return r5;
    }

    const degraded = JSON.stringify({ narrativeSummary: '', sentimentScore: 0, confidenceLevel: 0, flaggedPatterns: ['SENTIMENT_MODEL_UNAVAILABLE'] });
    return this.degradedResult(CLAUDE_MODEL_ID, 'claude_native', degraded, attempts);
  }

  // Extraction: DGrid-first across multiple models + providers before BYOK.
  private async extractionChain(sp: string, uc: string): Promise<FallbackResult> {
    const attempts: ModelCallAttempt[] = [];
    const dgridState = { available: dgridAllowed() };

    if (PREFER_BYOK_ROUTING && byokAllowed('OPENAI_API_KEY')) {
      const byok = await this.runCandidate(
        attempts,
        () => callOpenAICompatible(GPT4O_DIRECT_MODEL_ID, sp, uc, createByokOpenAIClient()),
        GPT4O_DIRECT_MODEL_ID,
        'openai_compatible',
        'byok'
      );
      if (byok) return byok;
    }

    const r1 = await this.maybeRunDgridCandidate(
      attempts,
      dgridState,
      () => callOpenAICompatible(GPT4O_MODEL_ID, sp, uc, createDGridOpenAIClient()),
      GPT4O_MODEL_ID,
      'openai_compatible'
    );
    if (r1) return r1;

    if (dgridState.available) {
      await delay(MODEL_RETRY_DELAY_MS);
      const r2 = await this.maybeRunDgridCandidate(
        attempts,
        dgridState,
        () => callOpenAICompatible(GPT4O_MODEL_ID, sp, uc, createDGridOpenAIClient()),
        GPT4O_MODEL_ID,
        'openai_compatible'
      );
      if (r2) return r2;
    }

    const r3 = await this.maybeRunDgridCandidate(
      attempts,
      dgridState,
      () => callOpenAICompatible(GPT4O_FALLBACK_MODEL_ID, sp, uc, createDGridOpenAIClient()),
      GPT4O_FALLBACK_MODEL_ID,
      'openai_compatible'
    );
    if (r3) return r3;

    const r4 = await this.maybeRunDgridCandidate(
      attempts,
      dgridState,
      () => callOpenAICompatible(LLAMA_MODEL_ID, sp, uc, createDGridOpenAIClient()),
      LLAMA_MODEL_ID,
      'openai_compatible'
    );
    if (r4) return r4;

    if (byokAllowed('OPENAI_API_KEY')) {
      const r5 = await this.runCandidate(attempts,
        () => callOpenAICompatible(GPT4O_DIRECT_MODEL_ID, sp, uc, createByokOpenAIClient()),
        GPT4O_DIRECT_MODEL_ID, 'openai_compatible', 'byok');
      if (r5) return r5;
    }

    if (byokAllowed('ANTHROPIC_API_KEY')) {
      const r6 = await this.runCandidate(attempts,
        () => callClaudeAnthropicDirect(sp, uc, CLAUDE_DIRECT_MODEL_ID),
        CLAUDE_DIRECT_MODEL_ID, 'claude_native', 'byok');
      if (r6) return r6;
    }

    const degraded = JSON.stringify({ features: [] });
    return this.degradedResult(GPT4O_MODEL_ID, 'openai_compatible', degraded, attempts);
  }

  // Classification: DGrid-first across DeepSeek, Qwen, GPT-4o before BYOK.
  private async classificationChain(sp: string, uc: string): Promise<FallbackResult> {
    const attempts: ModelCallAttempt[] = [];
    const dgridState = { available: dgridAllowed() };

    if (PREFER_BYOK_ROUTING && byokAllowed('ANTHROPIC_API_KEY')) {
      const byok = await this.runCandidate(
        attempts,
        () => callClaudeAnthropicDirect(sp, uc, CLAUDE_DIRECT_MODEL_ID),
        CLAUDE_DIRECT_MODEL_ID,
        'claude_native',
        'byok'
      );
      if (byok) return byok;
    }

    const r1 = await this.maybeRunDgridCandidate(
      attempts,
      dgridState,
      () => callOpenAICompatible(LLAMA_MODEL_ID, sp, uc, createDGridOpenAIClient()),
      LLAMA_MODEL_ID,
      'openai_compatible'
    );
    if (r1) return r1;

    if (dgridState.available) {
      await delay(MODEL_RETRY_DELAY_MS);
      const r2 = await this.maybeRunDgridCandidate(
        attempts,
        dgridState,
        () => callOpenAICompatible(LLAMA_MODEL_ID, sp, uc, createDGridOpenAIClient()),
        LLAMA_MODEL_ID,
        'openai_compatible'
      );
      if (r2) return r2;
    }

    const r3 = await this.maybeRunDgridCandidate(
      attempts,
      dgridState,
      () => callOpenAICompatible(LLAMA_FALLBACK_MODEL_ID, sp, uc, createDGridOpenAIClient()),
      LLAMA_FALLBACK_MODEL_ID,
      'openai_compatible'
    );
    if (r3) return r3;

    const r4 = await this.maybeRunDgridCandidate(
      attempts,
      dgridState,
      () => callOpenAICompatible(GPT4O_MODEL_ID, sp, uc, createDGridOpenAIClient()),
      GPT4O_MODEL_ID,
      'openai_compatible'
    );
    if (r4) return r4;

    if (byokAllowed('ANTHROPIC_API_KEY')) {
      const r5 = await this.runCandidate(attempts,
        () => callClaudeAnthropicDirect(sp, uc, CLAUDE_DIRECT_MODEL_ID),
        CLAUDE_DIRECT_MODEL_ID, 'claude_native', 'byok');
      if (r5) return r5;
    }

    const degraded = JSON.stringify({ action: 'hold', confidence: 0, rationale: 'CLASSIFIER_MODEL_UNAVAILABLE' });
    return this.degradedResult(LLAMA_MODEL_ID, 'openai_compatible', degraded, attempts);
  }

  private result(attempt: ModelCallAttempt, attempts: ModelCallAttempt[]): FallbackResult {
    return {
      responseText: attempt.responseText, attempts, finalModelId: attempt.modelId,
      finalEndpointFormat: attempt.endpointFormat, finalRoutingDecision: attempt.routingDecision,
      latencyMs: attempts.reduce((sum, a) => sum + a.latencyMs, 0),
    };
  }

  private degradedResult(
    modelId: string, format: string, text: string, attempts: ModelCallAttempt[]
  ): FallbackResult {
    console.warn(`[fallback] All attempts failed for ${modelId}, using degraded output`);
    return {
      responseText: text, attempts, finalModelId: modelId,
      finalEndpointFormat: format, finalRoutingDecision: 'dgrid',
      latencyMs: attempts.reduce((sum, a) => sum + a.latencyMs, 0),
    };
  }
}
