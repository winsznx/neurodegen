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

export const MAX_CONCURRENT_POSITIONS: number = envInt('MAX_CONCURRENT_POSITIONS', 2);
export const MAX_TOTAL_EXPOSURE_RATIO: number = envNumber('MAX_TOTAL_EXPOSURE_RATIO', 1.0);
export const PER_POSITION_SIZE_CAP_USD: number = envNumber('PER_POSITION_SIZE_CAP_USD', 10.0);
export const BASE_POSITION_SIZE_USD: number = envNumber('BASE_POSITION_SIZE_USD', 4.0);
export const MIN_POSITION_SIZE_USD: number = envNumber('MIN_POSITION_SIZE_USD', 1.0);
export const COOLDOWN_AFTER_LOSS_MS: number = envInt('COOLDOWN_AFTER_LOSS_MS', 1_800_000);
export const MAX_DAILY_LOSS_USD: number = envNumber('MAX_DAILY_LOSS_USD', 1.0);
export const MAX_LEVERAGE_HARD_CAP: number = envNumber('MAX_LEVERAGE_HARD_CAP', 15);
