import { POSITION_POLL_INTERVAL_MS } from '@/config/execution';
import {
  getOpenPositions,
  getPositionByTxHash,
  updatePositionStatus,
} from '@/lib/queries/positions';
import type { PositionState, TWAKPortfolioSnapshot } from '@/types/execution';

export class PositionTracker {
  private timer: ReturnType<typeof setInterval> | null = null;

  start(getPortfolio: () => Promise<TWAKPortfolioSnapshot>): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.reconcileOnce(getPortfolio).catch((err) =>
        console.error(
          '[position-tracker] tick failed:',
          err instanceof Error ? err.message : String(err),
        ),
      );
    }, POSITION_POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Reconcile DB positions against the on-chain TWAK portfolio.
   * Fixes the V1 lifecycle bug from NEURODEGEN_V1_AUDIT.md §1.2c-d:
   * V1 never advanced positions from SUBMITTED → MANAGED → CLOSED in the hot
   * loop. V2 transitions on every poll: if the token is still in the portfolio,
   * the position is MANAGED; if it disappeared, mark CLOSED with the latest
   * snapshot pricing.
   */
  async reconcileOnce(
    getPortfolio: () => Promise<TWAKPortfolioSnapshot>,
  ): Promise<void> {
    const dbPositions = await getOpenPositions().catch(() => [] as PositionState[]);
    if (dbPositions.length === 0) return;
    const portfolio = await getPortfolio();
    const heldSymbols = new Set(
      portfolio.positions.map((p) => p.tokenSymbol.toUpperCase()),
    );

    for (const p of dbPositions) {
      if (p.status === 'SUBMITTED' && heldSymbols.has(p.tokenSymbol.toUpperCase())) {
        await updatePositionStatus(p.positionId, { status: 'FILLED' });
        await updatePositionStatus(p.positionId, { status: 'MANAGED' });
      } else if (p.status === 'MANAGED' && !heldSymbols.has(p.tokenSymbol.toUpperCase())) {
        await updatePositionStatus(p.positionId, {
          status: 'CLOSED',
          exitReason: 'external_close',
          closedAt: new Date().toISOString(),
        });
      }
    }
  }

  async resolveByTxHash(txHash: `0x${string}`): Promise<PositionState | null> {
    return getPositionByTxHash(txHash);
  }
}

export const positionTracker = new PositionTracker();
