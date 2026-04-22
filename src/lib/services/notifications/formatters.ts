import type { UserPosition } from '@/types/users';
import type { ActionRecommendation } from '@/types/cognition';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://neurodegen.xyz';

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatUsd(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}

function signedUsd(n: number): string {
  return `${n >= 0 ? '+' : ''}${formatUsd(n)}`;
}

function formatPct(n: number): string {
  return `${n >= 0 ? '+' : ''}${(n * 100).toFixed(2)}%`;
}

export interface MirrorOpenedPayload {
  pair: string;
  isLong: boolean;
  collateralUsd: number;
  leverage: number;
  entryPrice: number;
  txHash: string | null;
  confidence: number | null;
  regime: string | null;
}

export function formatMirrorOpenedTelegram(p: MirrorOpenedPayload): string {
  const side = p.isLong ? '🟢 LONG' : '🔴 SHORT';
  const notional = p.collateralUsd * p.leverage;
  const proofLink = p.txHash ? `\n<a href="${APP_URL}/proof/${p.txHash}">view proof →</a>` : '';
  const bscLink = p.txHash ? `\n<a href="https://bscscan.com/tx/${p.txHash}">bscscan ↗</a>` : '';
  const confidence = p.confidence !== null ? `\n<b>confidence</b>  ${Math.round(p.confidence * 100)}%` : '';
  const regime = p.regime ? `\n<b>regime</b>  ${escapeHtml(p.regime)}` : '';

  return (
    `<b>${side}  ${escapeHtml(p.pair)}</b>\n` +
    `<b>size</b>  ${formatUsd(p.collateralUsd)} × ${p.leverage}x (${formatUsd(notional)} notional)\n` +
    `<b>entry</b>  ${formatUsd(p.entryPrice)}` +
    confidence +
    regime +
    proofLink +
    bscLink
  );
}

export interface MirrorClosedPayload {
  pair: string;
  isLong: boolean;
  entryPrice: number;
  exitPrice: number | null;
  collateralUsd: number;
  realizedPnlUsd: number | null;
  exitReason: string | null;
  entryTxHash: string | null;
}

export function formatMirrorClosedTelegram(p: MirrorClosedPayload): string {
  const pnl = p.realizedPnlUsd ?? 0;
  const emoji = pnl > 0 ? '✅' : pnl < 0 ? '❌' : '⚪';
  const side = p.isLong ? 'LONG' : 'SHORT';
  const pnlPct = p.collateralUsd > 0 ? pnl / p.collateralUsd : 0;
  const reason = p.exitReason ? `\n<b>reason</b>  ${escapeHtml(humanExitReason(p.exitReason))}` : '';
  const proofLink = p.entryTxHash ? `\n<a href="${APP_URL}/proof/${p.entryTxHash}">view proof →</a>` : '';
  const exit = p.exitPrice !== null ? ` → ${formatUsd(p.exitPrice)}` : '';

  return (
    `<b>${emoji} ${side} ${escapeHtml(p.pair)} closed</b>\n` +
    `<b>p&amp;l</b>  ${signedUsd(pnl)} (${formatPct(pnlPct)})\n` +
    `<b>entry → exit</b>  ${formatUsd(p.entryPrice)}${exit}` +
    reason +
    proofLink
  );
}

export interface MirrorSkippedPayload {
  pair: string;
  isLong: boolean;
  reason: string;
  action: ActionRecommendation['action'];
  confidence: number | null;
}

export function formatMirrorSkippedTelegram(p: MirrorSkippedPayload): string {
  return (
    `⏭ <b>${escapeHtml(p.pair)}</b> signal skipped\n` +
    `<b>side</b>  ${p.isLong ? 'long' : 'short'}\n` +
    `<b>reason</b>  ${escapeHtml(humanSkipReason(p.reason))}` +
    (p.confidence !== null ? `\n<b>agent confidence</b>  ${Math.round(p.confidence * 100)}%` : '')
  );
}

export interface HealthPayload {
  source: 'perception' | 'cognition' | 'execution' | 'agent_loop';
  severity: 'warn' | 'critical';
  message: string;
}

