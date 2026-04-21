import { ENABLE_GEMINI_FORMAT } from '@/config/features';

const DGRID_BASE_URL = 'https://api.dgrid.ai/v1';

interface GeminiResponse {
  candidates: Array<{
    content: { parts: Array<{ text: string }> };
  }>;
}

function getDGridApiKey(): string {
  const key = process.env.DGRID_API_KEY;
  if (!key) throw new Error('DGRID_API_KEY environment variable is not set');
  return key;
}

export async function callGeminiNative(
  systemPrompt: string,
  userContent: string
): Promise<{ text: string }> {
  if (!ENABLE_GEMINI_FORMAT) {
    throw new Error('Gemini format disabled via feature flag');
  }

  const response = await fetch(`${DGRID_BASE_URL}/generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': getDGridApiKey(),
    },
    body: JSON.stringify({
      contents: [
        { role: 'user', parts: [{ text: `${systemPrompt}\n\n${userContent}` }] },
      ],
      generationConfig: {
        maxOutputTokens: 1024,
        temperature: 0.7,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `DGrid Gemini call failed [status=${response.status}]: ${body}`
    );
  }

  const data = (await response.json()) as GeminiResponse;
  const text = data.candidates[0]?.content?.parts[0]?.text;
  if (!text) {
    throw new Error('DGrid Gemini call returned empty content');
  }

  return { text };
}
