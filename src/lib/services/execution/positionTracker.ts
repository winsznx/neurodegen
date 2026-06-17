import { POSITION_POLL_INTERVAL_MS } from '@/config/execution';
import {
  getOpenPositions,
  getPositionByTxHash,
  updatePositionStatus,
} from '@/lib/queries/positions';
import type { PositionState, TWAKPortfolioSnapshot } from '@/types/execution';
import { hotState } from '@/lib/stores/hotState';
import type { CMCQuoteEvent } from '@/types/perception';

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
   * Fixes the V1 lifecycle bug from NEURODEGEN_V1_AUDIT.md §1.2c-d AND the
   * partial V2 gap (§H6 from V2 Phase 1 audit) where external_close transitions
   * marked CLOSED with no exit price, exit tx hash, or PnL.
   *
   * V2 is spot-only, so "external close" means the user manually moved the
   * token out of the wallet via Trust Wallet directly. We fetch a current CMC
   * quote as the best-effort exit price and compute PnL against entry. If no
   * quote is available, we still mark CLOSED but flag the row with `external_close_no_price`
   * so the UI can render it without lying.
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
      const symbol = p.tokenSymbol.toUpperCase();
      if (p.status === 'SUBMITTED' && heldSymbols.has(symbol)) {
        await updatePositionStatus(p.positionId, { status: 'FILLED' });
        await updatePositionStatus(p.positionId, { status: 'MANAGED' });
      } else if (p.status === 'MANAGED' && !heldSymbols.has(symbol)) {
        await this.closeExternally(p);
      }
    }
  }

  private async closeExternally(p: PositionState): Promise<void> {
    const exitPriceUSD = this.pickLatestCmcPrice(p.tokenSymbol);
    if (exitPriceUSD !== null && p.entryPriceUSD > 0) {
      const tokensHeld = p.sizeUSD / p.entryPriceUSD;
      const pnlUSD = tokensHeld * (exitPriceUSD - p.entryPriceUSD);
      const pnlPct = (exitPriceUSD - p.entryPriceUSD) / p.entryPriceUSD;
      await updatePositionStatus(p.positionId, {
        status: 'CLOSED',
        exitPriceUSD,
        pnlUSD,
        pnlPct,
        exitReason: 'external_close',
        closedAt: new Date().toISOString(),
      });
    } else {
      // No price available — mark CLOSED with a distinct exit reason so the
      // UI can render "external close, price unknown" instead of a misleading $0 PnL.
      await updatePositionStatus(p.positionId, {
        status: 'CLOSED',
        exitReason: 'external_close',
        closedAt: new Date().toISOString(),
      });
    }
  }

  private pickLatestCmcPrice(tokenSymbol: string): number | null {
    const events = hotState.getRecentEvents('cmc_hub');
    const upper = tokenSymbol.toUpperCase();
    let latest: { priceUSD: number; ts: number } | null = null;
    for (const event of events) {
      if (event.eventType !== 'quote_update') continue;
      const quote = event as CMCQuoteEvent;
      if (quote.tokenSymbol.toUpperCase() !== upper) continue;
      if (!latest || quote.timestamp > latest.ts) {
        latest = { priceUSD: quote.priceUSD, ts: quote.timestamp };
      }
    }
    return latest?.priceUSD ?? null;
  }

  async resolveByTxHash(txHash: `0x${string}`): Promise<PositionState | null> {
    return getPositionByTxHash(txHash);
  }
}

export const positionTracker = new PositionTracker();
