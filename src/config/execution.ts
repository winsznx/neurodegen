function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const ORACLE_DIVERGENCE_MAX: number = envNumber('ORACLE_DIVERGENCE_MAX', 0.005);
export const OI_IMBALANCE_MAX: number = envNumber('OI_IMBALANCE_MAX', 0.7);
export const FUNDING_RATE_MAX: number = envNumber('FUNDING_RATE_MAX', 0.001);
export const MAX_SLIPPAGE: number = envNumber('MAX_SLIPPAGE', 0.02);
export const GAS_BUFFER_BNB: number = envNumber('GAS_BUFFER_BNB', 0.01);
export const GAS_HARD_CAP: number = 1_000_000;
export const KEEPER_POLL_INTERVAL_MS: number = parseInt(process.env.KEEPER_POLL_INTERVAL_MS ?? '2000', 10);
export const MAX_KEEPER_WAIT_BLOCKS: number = 10;
export const MAX_POSITION_DURATION_MS: number = 14_400_000;
export const DEFAULT_TP_PERCENTAGE: number = envNumber('DEFAULT_TP_PERCENTAGE', 0.05);
export const DEFAULT_SL_PERCENTAGE: number = envNumber('DEFAULT_SL_PERCENTAGE', 0.03);
export const DEFAULT_LEVERAGE: number = envNumber('DEFAULT_LEVERAGE', 10);
export const POSITION_POLL_INTERVAL_MS: number = parseInt(process.env.POSITION_POLL_INTERVAL_MS ?? '5000', 10);
