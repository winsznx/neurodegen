import { MODEL_CALL_TIMEOUT_MS, MAX_OUTPUT_TOKENS } from '@/config/cognition';
import type { LLMCallParams, LLMCallResult } from './claudeClient';

const DGRID_BASE_URL = process.env.DGRID_BASE_URL ?? 'https://api.dgrid.ai/v1';

interface AnthropicCompatResponse {
  content: Array<{ type: string; text?: string }>;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
}

interface OpenAICompatResponse {
  choices: Array<{
    message: { role: string; content: string | null };
    finish_reason: string | null;
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

function getDGridKey(): string {
  const key = process.env.DGRID_API_KEY;
  if (!key) throw new Error('DGRID_API_KEY env var is not set');
  return key;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms`)), ms);
    }),
  ]);
}

/**
 * DGrid `/v1/messages` (Anthropic-compatible). Use for any Claude-family model
 * routed through DGrid (e.g. `anthropic/claude-sonnet-4.6`, `anthropic/claude-haiku-4.5`).
 */
export async function callDGridMessages(params: LLMCallParams): Promise<LLMCallResult> {
  // Same Anthropic prompt-caching path as direct Claude (DGrid is a
  // pass-through for Anthropic-compatible messages).
  const body = {
    model: params.modelId,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: [
      {
        type: 'text' as const,
        text: params.systemPrompt,
        cache_control: { type: 'ephemeral' as const },
      },
    ],
    messages: [{ role: 'user', content: params.userContent }],
  };

  const response = await withTimeout(
    fetch(`${DGRID_BASE_URL}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': getDGridKey(),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    }),
    MODEL_CALL_TIMEOUT_MS,
    'callDGridMessages',
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `DGrid Messages call failed [model=${params.modelId} status=${response.status}]: ${errorBody}`,
    );
  }

  const data = (await response.json()) as AnthropicCompatResponse;
  const text = data.content
    .filter((c) => c.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text as string)
    .join('');

  return {
    text,
    inputTokens: data.usage.input_tokens,
    outputTokens: data.usage.output_tokens,
    modelId: data.model,
  };
}

/**
 * DGrid `/v1/chat/completions` (OpenAI-compatible). Use for GPT-4o, DeepSeek,
 * Qwen, and any other model exposed in the OpenAI format through DGrid.
 */
export async function callDGridChatCompletions(
  params: LLMCallParams,
): Promise<LLMCallResult> {
  const body = {
    model: params.modelId,
    max_tokens: MAX_OUTPUT_TOKENS,
    messages: [
      { role: 'system', content: params.systemPrompt },
      { role: 'user', content: params.userContent },
    ],
  };

  const response = await withTimeout(
    fetch(`${DGRID_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getDGridKey()}`,
      },
      body: JSON.stringify(body),
    }),
    MODEL_CALL_TIMEOUT_MS,
    'callDGridChatCompletions',
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `DGrid Chat call failed [model=${params.modelId} status=${response.status}]: ${errorBody}`,
    );
  }

  const data = (await response.json()) as OpenAICompatResponse;
  const text = data.choices[0]?.message?.content ?? '';

  return {
    text,
    inputTokens: data.usage.prompt_tokens,
    outputTokens: data.usage.completion_tokens,
    modelId: data.model,
  };
}
