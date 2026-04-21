import {
  CLAUDE_MODEL_ID,
  GPT4O_MODEL_ID,
  LLAMA_MODEL_ID,
} from '@/config/cognition';
import { ENABLE_BYOK_ROUTING } from '@/config/features';
import { callClaudeNative } from './claude';
import { callOpenAICompatible, createByokOpenAIClient, createDGridOpenAIClient } from './openai';

export interface ModelCallResult {
  responseText: string;
  modelId: string;
  endpointFormat: 'claude_native' | 'openai_compatible' | 'gemini_native';
  routingDecision: 'dgrid' | 'byok';
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
}

type TaskType = 'sentiment' | 'extraction' | 'classification';

function shouldUseBYOK(task: TaskType): boolean {
  if (!ENABLE_BYOK_ROUTING) return false;
  if (task === 'extraction' && process.env.OPENAI_API_KEY) return true;
  return false;
}

export async function routeModelCall(
  task: TaskType,
  systemPrompt: string,
  userContent: string
): Promise<ModelCallResult> {
  const startMs = Date.now();

  if (task === 'sentiment') {
    const result = await callClaudeNative(systemPrompt, userContent, CLAUDE_MODEL_ID);
    const latencyMs = Date.now() - startMs;
    console.log(
      `[dgrid-router] task=${task} model=${CLAUDE_MODEL_ID} format=claude_native route=dgrid latency=${latencyMs}ms`
    );
    return {
      responseText: result.text,
      modelId: CLAUDE_MODEL_ID,
      endpointFormat: 'claude_native',
      routingDecision: 'dgrid',
      latencyMs,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    };
  }

  if (task === 'extraction') {
    const useBYOK = shouldUseBYOK(task);
    const client = useBYOK ? createByokOpenAIClient() : createDGridOpenAIClient();
    const result = await callOpenAICompatible(GPT4O_MODEL_ID, systemPrompt, userContent, client);
    const latencyMs = Date.now() - startMs;
    const routingDecision = useBYOK ? 'byok' : 'dgrid';
    console.log(
      `[dgrid-router] task=${task} model=${GPT4O_MODEL_ID} format=openai_compatible route=${routingDecision} latency=${latencyMs}ms`
    );
    return {
      responseText: result.text,
      modelId: GPT4O_MODEL_ID,
      endpointFormat: 'openai_compatible',
      routingDecision: routingDecision as 'dgrid' | 'byok',
      latencyMs,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    };
  }

  const result = await callOpenAICompatible(LLAMA_MODEL_ID, systemPrompt, userContent);
  const latencyMs = Date.now() - startMs;
  console.log(
    `[dgrid-router] task=${task} model=${LLAMA_MODEL_ID} format=openai_compatible route=dgrid latency=${latencyMs}ms`
  );
  return {
    responseText: result.text,
    modelId: LLAMA_MODEL_ID,
    endpointFormat: 'openai_compatible',
    routingDecision: 'dgrid',
    latencyMs,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}
