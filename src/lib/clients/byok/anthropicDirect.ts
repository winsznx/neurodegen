import { CLAUDE_DIRECT_MODEL_ID } from '@/config/cognition';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

interface AnthropicResponse {
  content: Array<{ type: string; text: string }>;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
}

function getApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY environment variable is not set for BYOK routing');
  return key;
}

export async function callClaudeAnthropicDirect(
  systemPrompt: string,
  userContent: string,
  modelId: string = CLAUDE_DIRECT_MODEL_ID
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': getApiKey(),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: modelId,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Anthropic direct call failed [model=${modelId}, status=${response.status}]: ${body}`
    );
  }

  const data = (await response.json()) as AnthropicResponse;
  const block = data.content[0];
  if (!block || block.type !== 'text') {
    throw new Error(`Anthropic direct call returned non-text content [model=${modelId}]`);
  }

  return {
    text: block.text,
    inputTokens: data.usage.input_tokens,
    outputTokens: data.usage.output_tokens,
  };
}
