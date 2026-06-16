import type { RegimeLabel } from '@/types/perception';

export interface RegimeParameters {
  positionSizeMultiplier: number;
  maxLeverage: 1;
  tpPercentage: number;
  slPercentage: number;
  cooldownAfterLossMs: number;
  evGateActive: boolean;
  /** When true, the agent does no committee session — only the probe trade fires. */
  hibernate: boolean;
}

export const REGIME_PARAMS: Record<RegimeLabel, RegimeParameters> = {
  quiet: {
    positionSizeMultiplier: 0,
    maxLeverage: 1,
    tpPercentage: 0,
    slPercentage: 0,
    cooldownAfterLossMs: 0,
    evGateActive: false,
    hibernate: true,
  },
  active: {
    positionSizeMultiplier: 0.5,
    maxLeverage: 1,
    tpPercentage: 0.03,
    slPercentage: 0.02,
    cooldownAfterLossMs: 15 * 60_000,
    evGateActive: true,
    hibernate: false,
  },
  momentum: {
    positionSizeMultiplier: 1.0,
    maxLeverage: 1,
    tpPercentage: 0.05,
    slPercentage: 0.03,
    cooldownAfterLossMs: 10 * 60_000,
    evGateActive: true,
    hibernate: false,
  },
  volatile: {
    positionSizeMultiplier: 0.1,
    maxLeverage: 1,
    tpPercentage: 0.02,
    slPercentage: 0.015,
    cooldownAfterLossMs: 60 * 60_000,
    evGateActive: true,
    hibernate: false,
  },
};

// RegimeClassifier transition thresholds
export const REGIME_FG_QUIET_LOW = 40;
export const REGIME_FG_QUIET_HIGH = 60;
export const REGIME_FG_VOLATILE_LOW = 25;
export const REGIME_FG_VOLATILE_HIGH = 85;
export const REGIME_FG_MOMENTUM_LOW = 60;
export const REGIME_FG_MOMENTUM_HIGH = 85;

export const REGIME_SURGE_ACTIVE_MIN = 3;
export const REGIME_SURGE_MOMENTUM_MIN = 4;
export const REGIME_KOL_MOMENTUM_VELOCITY_MIN = 5;
export const REGIME_KOL_MOMENTUM_TOKEN_MIN = 2;

export const REGIME_VOLATILE_FUNDING_RATE_MAX = 0.001;
export const REGIME_VOLATILE_HELD_DRAWDOWN_PCT = 0.05;
export const REGIME_VOLATILE_HELD_DRAWDOWN_WINDOW_MS = 30 * 60_000;

export const REGIME_VOLATILE_EXIT_COOLDOWN_MS = 120_000;
