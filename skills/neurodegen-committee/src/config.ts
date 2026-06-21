import type {
  MandateRiskLevel,
  RegimeLabel,
  RegimeParameters,
} from './types';

export const ALLOWLIST_SYMBOLS = [
  'BNB',
  'WBNB',
  'CAKE',
  'ETH',
  'BTCB',
  'USDT',
  'BUSD',
] as const;

export const REGIME_FG_VOLATILE_LOW = 25;
export const REGIME_FG_VOLATILE_HIGH = 85;
export const REGIME_FG_QUIET_LOW = 40;
export const REGIME_FG_QUIET_HIGH = 70;

export const REGIME_SURGE_ACTIVE_MIN = 3;
export const REGIME_SURGE_MOMENTUM_MIN = 4;
export const REGIME_KOL_MOMENTUM_VELOCITY_MIN = 5;
export const REGIME_KOL_MOMENTUM_TOKEN_MIN = 2;

export const REGIME_VOLATILE_FUNDING_RATE_MAX = 0.001;
export const REGIME_VOLATILE_EXIT_COOLDOWN_MS = 120_000;

export const SURGE_PCT_CHANGE_1H_MIN = 5;

export const REGIME_PARAMS: Record<RegimeLabel, RegimeParameters> = {
  quiet: { sizeMult: 0, tpPct: 0, slPct: 0 },
  active: { sizeMult: 0.5, tpPct: 3, slPct: 2 },
  momentum: { sizeMult: 1.0, tpPct: 5, slPct: 3 },
  volatile: { sizeMult: 0.1, tpPct: 2, slPct: 1.5 },
};

export const MANDATE_MULT: Record<MandateRiskLevel, number> = {
  conservative: 0.5,
  moderate: 1.0,
  aggressive: 1.5,
};

export const BASE_SIZE_USD = 100;
export const MAX_POSITION_USD = 200;
export const MAX_EXPOSURE_PCT = 0.8;
export const MIN_VIABLE_SIZE_USD = 0.01;

export const MAX_CONCURRENT_POSITIONS = 5;
export const DAILY_LOSS_CAP_USD = 50;

export const MIN_CONFIDENCE = 0.3;
export const FUNDING_WARNING_CONFIDENCE_OVERRIDE = 0.7;
