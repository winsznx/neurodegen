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

export const MYX_POLL_INTERVAL_MS: number = parseInt(process.env.MYX_POLL_INTERVAL_MS ?? '15000', 10);
export const PYTH_DASHBOARD_POLL_INTERVAL_MS: number = 30_000;
export const LAUNCH_VELOCITY_WINDOW_HOURS: number = 4;
export const CAPITAL_INFLOW_WINDOW_HOURS: number = 4;
export const GRADUATION_VELOCITY_WINDOW_HOURS: number = 12;
export const PURCHASE_CONCENTRATION_WINDOW: number = 50;
export const FUNDING_TREND_SNAPSHOTS: number = 8;
const DEFAULT_HOT_STATE_TTL_MINUTES = Math.max(
  LAUNCH_VELOCITY_WINDOW_HOURS,
  CAPITAL_INFLOW_WINDOW_HOURS,
  GRADUATION_VELOCITY_WINDOW_HOURS
) * 60;
export const HOT_STATE_TTL_MINUTES: number = envNumber('HOT_STATE_TTL_MINUTES', DEFAULT_HOT_STATE_TTL_MINUTES);
export const FOURMEME_BACKFILL_BLOCKS: number = envInt('FOURMEME_BACKFILL_BLOCKS', 14_400);
export const EVENT_BATCH_SIZE: number = 100;
export const WS_RECONNECT_INITIAL_MS: number = 1_000;
export const WS_RECONNECT_MAX_MS: number = 30_000;
export const WS_DISCONNECT_ALERT_MS: number = 60_000;
export const MYX_TRACKED_PAIRS: string[] = ['BTC_USDT', 'ETH_USDT', 'BNB_USDT'];
