import { MODEL_CALL_TIMEOUT_MS, MAX_OUTPUT_TOKENS } from '@/config/cognition';
import type { LLMCallParams, LLMCallResult } from './claudeClient';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

interface OpenAIChatResponse {
  choices: Array<{
    message: { role: string; content: string | null };
    finish_reason: string | null;
  }>;
  model: string;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

function getOpenAIKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY env var is not set');
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
 * Direct OpenAI Chat Completions API call. Use for the Quant analyst's BYOK path.
 */
export async function callOpenAIChatCompletions(
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
    fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getOpenAIKey()}`,
      },
      body: JSON.stringify(body),
    }),
    MODEL_CALL_TIMEOUT_MS,
    'callOpenAIChatCompletions',
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `OpenAI Chat call failed [model=${params.modelId} status=${response.status}]: ${errorBody}`,
    );
  }

  const data = (await response.json()) as OpenAIChatResponse;
  const text = data.choices[0]?.message?.content ?? '';

  return {
    text,
    inputTokens: data.usage.prompt_tokens,
    outputTokens: data.usage.completion_tokens,
    modelId: data.model,
  };
}
