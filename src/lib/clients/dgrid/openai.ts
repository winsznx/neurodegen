import OpenAI from 'openai';

const DGRID_BASE_URL = 'https://api.dgrid.ai/v1';

function getDGridApiKey(): string {
  const key = process.env.DGRID_API_KEY;
  if (!key) throw new Error('DGRID_API_KEY environment variable is not set');
  return key;
}

export function createDGridOpenAIClient(): OpenAI {
  return new OpenAI({
    baseURL: DGRID_BASE_URL,
    apiKey: getDGridApiKey(),
  });
}

export function createByokOpenAIClient(): OpenAI {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY environment variable is not set for BYOK routing');
  return new OpenAI({ apiKey: key });
}

export async function callOpenAICompatible(
  modelId: string,
  systemPrompt: string,
  userContent: string,
  client?: OpenAI
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const openai = client ?? createDGridOpenAIClient();

  const completion = await openai.chat.completions.create({
    model: modelId,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    max_tokens: 2048,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error(`DGrid OpenAI-compatible call returned empty content [model=${modelId}]`);
  }

  return {
    text: content,
    inputTokens: completion.usage?.prompt_tokens ?? 0,
    outputTokens: completion.usage?.completion_tokens ?? 0,
  };
}
