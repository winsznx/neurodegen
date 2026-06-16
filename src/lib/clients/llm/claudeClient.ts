import { MODEL_CALL_TIMEOUT_MS, MAX_OUTPUT_TOKENS } from '@/config/cognition';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

interface AnthropicMessagesResponse {
  content: Array<{ type: string; text?: string }>;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
}

export interface LLMCallResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  modelId: string;
}

export interface LLMCallParams {
  systemPrompt: string;
  userContent: string;
  modelId: string;
}

function getAnthropicKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY env var is not set');
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
 * Direct Anthropic Messages API call. Use for the Narrative analyst's BYOK path.
 * Throws on any non-2xx with the body included for debugging.
 */
export async function callClaudeMessages(params: LLMCallParams): Promise<LLMCallResult> {
  const body = {
    model: params.modelId,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: params.systemPrompt,
    messages: [{ role: 'user', content: params.userContent }],
  };

  const response = await withTimeout(
    fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': getAnthropicKey(),
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
    }),
    MODEL_CALL_TIMEOUT_MS,
    'callClaudeMessages',
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Anthropic Messages call failed [model=${params.modelId} status=${response.status}]: ${errorBody}`,
    );
  }

  const data = (await response.json()) as AnthropicMessagesResponse;
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
