import {
  PROBE_TRADE_FROM_SYMBOL,
  PROBE_TRADE_HOUR_UTC,
  PROBE_TRADE_TO_SYMBOL,
  PROBE_TRADE_USD,
} from '@/config/execution';
import { ENABLE_PROBE_TRADE, ENABLE_EXECUTION, DRY_RUN_MODE } from '@/config/features';
import { twakClient } from '@/lib/clients/twakClient';
import { getDailyTradeCount, insertPosition, updatePositionStatus } from '@/lib/queries/positions';
import { realtimeService } from '@/lib/services/realtimeService';
import { getWorkerState, setWorkerState } from '@/lib/queries/workerState';
import { getAllowedTokens } from '@/lib/utils/allowedTokens';
import type { PositionState } from '@/types/execution';

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
 * Execute the probe trade (FROM → TO → FROM) and broadcast the result.
 *
 * V2 Phase Q: now inserts a DB position row for the forward leg so the agent
 * (risk manager, /api/health, /journal) actually sees the non-stable balance
 * that resulted. If the reverse leg succeeds, the position is closed in the
 * same call. If the reverse leg fails (allowance race, insufficient gas,
 * route lost), the position stays MANAGED — visible to risk manager + can
 * be reconciled on the next probe cycle.
 *
 * Returns the swap tx hashes for the audit log + the positionId if one was
 * created.
 */
export async function fireProbe(): Promise<{
  fired: boolean;
  forwardTxHash: `0x${string}` | null;
  reverseTxHash: `0x${string}` | null;
  positionId: string | null;
  reason: string;
}> {
  if (!ENABLE_PROBE_TRADE) {
    return { fired: false, forwardTxHash: null, reverseTxHash: null, positionId: null, reason: 'disabled' };
  }
  if (!ENABLE_EXECUTION && !DRY_RUN_MODE) {
    return {
      fired: false,
      forwardTxHash: null,
      reverseTxHash: null,
      positionId: null,
      reason: 'execution disabled and not in dry-run',
    };
  }

  // Forward leg.
  let forward;
  try {
    forward = await twakClient.executeSwap({
      fromTokenSymbol: PROBE_TRADE_FROM_SYMBOL,
      toTokenSymbol: PROBE_TRADE_TO_SYMBOL,
      amountTokens: PROBE_TRADE_USD.toString(),
    });
  } catch (err) {
    return {
      fired: false,
      forwardTxHash: null,
      reverseTxHash: null,
      positionId: null,
      reason: `forward swap failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Insert a position row for the non-stable acquired in the forward leg so
  // the risk manager + status snapshots see it.
  let positionId: string | null = null;
  try {
    const allowed = getAllowedTokens();
    const toAddress = allowed[PROBE_TRADE_TO_SYMBOL.toUpperCase()];
    if (toAddress) {
      const sizeUSD = Number.parseFloat(PROBE_TRADE_USD.toString());
      const entryPriceUSD =
        Number.parseFloat(forward.toAmountTokens) > 0
          ? sizeUSD / Number.parseFloat(forward.toAmountTokens)
          : 0;
      const day = utcDayBucket(new Date());
      positionId = crypto.randomUUID();
      const position: PositionState = {
        positionId,
        sessionId: `probe-${day}`,
        tokenSymbol: PROBE_TRADE_TO_SYMBOL,
        tokenAddress: toAddress,
        direction: 'spot',
        sizeUSD,
        leverage: 1,
        entryPriceUSD,
        tpPriceUSD: null,
        slPriceUSD: null,
        twakTxHash: forward.txHash,
        attestationCommitTx: null,
        attestationRevealTx: null,
        status: 'MANAGED',
        exitPriceUSD: null,
        pnlUSD: null,
        pnlPct: null,
        exitReason: null,
        openedAt: new Date().toISOString(),
        closedAt: null,
      };
      await insertPosition(position).catch((err) => {
        console.warn(
          '[probe] insertPosition(forward) failed:',
          err instanceof Error ? err.message : String(err),
        );
        positionId = null;
      });
    }
  } catch (err) {
    console.warn(
      '[probe] failed to record forward position:',
      err instanceof Error ? err.message : String(err),
    );
  }

  // Reverse leg.
  let reverse;
  try {
    reverse = await twakClient.executeSwap({
      fromTokenSymbol: PROBE_TRADE_TO_SYMBOL,
      toTokenSymbol: PROBE_TRADE_FROM_SYMBOL,
      amountTokens: forward.toAmountTokens,
    });
  } catch (err) {
    realtimeService.broadcast({
      type: 'position_update',
      data: { kind: 'probe_trade', forward: forward.txHash, reverse: null },
      timestamp: Date.now(),
    });
    return {
      fired: false,
      forwardTxHash: forward.txHash,
      reverseTxHash: null,
      positionId,
      reason: `reverse swap failed (position MANAGED): ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Reverse leg succeeded — close the position we just opened.
  if (positionId) {
    const sizeUSD = Number.parseFloat(PROBE_TRADE_USD.toString());
    const exitPriceUSD =
      Number.parseFloat(forward.toAmountTokens) > 0
        ? Number.parseFloat(reverse.toAmountTokens) / Number.parseFloat(forward.toAmountTokens)
        : 0;
    const pnlUSD = Number.parseFloat(reverse.toAmountTokens) - sizeUSD;
    const pnlPct = sizeUSD > 0 ? pnlUSD / sizeUSD : 0;
    await updatePositionStatus(positionId, {
      status: 'CLOSED',
      exitPriceUSD,
      pnlUSD,
      pnlPct,
      exitReason: 'probe_trade_unwind',
      closedAt: new Date().toISOString(),
      attestationRevealTx: null,
    }).catch((err) => {
      console.warn(
        '[probe] updatePositionStatus(close) failed:',
        err instanceof Error ? err.message : String(err),
      );
    });
  }

  realtimeService.broadcast({
    type: 'position_update',
    data: { kind: 'probe_trade', forward: forward.txHash, reverse: reverse.txHash },
    timestamp: Date.now(),
  });
  return {
    fired: true,
    forwardTxHash: forward.txHash,
    reverseTxHash: reverse.txHash,
    positionId,
    reason: 'ok',
  };
}
