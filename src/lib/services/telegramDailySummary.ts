/**
 * Telegram daily summary cron. Fires once per UTC day at the configured hour
 * (default 00:00 UTC) and posts a recap to the broadcast channel: trade count,
 * win/loss split, gross PnL, top winner, top loser, recent session count.
 *
 * Idempotency: persists the last-summary YYYY-MM-DD bucket to `worker_state`.
 * If the worker restarts between 00:00 and 00:10 UTC, the bucket check prevents
 * a double-fire. If the worker is down at midnight, the next boot after the
 * cron interval triggers the missed summary.
 *
 * Failure isolation: every error is caught + logged. NEVER throws so the
 * agentLoop and statusTimer can't be poisoned by a Telegram outage.
 */

import { getPositionHistory } from '@/lib/queries/positions';
import { getRecentSessions } from '@/lib/queries/sessions';
import { getWorkerState, setWorkerState } from '@/lib/queries/workerState';
import { telegramAlerter } from './telegramAlerter';
import { TelegramClient, escapeMarkdownV2 } from '@/lib/clients/telegramClient';
import { fmtUSD, fmtPct, fmtNum } from '@/lib/format';

const KEY = 'telegram_daily_summary_v1';
const SUMMARY_HOUR_UTC = Number(process.env.TELEGRAM_DAILY_HOUR_UTC ?? '0');

export interface DailySummaryStats {
  date: string;
  tradesClosed: number;
  wins: number;
  losses: number;
  grossPnlUSD: number;
  bestWinSymbol: string | null;
  bestWinPnlUSD: number | null;
  worstLossSymbol: string | null;
  worstLossPnlUSD: number | null;
  sessionsRun: number;
}

interface PersistedState {
  lastSummaryDate: string;
}

function utcDayBucket(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function previousDayBucket(now: Date): string {
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return utcDayBucket(yesterday);
}

export async function computeDailySummary(
  forBucket: string,
  now: Date = new Date(),
): Promise<DailySummaryStats> {
  const dayStartMs = Date.parse(`${forBucket}T00:00:00.000Z`);
  const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000;
  const inWindow = (t: number): boolean => t >= dayStartMs && t < dayEndMs;

  const [positions, sessions] = await Promise.all([
    getPositionHistory(500).catch(() => []),
    getRecentSessions(200).catch(() => []),
  ]);

  const closedInWindow = positions.filter((p) => {
    if (!p.closedAt) return false;
    const ts = Date.parse(p.closedAt);
    return Number.isFinite(ts) && inWindow(ts) && typeof p.pnlUSD === 'number';
  });

  let wins = 0;
  let losses = 0;
  let grossPnl = 0;
  let bestWin: typeof closedInWindow[number] | null = null;
  let worstLoss: typeof closedInWindow[number] | null = null;
  for (const p of closedInWindow) {
    const pnl = p.pnlUSD ?? 0;
    grossPnl += pnl;
    if (pnl >= 0) {
      wins += 1;
      if (!bestWin || pnl > (bestWin.pnlUSD ?? 0)) bestWin = p;
    } else {
      losses += 1;
      if (!worstLoss || pnl < (worstLoss.pnlUSD ?? 0)) worstLoss = p;
    }
  }

  const sessionsInWindow = sessions.filter((s) => inWindow(s.createdAt));

  return {
    date: forBucket,
    tradesClosed: closedInWindow.length,
    wins,
    losses,
    grossPnlUSD: grossPnl,
    bestWinSymbol: bestWin?.tokenSymbol ?? null,
    bestWinPnlUSD: bestWin?.pnlUSD ?? null,
    worstLossSymbol: worstLoss?.tokenSymbol ?? null,
    worstLossPnlUSD: worstLoss?.pnlUSD ?? null,
    sessionsRun: sessionsInWindow.length,
    // Silence unused now param at runtime; kept in signature for testability.
  } as DailySummaryStats;
}

export function formatDailySummary(stats: DailySummaryStats, appUrl: string): string {
  const lines: string[] = [
    `📊 *Daily summary* \\| ${escapeMarkdownV2(stats.date)}`,
    ``,
    `Trades closed: ${escapeMarkdownV2(fmtNum(stats.tradesClosed))}`,
    `Wins: ${escapeMarkdownV2(fmtNum(stats.wins))} \\| Losses: ${escapeMarkdownV2(fmtNum(stats.losses))}`,
    `Sessions: ${escapeMarkdownV2(fmtNum(stats.sessionsRun))}`,
    ``,
    stats.tradesClosed > 0
      ? `Net PnL: *${escapeMarkdownV2(fmtUSD(stats.grossPnlUSD))}* \\(${escapeMarkdownV2(fmtPct(stats.grossPnlUSD / 100, { signed: true }))}\\)`
      : `Net PnL: no closes today`,
  ];
  if (stats.bestWinSymbol && stats.bestWinPnlUSD !== null) {
    lines.push(
      `Best: ${escapeMarkdownV2(stats.bestWinSymbol)} ${escapeMarkdownV2(fmtUSD(stats.bestWinPnlUSD))}`,
    );
  }
  if (stats.worstLossSymbol && stats.worstLossPnlUSD !== null) {
    lines.push(
      `Worst: ${escapeMarkdownV2(stats.worstLossSymbol)} ${escapeMarkdownV2(fmtUSD(stats.worstLossPnlUSD))}`,
    );
  }
  lines.push('', `[Journal](${escapeLinkUrl(appUrl + '/journal')}) \\| [Live](${escapeLinkUrl(appUrl + '/agent')})`);
  return lines.join('\n');
}

function escapeLinkUrl(url: string): string {
  return url.replace(/\\/g, '\\\\').replace(/\)/g, '\\)');
}

/**
 * Check whether a summary should fire right now. Returns the day bucket to
 * summarise (yesterday) if yes; null if no.
 *
 *  - Skip if telegramAlerter is not running.
 *  - Skip if we are not yet past SUMMARY_HOUR_UTC.
 *  - Skip if we have already summarised yesterday.
 */
export async function shouldFireDailySummary(now: Date = new Date()): Promise<string | null> {
  if (!telegramAlerter.isStarted()) return null;
  if (now.getUTCHours() < SUMMARY_HOUR_UTC) return null;
  const yesterday = previousDayBucket(now);
  const persisted = await getWorkerState<PersistedState>(KEY).catch(() => null);
  if (persisted?.lastSummaryDate === yesterday) return null;
  return yesterday;
}

/**
 * One-shot: if eligible, compute + send + persist. Safe to call every minute.
 */
export async function tickDailySummary(now: Date = new Date()): Promise<void> {
  try {
    const bucket = await shouldFireDailySummary(now);
    if (!bucket) return;
    const stats = await computeDailySummary(bucket, now);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://neurodegen.xyz';
    const text = formatDailySummary(stats, appUrl);
    const client = new TelegramClient({ enabled: true });
    await client.sendMessage(text, { disableNotification: false, linkPreview: 'off' });
    await setWorkerState(KEY, { lastSummaryDate: bucket });
    console.warn(
      `[tg-daily] sent summary for ${bucket}: ${stats.tradesClosed} trades, gross $${stats.grossPnlUSD.toFixed(2)}`,
    );
  } catch (err) {
    console.error(
      '[tg-daily] tickDailySummary failed:',
      err instanceof Error ? err.message : String(err),
    );
  }
}
