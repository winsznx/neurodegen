import { CLAUDE_MODEL_ID } from '@/config/cognition';

const DGRID_BASE_URL = 'https://api.dgrid.ai/v1';

interface ClaudeNativeResponse {
  content: Array<{ type: string; text: string }>;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
}

function getDGridApiKey(): string {
  const key = process.env.DGRID_API_KEY;
  if (!key) throw new Error('DGRID_API_KEY environment variable is not set');
  return key;
}

export async function callClaudeNative(
  systemPrompt: string,
  userContent: string,
  modelId: string = CLAUDE_MODEL_ID
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const response = await fetch(`${DGRID_BASE_URL}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': getDGridApiKey(),
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
      `DGrid Claude call failed [model=${modelId}, status=${response.status}]: ${body}`
    );
  }

  const data = (await response.json()) as ClaudeNativeResponse;
  return {
    text: data.content[0].text,
    inputTokens: data.usage.input_tokens,
    outputTokens: data.usage.output_tokens,
  };
}

export async function callClaudeSentiment(
  systemPrompt: string,
  userContent: string
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  return callClaudeNative(systemPrompt, userContent, CLAUDE_MODEL_ID);
}
