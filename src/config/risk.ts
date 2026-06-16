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

// Position sizing (defaults; overridden by mandate)
export const AGENT_BASE_POSITION_SIZE_USD: number = envNumber('AGENT_BASE_POSITION_SIZE_USD', 100);
export const MIN_POSITION_SIZE_USD: number = envNumber('MIN_POSITION_SIZE_USD', 5);
export const PER_POSITION_SIZE_CAP_USD: number = envNumber('PER_POSITION_SIZE_CAP_USD', 200);

// Concurrent exposure
export const MAX_CONCURRENT_POSITIONS: number = envInt('MAX_CONCURRENT_POSITIONS', 5);
export const MAX_TOTAL_EXPOSURE_RATIO: number = envNumber('MAX_TOTAL_EXPOSURE_RATIO', 0.8);

// Daily loss + cooldown
export const MAX_DAILY_LOSS_USD: number = envNumber('MAX_DAILY_LOSS_USD', 50);
export const COOLDOWN_AFTER_LOSS_MS: number = envInt('COOLDOWN_AFTER_LOSS_MS', 1_800_000);

// Drawdown ladder thresholds. ALL enforced by our RiskManager — TWAK has no wallet-level guardrails.
export const DRAWDOWN_ALERT_PCT: number = envNumber('DRAWDOWN_ALERT_PCT', 0.15);
export const DRAWDOWN_DEFENSIVE_PCT: number = envNumber('DRAWDOWN_DEFENSIVE_PCT', 0.2);
export const DRAWDOWN_HALT_PCT: number = envNumber('DRAWDOWN_HALT_PCT', 0.25);
export const DRAWDOWN_DISQUALIFICATION_PCT: number = 0.3;

// V2 is spot-only. Hard cap stays for V2.1 perp mode.
export const MAX_LEVERAGE_HARD_CAP: number = envNumber('MAX_LEVERAGE_HARD_CAP', 1);