export function formatHealthTelegram(p: HealthPayload): string {
  const icon = p.severity === 'critical' ? '🚨' : '⚠️';
  return `${icon} <b>${escapeHtml(p.source)}</b> health degraded\n<pre>${escapeHtml(p.message.slice(0, 400))}</pre>`;
}

export interface AgentStatusPayload {
  running: boolean;
  reason: string;
  cycleCount: number;
}

export function formatAgentStatusTelegram(p: AgentStatusPayload): string {
  const icon = p.running ? '▶️' : '⏸';
  return `${icon} agent ${p.running ? 'started' : 'stopped'} at cycle ${p.cycleCount}\n<i>${escapeHtml(p.reason)}</i>`;
}

export interface DailySummaryPayload {
  dateLabel: string;
  opens: number;
  closes: number;
  wins: number;
  losses: number;
  cumulativePnl: number;
  bestTrade: { pair: string; pnl: number } | null;
  worstTrade: { pair: string; pnl: number } | null;
}

export function formatDailySummaryTelegram(p: DailySummaryPayload): string {
  const lines = [
    `📊 <b>NeuroDegen daily summary · ${escapeHtml(p.dateLabel)}</b>`,
    `<b>positions opened</b>  ${p.opens}`,
    `<b>positions closed</b>  ${p.closes}`,
    `<b>w / l</b>  ${p.wins} / ${p.losses}`,
    `<b>net p&amp;l</b>  ${signedUsd(p.cumulativePnl)}`,
  ];
  if (p.bestTrade) lines.push(`<b>best</b>  ${escapeHtml(p.bestTrade.pair)} ${signedUsd(p.bestTrade.pnl)}`);
  if (p.worstTrade) lines.push(`<b>worst</b>  ${escapeHtml(p.worstTrade.pair)} ${signedUsd(p.worstTrade.pnl)}`);
  lines.push(`\n<a href="${APP_URL}/track-record">full track record ↗</a>`);
  return lines.join('\n');
}

function humanExitReason(reason: string): string {
  const map: Record<string, string> = {
    tp_hit: 'take-profit triggered',
    sl_hit: 'stop-loss triggered',
    time_exit: 'max duration reached',
    regime_exit: 'market regime shifted',
    external_close: 'closed externally on MYX',
    manual: 'manual close',
    admin: 'admin close',
    liquidated: 'liquidated',
  };
  return map[reason] ?? reason;
}

function humanSkipReason(reason: string): string {
  const confidence = /^confidence_below_user_threshold\(([\d.]+)\)$/.exec(reason);
  if (confidence) return `below ${Math.round(Number(confidence[1]) * 100)}% confidence threshold`;
  const map: Record<string, string> = {
    subscription_inactive: 'your mirror is paused',
    signer_not_granted: 'session signer not granted',
    no_wallet_id: 'wallet not linked — reconnect via /me',
    zero_collateral: 'collateral cap too low for current entry',
    zero_leverage: 'leverage multiplier produced zero effective leverage',
    invalid_index_price: 'price feed stale at execution',
  };
  return map[reason] ?? reason;
}

export function formatUserPositionOpenFromMirror(
  mirror: { pair: string; isLong: boolean; collateralUsd: number; leverage: number; entryPrice: number; entryTxHash: string | null },
  confidence: number | null,
  regime: string | null
): MirrorOpenedPayload {
  return {
    pair: mirror.pair,
    isLong: mirror.isLong,
    collateralUsd: mirror.collateralUsd,
    leverage: mirror.leverage,
    entryPrice: mirror.entryPrice,
    txHash: mirror.entryTxHash,
    confidence,
    regime,
  };
}

export function formatUserPositionCloseFromMirror(
  mirror: UserPosition
): MirrorClosedPayload {
  return {
    pair: mirror.pair,
    isLong: mirror.isLong,
    entryPrice: mirror.entryPrice,
    exitPrice: mirror.exitPrice,
    collateralUsd: mirror.collateralUsd,
    realizedPnlUsd: mirror.realizedPnlUsd,
    exitReason: mirror.exitReason,
    entryTxHash: mirror.entryTxHash,
  };
}
