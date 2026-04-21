import { listActiveTelegramSubscriptions } from '@/lib/queries/telegram';
import { getUserPositions } from '@/lib/queries/userPositions';
import { notify } from './dispatcher';
import type { UserPosition } from '@/types/users';
import type { DailySummaryPayload } from './formatters';

const DAY_MS = 24 * 60 * 60 * 1000;

function buildSummaryForPositions(positions: UserPosition[], since: number): DailySummaryPayload {
  const recent = positions.filter((p) => new Date(p.openedAt).getTime() >= since);
  const closed = recent.filter((p) => p.status === 'closed' || p.status === 'liquidated');

  let wins = 0;
  let losses = 0;
  let cumulativePnl = 0;
  let best: { pair: string; pnl: number } | null = null;
  let worst: { pair: string; pnl: number } | null = null;

  for (const p of closed) {
    const pnl = p.realizedPnlUsd ?? 0;
    cumulativePnl += pnl;
    if (pnl > 0) wins += 1;
    else if (pnl < 0) losses += 1;

    if (!best || pnl > best.pnl) best = { pair: p.pair, pnl };
    if (!worst || pnl < worst.pnl) worst = { pair: p.pair, pnl };
  }

  return {
    dateLabel: new Date(since).toISOString().slice(0, 10),
    opens: recent.length,
    closes: closed.length,
    wins,
    losses,
    cumulativePnl,
    bestTrade: best,
    worstTrade: worst,
  };
}

export async function sendDailySummaryToAll(): Promise<{ sent: number; skipped: number }> {
  const subs = await listActiveTelegramSubscriptions().catch(() => []);
  if (subs.length === 0) return { sent: 0, skipped: 0 };

  const since = Date.now() - DAY_MS;
  let sent = 0;
  let skipped = 0;

  await Promise.all(
    subs.map(async (sub) => {
      if (sub.preferences.daily_summary === false) {
        skipped += 1;
        return;
      }
      const positions = await getUserPositions(sub.userId, 200).catch(() => []);
      const payload = buildSummaryForPositions(positions, since);
      if (payload.opens === 0 && payload.closes === 0) {
        skipped += 1;
        return;
      }
      const result = await notify.dailySummaryForUser(sub.userId, payload);
      if (result === 'sent') sent += 1;
      else skipped += 1;
    })
  );

  return { sent, skipped };
}

export class DailySummaryScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  start(): void {
    if (this.running) return;
    this.running = true;
    this.scheduleNext();
    console.log('[daily-summary] scheduler started');
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    console.log('[daily-summary] scheduler stopped');
  }

  private scheduleNext(): void {
    if (!this.running) return;
    const now = new Date();
    const next = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0, 5, 0, 0
    ));
    const delay = Math.max(60_000, next.getTime() - now.getTime());
    this.timer = setTimeout(() => {
      void this.fire();
    }, delay);
  }

  private async fire(): Promise<void> {
    try {
      const result = await sendDailySummaryToAll();
      console.log(`[daily-summary] sent=${result.sent} skipped=${result.skipped}`);
    } catch (err) {
      console.error('[daily-summary] fire failed:', err instanceof Error ? err.message : String(err));
    } finally {
      this.scheduleNext();
    }
  }
}

export const dailySummaryScheduler = new DailySummaryScheduler();
