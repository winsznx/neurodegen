export const CLAUDE_MODEL_ID: string = 'anthropic/claude-sonnet-4.6';
export const CLAUDE_FALLBACK_MODEL_ID: string = 'anthropic/claude-haiku-4.5';
export const CLAUDE_DIRECT_MODEL_ID: string = 'claude-haiku-4-5-20251001';
export const GPT4O_MODEL_ID: string = 'openai/gpt-4o';
export const GPT4O_FALLBACK_MODEL_ID: string = 'openai/gpt-4o-mini';
// Raw OpenAI API rejects DGrid-prefixed IDs; use the native ID for BYOK paths.
export const GPT4O_DIRECT_MODEL_ID: string = 'gpt-4o';
export const LLAMA_MODEL_ID: string = 'deepseek/deepseek-v3.2';
export const LLAMA_FALLBACK_MODEL_ID: string = 'qwen/qwen-flash';
export const CLAUDE_CALL_FREQUENCY: number = 20;
export const MODEL_CALL_TIMEOUT_MS: number = 30_000;
export const MODEL_RETRY_DELAY_MS: number = 2_000;
export const MIN_CONFIDENCE_TO_ACT: number = parseFloat(process.env.MIN_CONFIDENCE_TO_ACT ?? '0.25');
