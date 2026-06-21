import {
  PROBE_TRADE_FROM_SYMBOL,
  PROBE_TRADE_HOUR_UTC,
  PROBE_TRADE_TO_SYMBOL,
  PROBE_TRADE_USD,
} from '@/config/execution';
import { ENABLE_PROBE_TRADE, ENABLE_EXECUTION, DRY_RUN_MODE } from '@/config/features';
import { twakClient } from '@/lib/clients/twakClient';
import { getDailyTradeCount } from '@/lib/queries/positions';
import { realtimeService } from '@/lib/services/realtimeService';
import { getWorkerState, setWorkerState } from '@/lib/queries/workerState';

export interface ProbeTradeSchedulerState {
  lastProbeDay: string | null;
}

const PROBE_STATE_KEY = 'probe_scheduler/v1';

/**
 * Load the persisted probe state from Postgres so a worker restart between
 * 00:00 UTC and the probe window can't cause a second probe to fire.
 *
 * V2 Phase 2 audit fix: previously the scheduler kept `lastProbeDay` in
 * memory only, so a crash plus restart on the same day would replay the
 * probe - blowing the "first trade of the day must be the probe" compliance
 * signal we rely on.
 */
export async function loadPersistedProbeState(): Promise<ProbeTradeSchedulerState> {
  try {
    const row = await getWorkerState<ProbeTradeSchedulerState>(PROBE_STATE_KEY);
    return row ?? { lastProbeDay: null };
  } catch (err) {
    console.error(
      '[probe] failed to load persisted state - defaulting to in-memory:',
      err instanceof Error ? err.message : String(err),
    );
    return { lastProbeDay: null };
  }
}

export async function persistProbeState(state: ProbeTradeSchedulerState): Promise<void> {
  try {
    await setWorkerState(PROBE_STATE_KEY, state);
  } catch (err) {
    console.error(
      '[probe] failed to persist state:',
      err instanceof Error ? err.message : String(err),
    );
  }
}

export function utcDayBucket(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Should a probe trade fire right now?
 *
 *  - ENABLE_PROBE_TRADE must be true
 *  - Current UTC hour must be ≥ PROBE_TRADE_HOUR_UTC
 *  - No trade has been recorded yet for the current UTC day (DB check)
 *  - The scheduler hasn't already fired today
 */
export async function shouldFireProbe(
  state: ProbeTradeSchedulerState,
  now: Date = new Date(),
): Promise<{ should: boolean; reason: string }> {
  if (!ENABLE_PROBE_TRADE) {
    return { should: false, reason: 'ENABLE_PROBE_TRADE=false' };
  }
  const day = utcDayBucket(now);
  if (state.lastProbeDay === day) {
    return { should: false, reason: 'probe already fired today' };
  }
  if (now.getUTCHours() < PROBE_TRADE_HOUR_UTC) {
    return { should: false, reason: `before ${PROBE_TRADE_HOUR_UTC}:00 UTC cutoff` };
  }
  const count = await getDailyTradeCount().catch(() => 0);
  if (count > 0) {
    return { should: false, reason: 'at least one trade already recorded today' };
  }
  return { should: true, reason: 'compliance probe needed' };
}

/**
 * Execute the probe trade (BUSD → CAKE → BUSD) and broadcast the result.
 * Returns the swap tx hashes for the audit log.
 */
export async function fireProbe(): Promise<{
  fired: boolean;
  forwardTxHash: `0x${string}` | null;
  reverseTxHash: `0x${string}` | null;
  reason: string;
}> {
  if (!ENABLE_PROBE_TRADE) {
    return { fired: false, forwardTxHash: null, reverseTxHash: null, reason: 'disabled' };
  }
  if (!ENABLE_EXECUTION && !DRY_RUN_MODE) {
    return { fired: false, forwardTxHash: null, reverseTxHash: null, reason: 'execution disabled and not in dry-run' };
  }
  try {
    const forward = await twakClient.executeSwap({
      fromTokenSymbol: PROBE_TRADE_FROM_SYMBOL,
      toTokenSymbol: PROBE_TRADE_TO_SYMBOL,
      amountTokens: PROBE_TRADE_USD.toString(),
    });
    const reverse = await twakClient.executeSwap({
      fromTokenSymbol: PROBE_TRADE_TO_SYMBOL,
      toTokenSymbol: PROBE_TRADE_FROM_SYMBOL,
      amountTokens: forward.toAmountTokens,
    });
    realtimeService.broadcast({
      type: 'position_update',
      data: { kind: 'probe_trade', forward: forward.txHash, reverse: reverse.txHash },
      timestamp: Date.now(),
    });
    return {
      fired: true,
      forwardTxHash: forward.txHash,
      reverseTxHash: reverse.txHash,
      reason: 'ok',
    };
  } catch (err) {
    return {
      fired: false,
      forwardTxHash: null,
      reverseTxHash: null,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
