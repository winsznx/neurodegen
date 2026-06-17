// Committee model IDs. All verified served by DGrid in V2 Phase 0 against
// `GET https://api.dgrid.ai/v1/models` (162 models total). BYOK direct APIs
// hit Anthropic/OpenAI first; DGrid is the universal fallback.
export const NARRATIVE_MODEL_ID: string = 'claude-sonnet-4.6';
export const NARRATIVE_FALLBACK_MODEL_ID: string = 'claude-haiku-4.5';
export const NARRATIVE_DGRID_PRIMARY: string = 'anthropic/claude-sonnet-4.6';
export const NARRATIVE_DGRID_FALLBACK: string = 'anthropic/claude-haiku-4.5';

export const QUANT_MODEL_ID: string = 'gpt-4o';
export const QUANT_FALLBACK_MODEL_ID: string = 'gpt-4o-mini';
export const QUANT_DGRID_PRIMARY: string = 'openai/gpt-4o';
export const QUANT_DGRID_FALLBACK: string = 'openai/gpt-4o-mini';

// Risk Classifier is DGrid-only (DeepSeek has no V1-compatible direct API in V1's setup).
// Phase 0 verified Llama-3-70b is NOT served by DGrid; DeepSeek v3.2 was the V1-validated choice
// across 3,357 production cycles and costs less. Qwen-flash is the last-resort fallback.
export const RISK_PRIMARY_MODEL: string = 'deepseek/deepseek-v3.2';
export const RISK_FALLBACK_MODEL: string = 'qwen/qwen-flash';
export const RISK_LAST_RESORT_MODEL: string = 'openai/gpt-4o';

// Call cadence and ergonomics
export const MODEL_CALL_TIMEOUT_MS: number = 30_000;
// Kept for legacy callers; V2 router does NOT delay between fallback
// candidates (each candidate is a different model, so a delay never helps).
// V1 audit §3.5 step 7.
export const MODEL_RETRY_DELAY_MS: number = 0;

// Below this confidence the Risk Classifier output is forced to hold regardless of action.
export const MIN_CONFIDENCE_TO_ACT: number = parseFloat(process.env.MIN_CONFIDENCE_TO_ACT ?? '0.3');

// Hard ceiling on output tokens per model call (paper safety net against rogue prompt expansion).
export const MAX_OUTPUT_TOKENS: number = parseInt(process.env.MAX_OUTPUT_TOKENS ?? '2048', 10);

// Cache TTL for canonical-input-hash → response memoization. 0 disables caching.
export const LLM_CACHE_TTL_MS: number = parseInt(process.env.LLM_CACHE_TTL_MS ?? '120000', 10);
