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

// Pre-execution thresholds
export const ORACLE_DIVERGENCE_MAX_PCT: number = envNumber('ORACLE_DIVERGENCE_MAX_PCT', 0.005);
export const MAX_SLIPPAGE_PCT: number = envNumber('MAX_SLIPPAGE_PCT', 0.005);
export const SECURITY_RISK_SCORE_MAX: number = envNumber('SECURITY_RISK_SCORE_MAX', 60);

// Wallet headroom
export const GAS_BUFFER_BNB: number = envNumber('GAS_BUFFER_BNB', 0.005);

// Position lifecycle
export const POSITION_POLL_INTERVAL_MS: number = envInt('POSITION_POLL_INTERVAL_MS', 30_000);
export const MAX_POSITION_DURATION_MS: number = envInt('MAX_POSITION_DURATION_MS', 14_400_000);

// Probe trade compliance
export const PROBE_TRADE_USD: number = envNumber('PROBE_TRADE_USD', 10);
export const PROBE_TRADE_HOUR_UTC: number = envInt('PROBE_TRADE_HOUR_UTC', 18);
export const PROBE_TRADE_FROM_SYMBOL: string = process.env.PROBE_TRADE_FROM_SYMBOL ?? 'BUSD';
export const PROBE_TRADE_TO_SYMBOL: string = process.env.PROBE_TRADE_TO_SYMBOL ?? 'CAKE';

// V2 is spot-only. Leverage is hardcoded 1; perp is deferred to V2.1 behind a feature flag.
export const DEFAULT_LEVERAGE: 1 = 1 as const;

// Default risk parameters (overridden by mandate)
export const DEFAULT_TP_PERCENTAGE: number = envNumber('DEFAULT_TP_PERCENTAGE', 0.05);
export const DEFAULT_SL_PERCENTAGE: number = envNumber('DEFAULT_SL_PERCENTAGE', 0.03);
