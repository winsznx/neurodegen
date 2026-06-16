import { COMPETITION_CONTRACT_ADDRESS } from './chains';

// Competition registration deadline (UTC). Read-only; if reinstated, set via env.
export const COMPETITION_REGISTRATION_DEADLINE: string =
  process.env.COMPETITION_REGISTRATION_DEADLINE ?? '2026-06-22T00:00:00Z';

export const COMPETITION_TRADING_WINDOW_START: string =
  process.env.COMPETITION_TRADING_WINDOW_START ?? '2026-06-22T00:00:00Z';

export const COMPETITION_TRADING_WINDOW_END: string =
  process.env.COMPETITION_TRADING_WINDOW_END ?? '2026-06-28T23:59:59Z';

// Re-export contract for convenience
export { COMPETITION_CONTRACT_ADDRESS };

// The 149 BEP-20 token allowlist lives in lib/utils/allowedTokens.ts (Phase 2 will populate).
// This re-export is here so config consumers don't import from utils directly.
