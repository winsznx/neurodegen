import { callClaudeNative } from '@/lib/clients/dgrid/claude';
import { callOpenAICompatible, createDGridOpenAIClient, createByokOpenAIClient } from '@/lib/clients/dgrid/openai';
import { callClaudeAnthropicDirect } from '@/lib/clients/byok/anthropicDirect';
import {
  CLAUDE_MODEL_ID,
  CLAUDE_DIRECT_MODEL_ID,
  GPT4O_MODEL_ID,
  LLAMA_MODEL_ID,
  MODEL_CALL_TIMEOUT_MS,
  MODEL_RETRY_DELAY_MS,
} from '@/config/cognition';

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

  private async sentimentChain(sp: string, uc: string): Promise<FallbackResult> {
    const attempts: ModelCallAttempt[] = [];
    const claude = () => callClaudeNative(sp, uc, CLAUDE_MODEL_ID);

    let a = await tryCall(claude, CLAUDE_MODEL_ID, 'claude_native', 'dgrid');
    attempts.push(a);
    if (a.success) return this.result(a, attempts);

    await delay(MODEL_RETRY_DELAY_MS);
    a = await tryCall(claude, CLAUDE_MODEL_ID, 'claude_native', 'dgrid');
    attempts.push(a);
    if (a.success) return this.result(a, attempts);

    if (process.env.ANTHROPIC_API_KEY) {
      const direct = () => callClaudeAnthropicDirect(sp, uc, CLAUDE_DIRECT_MODEL_ID);
      a = await tryCall(direct, CLAUDE_DIRECT_MODEL_ID, 'claude_native', 'byok');
      attempts.push(a);
      if (a.success) return this.result(a, attempts);
    }

    const gpt = () => callOpenAICompatible(GPT4O_MODEL_ID, sp, uc, createDGridOpenAIClient());
    a = await tryCall(gpt, GPT4O_MODEL_ID, 'openai_compatible', 'dgrid');
    attempts.push(a);
    if (a.success) return this.result(a, attempts);

    const degraded = JSON.stringify({ narrativeSummary: '', sentimentScore: 0, confidenceLevel: 0, flaggedPatterns: ['SENTIMENT_MODEL_UNAVAILABLE'] });
    return this.degradedResult(CLAUDE_MODEL_ID, 'claude_native', degraded, attempts);
  }

  private async extractionChain(sp: string, uc: string): Promise<FallbackResult> {
    const attempts: ModelCallAttempt[] = [];
    const hasByok = !!process.env.OPENAI_API_KEY;
    const client = hasByok ? createByokOpenAIClient() : createDGridOpenAIClient();
    const routing = hasByok ? 'byok' as const : 'dgrid' as const;
    const gpt = () => callOpenAICompatible(GPT4O_MODEL_ID, sp, uc, client);

    let a = await tryCall(gpt, GPT4O_MODEL_ID, 'openai_compatible', routing);
    attempts.push(a);
    if (a.success) return this.result(a, attempts);

    await delay(MODEL_RETRY_DELAY_MS);
    a = await tryCall(gpt, GPT4O_MODEL_ID, 'openai_compatible', routing);
    attempts.push(a);
    if (a.success) return this.result(a, attempts);

    if (hasByok) {
      const dgridGpt = () => callOpenAICompatible(GPT4O_MODEL_ID, sp, uc, createDGridOpenAIClient());
      a = await tryCall(dgridGpt, GPT4O_MODEL_ID, 'openai_compatible', 'dgrid');
      attempts.push(a);
      if (a.success) return this.result(a, attempts);
    }

    const llama = () => callOpenAICompatible(LLAMA_MODEL_ID, sp, uc, createDGridOpenAIClient());
    a = await tryCall(llama, LLAMA_MODEL_ID, 'openai_compatible', 'dgrid');
    attempts.push(a);
    if (a.success) return this.result(a, attempts);

    if (process.env.ANTHROPIC_API_KEY) {
      const claude = () => callClaudeAnthropicDirect(sp, uc, CLAUDE_DIRECT_MODEL_ID);
      a = await tryCall(claude, CLAUDE_DIRECT_MODEL_ID, 'claude_native', 'byok');
      attempts.push(a);
      if (a.success) return this.result(a, attempts);
    }

    const degraded = JSON.stringify({ features: [] });
    return this.degradedResult(GPT4O_MODEL_ID, 'openai_compatible', degraded, attempts);
  }

  private async classificationChain(sp: string, uc: string): Promise<FallbackResult> {
    const attempts: ModelCallAttempt[] = [];
    const llama = () => callOpenAICompatible(LLAMA_MODEL_ID, sp, uc, createDGridOpenAIClient());

    let a = await tryCall(llama, LLAMA_MODEL_ID, 'openai_compatible', 'dgrid');
    attempts.push(a);
    if (a.success) return this.result(a, attempts);

    await delay(MODEL_RETRY_DELAY_MS);
    a = await tryCall(llama, LLAMA_MODEL_ID, 'openai_compatible', 'dgrid');
    attempts.push(a);
    if (a.success) return this.result(a, attempts);

    const gpt = () => callOpenAICompatible(GPT4O_MODEL_ID, sp, uc, createDGridOpenAIClient());
    a = await tryCall(gpt, GPT4O_MODEL_ID, 'openai_compatible', 'dgrid');
    attempts.push(a);
    if (a.success) return this.result(a, attempts);

    if (process.env.ANTHROPIC_API_KEY) {
      const claude = () => callClaudeAnthropicDirect(sp, uc, CLAUDE_DIRECT_MODEL_ID);
      a = await tryCall(claude, CLAUDE_DIRECT_MODEL_ID, 'claude_native', 'byok');
      attempts.push(a);
      if (a.success) return this.result(a, attempts);
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
