import type { MyxClient, PositionType } from '@myx-trade/sdk';
import type { PositionState } from '@/types/execution';
import type { RegimeLabel } from '@/types/cognition';
import { insertPosition, updatePositionStatus, getOpenPositions } from '@/lib/queries/positions';
import {
  KEEPER_POLL_INTERVAL_MS,
  MAX_KEEPER_WAIT_BLOCKS,
  MAX_POSITION_DURATION_MS,
} from '@/config/execution';

export interface PositionExit {
  position: PositionState;
  reason: 'tp_hit' | 'sl_hit' | 'time_exit' | 'regime_exit' | 'external_close' | 'manual';
  submitDecreaseOrder: boolean;
}

export class PositionTracker {
  private pollers = new Map<string, ReturnType<typeof setInterval>>();

  constructor(
    private sdk: MyxClient,
    private agentAddress: `0x${string}`
  ) {}

  /**
   * Called once at boot to reconcile orphaned positions.
   * If a position is still open on MYX, promote it to 'managed'.
   * If MYX no longer has it, mark it closed (keeper already settled).
   */
  async reconcileOnBoot(): Promise<void> {
    try {
      const dbPositions = await getOpenPositions();
      if (dbPositions.length === 0) {
        console.log('[position-tracker] reconcile: no open positions in DB');
        return;
      }

      const onChain = await this.listAllPositions();
      console.log(`[position-tracker] reconcile: ${dbPositions.length} DB positions, ${onChain.length} on-chain`);

      for (const pos of dbPositions) {
        const hasOnChain = onChain.some((p) => parseFloat(p.size ?? '0') > 0);

        if (pos.status === 'expired' || pos.status === 'pending' || pos.status === 'submitted') {
          if (hasOnChain) {
            // Position is still live on MYX — recover it
            await updatePositionStatus(pos.positionId, { status: 'managed' });
            console.log(`[position-tracker] reconcile: ${pos.positionId} recovered → managed`);
          } else {
            // MYX already closed it (TP/SL/liquidation) — mark closed in DB
            await updatePositionStatus(pos.positionId, {
              status: 'closed',
              exitReason: 'external_close',
              closedAt: new Date().toISOString(),
            });
            console.log(`[position-tracker] reconcile: ${pos.positionId} → closed (keeper settled)`);
          }
        }
      }
    } catch (err) {
      console.error('[position-tracker] reconcile failed:', err instanceof Error ? err.message : String(err));
    }
  }

  async trackNewOrder(positionState: PositionState): Promise<void> {
    await insertPosition(positionState);

    let pollCount = 0;
    const interval = setInterval(async () => {
      pollCount++;

      if (pollCount > MAX_KEEPER_WAIT_BLOCKS) {
        clearInterval(interval);
        this.pollers.delete(positionState.positionId);
        await updatePositionStatus(positionState.positionId, { status: 'expired' });
        console.log(`[position-tracker] position ${positionState.positionId} expired after ${MAX_KEEPER_WAIT_BLOCKS} polls`);
        return;
      }

      try {
        const onChain = await this.findPosition(positionState.positionId);
        if (onChain) {
          clearInterval(interval);
          this.pollers.delete(positionState.positionId);
          await updatePositionStatus(positionState.positionId, { status: 'managed' });
          console.log(`[position-tracker] position ${positionState.positionId} filled and managed`);
        }
      } catch (err) {
        console.error('[position-tracker] poll error:', err instanceof Error ? err.message : String(err));
      }
    }, KEEPER_POLL_INTERVAL_MS);

    this.pollers.set(positionState.positionId, interval);
  }

  async checkPositionExits(
    openPositions: PositionState[],
    currentRegime: RegimeLabel,
    previousRegime: RegimeLabel | null
  ): Promise<PositionExit[]> {
    const exits: PositionExit[] = [];
    const onChainPositions = await this.listAllPositions();

    for (const pos of openPositions) {
      if (pos.status !== 'managed') continue; // skip pending/submitted positions

      const openedTime = new Date(pos.openedAt).getTime();
      if (Date.now() - openedTime > MAX_POSITION_DURATION_MS) {
        exits.push({ position: pos, reason: 'time_exit', submitDecreaseOrder: true });
        continue;
      }

      if (previousRegime && previousRegime !== 'volatile' && currentRegime === 'volatile') {
        exits.push({ position: pos, reason: 'regime_exit', submitDecreaseOrder: true });
        continue;
      }

      const onChain = onChainPositions.find((p) => p.positionId === pos.positionId);
      if (!onChain || parseFloat(onChain.size ?? '0') === 0) {
        exits.push({ position: pos, reason: 'external_close', submitDecreaseOrder: false });
      }
    }

    return exits;
  }

  stop(): void {
    for (const [id, interval] of this.pollers) {
      clearInterval(interval);
      this.pollers.delete(id);
    }
  }

  private async listAllPositions(): Promise<PositionType[]> {
    const result = await this.sdk.position.listPositions(this.agentAddress);
    if ('data' in result && result.data) return result.data;
    return [];
  }

  private async findPosition(positionId: string): Promise<PositionType | null> {
    const result = await this.sdk.position.listPositions(this.agentAddress, positionId);
    if ('data' in result && result.data && result.data.length > 0) {
      const match = result.data.find((p) => p.positionId === positionId) ?? result.data[0];
      if (match && parseFloat(match.size ?? '0') > 0) return match;
    }
    return null;
  }
}
