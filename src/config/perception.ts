function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// Polling cadences (Perception layer)
export const CMC_QUOTES_POLL_INTERVAL_MS: number = envInt('CMC_QUOTES_POLL_INTERVAL_MS', 60_000);
export const CMC_GLOBAL_POLL_INTERVAL_MS: number = envInt('CMC_GLOBAL_POLL_INTERVAL_MS', 300_000);
export const CMC_NARRATIVES_POLL_INTERVAL_MS: number = envInt('CMC_NARRATIVES_POLL_INTERVAL_MS', 300_000);
export const CMC_NEWS_POLL_INTERVAL_MS: number = envInt('CMC_NEWS_POLL_INTERVAL_MS', 600_000);
export const CMC_DERIVATIVES_POLL_INTERVAL_MS: number = envInt('CMC_DERIVATIVES_POLL_INTERVAL_MS', 300_000);
export const REGIME_REEVAL_INTERVAL_MS: number = envInt('REGIME_REEVAL_INTERVAL_MS', 60_000);

// Hot state retention
const DEFAULT_HOT_STATE_TTL_MINUTES = 30;
export const HOT_STATE_TTL_MINUTES: number = envNumber('HOT_STATE_TTL_MINUTES', DEFAULT_HOT_STATE_TTL_MINUTES);

// Cold storage batching
export const EVENT_BATCH_SIZE: number = envInt('EVENT_BATCH_SIZE', 100);

// EV gate
export const EV_THRESHOLD: number = envNumber('EV_THRESHOLD', 3.0);
export const EV_BASE_CONFIDENCE: number = envNumber('EV_BASE_CONFIDENCE', 0.5);
export const X402_COST_PER_CALL_USDC: number = envNumber('X402_COST_PER_CALL_USDC', 0.01);
