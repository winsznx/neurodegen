import {
  COMPETITION_CONTRACT_ADDRESS,
  COMPETITION_REGISTRATION_DEADLINE,
  COMPETITION_TRADING_WINDOW_START,
} from '@/config/competition';
import { DRY_RUN_MODE } from '@/config/features';
import { twakClient } from '@/lib/clients/twakClient';
import { getWorkerState, setWorkerState } from '@/lib/queries/workerState';

export const COMPETITION_REGISTRATION_KEY = 'competition_registration_v1';

export interface PersistedCompetitionRegistration {
  registered: true;
  txHash: `0x${string}`;
  participant: `0x${string}`;
  contract: `0x${string}`;
  registeredAt: string;
  alreadyRegistered: boolean;
  dryRun: boolean;
}

export type EnsureRegistrationResult =
  | { ok: true; reason: 'cached' | 'fresh'; record: PersistedCompetitionRegistration }
  | { ok: false; reason: 'deadline_passed' | 'twak_failed' | 'dry_run_skipped'; message: string };

/**
 * Idempotently register the agent wallet on the competition contract.
 *
 *  - If a fresh registration record exists in `worker_state`, return it.
 *  - If we're inside DRY_RUN_MODE, skip the live call (loudly) — synthetic tx
 *    hashes have no on-chain counterpart and would never be accepted as proof.
 *  - If the registration deadline has already passed, bail with a clear reason
 *    so the operator notices and doesn't silently run an ineligible agent.
 *  - Otherwise call `twak compete register --json`, persist the result, and
 *    return it.
 *
 * Errors are caught and surfaced as `{ ok: false }` so the worker can boot
 * even when registration fails — the agent should keep the codepaths warm
 * even if its trades don't count this run.
 */
export async function ensureCompetitionRegistration(
  now: Date = new Date(),
): Promise<EnsureRegistrationResult> {
  const cached = await getWorkerState<PersistedCompetitionRegistration>(
    COMPETITION_REGISTRATION_KEY,
  ).catch(() => null);
  if (cached?.registered) {
    return { ok: true, reason: 'cached', record: cached };
  }

  if (DRY_RUN_MODE) {
    return {
      ok: false,
      reason: 'dry_run_skipped',
      message:
        'DRY_RUN_MODE=true — skipping on-chain `twak compete register`. Set DRY_RUN_MODE=false before the trading window opens.',
    };
  }

  const deadline = Date.parse(COMPETITION_REGISTRATION_DEADLINE);
  if (!Number.isNaN(deadline) && now.getTime() > deadline) {
    return {
      ok: false,
      reason: 'deadline_passed',
      message: `competition registration deadline ${COMPETITION_REGISTRATION_DEADLINE} has passed; trades during the live window will NOT count`,
    };
  }

  try {
    const res = await twakClient.register();
    const record: PersistedCompetitionRegistration = {
      registered: true,
      txHash: res.txHash,
      participant: res.participant,
      contract: COMPETITION_CONTRACT_ADDRESS,
      registeredAt: now.toISOString(),
      alreadyRegistered: res.alreadyRegistered,
      dryRun: false,
    };
    await setWorkerState(COMPETITION_REGISTRATION_KEY, record);
    return { ok: true, reason: 'fresh', record };
  } catch (err) {
    return {
      ok: false,
      reason: 'twak_failed',
      message: `twak compete register failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Warn loudly if the trading window has opened and we're still in dry-run mode
 * or have no persisted registration. Returns the list of issues for the
 * caller to log/broadcast.
 */
export async function preflightCompetitionState(
  now: Date = new Date(),
): Promise<string[]> {
  const issues: string[] = [];
  const start = Date.parse(COMPETITION_TRADING_WINDOW_START);
  const windowOpen = !Number.isNaN(start) && now.getTime() >= start;
  if (windowOpen && DRY_RUN_MODE) {
    issues.push(
      `trading window OPEN (since ${COMPETITION_TRADING_WINDOW_START}) but DRY_RUN_MODE=true — no real trades will land`,
    );
  }
  const cached = await getWorkerState<PersistedCompetitionRegistration>(
    COMPETITION_REGISTRATION_KEY,
  ).catch(() => null);
  if (windowOpen && !cached?.registered) {
    issues.push(
      `trading window OPEN but no persisted registration record on contract ${COMPETITION_CONTRACT_ADDRESS}; trades will not count`,
    );
  }
  return issues;
}
