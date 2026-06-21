/**
 * Telegram alerter. Subscribes to realtimeService events on the worker and
 * forwards a curated set as MarkdownV2-formatted messages. Strict failure
 * isolation: errors NEVER propagate into the agent loop.
 *
 * Disabled-flag short-circuit happens at `start()`, so when
 * ENABLE_TELEGRAM_ALERTS=false no listener is registered, no env validation
 * runs, and the hot path costs nothing.
 *
 * Rate limit: 30s minimum gap per event-type key (suppresses health_degradation
 * storms when LLM kill persists). position_update is exempt every open/close
 * is high-signal and unique by txHash. health_degradation also dedupes on
 * `${source}|${message[:80]}` within a 5-minute window.
 */

import { ENABLE_TELEGRAM_ALERTS } from '@/config/features';
import {
  DRAWDOWN_ALERT_PCT,
  DRAWDOWN_DEFENSIVE_PCT,
  DRAWDOWN_HALT_PCT,
} from '@/config/risk';
import { realtimeService, type SSEEvent, type SSEEventType } from './realtimeService';
import { TelegramClient, escapeMarkdownV2 } from '@/lib/clients/telegramClient';
import { getWorkerState, setWorkerState } from '@/lib/queries/workerState';

const RATE_LIMIT_MS = 30_000;
const HEALTH_DEDUPE_WINDOW_MS = 5 * 60 * 1_000;
const HEALTH_MESSAGE_TRUNCATE = 80;
const REGIME_RATIONALE_TRUNCATE = 140;
const HEALTH_RENDERED_TRUNCATE = 200;
const BOOT_DEDUPE_KEY = 'telegram_boot_dedupe_v1';
const BOOT_DEDUPE_WINDOW_MS = 10 * 60 * 1_000; // 10 minutes

export type DrawdownTier = 'normal' | 'alert' | 'defensive' | 'halt';

export type AlertKey =
  | SSEEventType
  | 'boot'
  | 'drawdown_tier_change'
  | 'erc8183_job_submitted';

export interface BootSnapshot {
  regime: string;
  openPositionCount: number;
  walletNonStableHoldings: number;
  walletValueUSD: number;
  drawdownPct: number;
  gitSha: string;
}

export interface Erc8183JobSubmittedPayload {
  jobId: string;
  serviceName: string;
  costUSD: number;
}

interface AgentStatusLike {
  drawdownPct?: unknown;
  [k: string]: unknown;
}

interface PositionUpdateLike {
  status?: string;
  direction?: string;
  tokenSymbol?: string;
  sizeUSD?: number;
  entryPriceUSD?: number;
  exitPriceUSD?: number | null;
  tpPriceUSD?: number | null;
  slPriceUSD?: number | null;
  pnlPct?: number | null;
  pnlUSD?: number | null;
  exitReason?: string | null;
  twakTxHash?: string;
  /** Marker the probe-trade scheduler sets on its broadcasts. */
  kind?: string;
  forward?: string;
  reverse?: string;
}

interface CommitteeSessionLike {
  sessionId?: string;
  finalAction?: {
    action?: string;
    tokenSymbol?: string | null;
    confidence?: number;
  };
}

interface RegimeChangeLike {
  from?: string;
  to?: string;
  rationale?: string;
}

interface HealthDegradationLike {
  source?: string;
  message?: string;
}

interface DedupeEntry {
  key: string;
  sentAt: number;
}

class TelegramAlerter {
  private client: TelegramClient | null = null;
  private disposeListener: (() => void) | null = null;
  private lastSentAt = new Map<AlertKey, number>();
  private healthDedupe: DedupeEntry[] = [];
  private lastDrawdownTier: DrawdownTier = 'normal';
  private started = false;

  /** Idempotent. No-op when ENABLE_TELEGRAM_ALERTS=false or token/chat missing. */
  start(): void {
    if (this.started) return;
    if (!ENABLE_TELEGRAM_ALERTS) return;
    if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
      console.warn(
        '[tg-alerter] ENABLE_TELEGRAM_ALERTS=true but TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing; alerter disabled',
      );
      return;
    }
    try {
      this.client = new TelegramClient({ enabled: true });
    } catch (err) {
      console.error(
        '[tg-alerter] failed to construct TelegramClient:',
        err instanceof Error ? err.message : String(err),
      );
      return;
    }
    this.disposeListener = realtimeService.addListener((event) => this.onEvent(event));
    this.started = true;
  }

  stop(): void {
    if (this.disposeListener) {
      this.disposeListener();
      this.disposeListener = null;
    }
    this.client = null;
    this.lastSentAt.clear();
    this.healthDedupe = [];
    this.lastDrawdownTier = 'normal';
    this.started = false;
  }

  isStarted(): boolean {
    return this.started;
  }

  /**
   * Boot notification called once by the worker after agent loop starts.
   *
   * Dedupe strategy (Phase Y — fix Telegram boot spam during heavy commit
   * cadence):
   *
   * Suppress the alert when NONE of these are true:
   *   - First boot on a new UTC day (always fire — daily heartbeat)
   *   - Open-position count changed since last persisted boot
   *   - Drawdown tier flipped (normal → alert / defensive / halt / DQ)
   *   - Wallet value swung >$5 since last boot
   *
   * The commit SHA changing is NOT a reason to alert on its own — operators
   * already know they deployed; what matters is whether agent STATE
   * meaningfully changed. Previously 13+ redundant boot messages landed on
   * 06/27 because we did 13 deploys with no agent-state delta between any
   * of them.
   *
   * Persists snapshot + day to worker_state so dedupe survives restarts.
   */
  async notifyBoot(snapshot: BootSnapshot): Promise<void> {
    if (!this.canSend('boot')) return;
    const now = new Date();
    const today = now.toISOString().slice(0, 10); // YYYY-MM-DD UTC
    const drawdownTier = drawdownToTier(snapshot.drawdownPct);

    try {
      const last = await getWorkerState<{
        day: string;
        commit: string;
        positions: number;
        drawdownTier: DrawdownTier;
        walletUSD: number;
        at: number;
      }>(BOOT_DEDUPE_KEY).catch(() => null);

      const persist = async () =>
        setWorkerState(BOOT_DEDUPE_KEY, {
          day: today,
          commit: snapshot.gitSha,
          positions: snapshot.openPositionCount,
          drawdownTier,
          walletUSD: snapshot.walletValueUSD,
          at: now.getTime(),
        }).catch(() => undefined);

      if (last) {
        const sameDay = last.day === today;
        const positionsChanged = last.positions !== snapshot.openPositionCount;
        const tierChanged = last.drawdownTier !== drawdownTier;
        const bigWalletSwing = Math.abs(last.walletUSD - snapshot.walletValueUSD) > 5;

        // Suppress: same day AND no material state change.
        if (sameDay && !positionsChanged && !tierChanged && !bigWalletSwing) {
          await persist();
          return;
        }
      }

      await persist();
    } catch {
      // worker_state read failures should NEVER suppress a legit alert — fall
      // through to fire as before.
    }
    const text = this.fmtBoot(snapshot);
    this.markSent('boot');
    this.fire(text);
  }

  /** ERC-8183 job submission hook fired from agenticCommerce after submit ok. */
  async notifyErc8183JobSubmitted(payload: Erc8183JobSubmittedPayload): Promise<void> {
    if (!this.canSend('erc8183_job_submitted')) return;
    const text = this.fmtErc8183Job(payload);
    this.markSent('erc8183_job_submitted');
    this.fire(text);
  }

  private onEvent(event: SSEEvent): void {
    try {
      switch (event.type) {
        case 'position_update':
          this.handlePositionUpdate(event.data as PositionUpdateLike);
          return;
        case 'committee_session_complete':
          this.handleCommitteeSession(event.data as CommitteeSessionLike);
          return;
        case 'regime_change':
          this.handleRegimeChange(event.data as RegimeChangeLike);
          return;
        case 'health_degradation':
          this.handleHealth(event.data as HealthDegradationLike);
          return;
        case 'agent_status_snapshot':
          this.handleStatusSnapshot(event.data as AgentStatusLike);
          return;
        case 'perception_event':
        case 'metrics_update':
        case 'committee_session_started':
          return;
      }
    } catch (err) {
      console.error(
        '[tg-alerter] onEvent threw:',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  private handlePositionUpdate(p: PositionUpdateLike): void {
    if (!p) return;

    // Probe-trade events have shape `{kind:'probe_trade', forward, reverse}`
    // — no tokenSymbol, no sizeUSD, no status. Rendering them through
    // fmtPositionOpen produces useless "OPEN LONG unknown $0.00" spam.
    // Render them as their own thing OR drop them entirely (operator can
    // verify probe trades via BscScan; we don't need them in Telegram).
    if (p.kind === 'probe_trade') {
      // Skip — compliance probes are not high-signal trades.
      return;
    }

    // Defensive filter: a real position open MUST have a token symbol AND a
    // positive size. Without both, the message degrades to "OPEN LONG
    // unknown $0.00" which is misleading.
    const isClose = p.status === 'closed';
    if (!isClose && (!p.tokenSymbol || !p.sizeUSD || p.sizeUSD <= 0)) {
      console.warn(
        `[tg-alerter] dropping malformed position_update: tokenSymbol=${p.tokenSymbol ?? 'null'} sizeUSD=${p.sizeUSD ?? 0}`,
      );
      return;
    }

    const text = isClose ? this.fmtPositionClose(p) : this.fmtPositionOpen(p);
    // position_update is exempt from the 30s floor every open/close is unique
    // and high-signal. Still touch lastSentAt for observability.
    this.markSent('position_update');
    this.fire(text);
  }

  private handleCommitteeSession(s: CommitteeSessionLike): void {
    if (!this.canSend('committee_session_complete')) return;
    const text = this.fmtCommitteeRedacted(s);
    this.markSent('committee_session_complete');
    this.fire(text);
  }

  private handleRegimeChange(r: RegimeChangeLike): void {
    if (!this.canSend('regime_change')) return;
    const text = this.fmtRegimeChange(r);
    this.markSent('regime_change');
    this.fire(text);
  }

  private handleHealth(h: HealthDegradationLike): void {
    if (!this.canSend('health_degradation')) return;
    const dedupeKey = `${h.source ?? 'unknown'}|${(h.message ?? '').slice(0, HEALTH_MESSAGE_TRUNCATE)}`;
    const now = Date.now();
    this.healthDedupe = this.healthDedupe.filter((e) => now - e.sentAt < HEALTH_DEDUPE_WINDOW_MS);
    if (this.healthDedupe.some((e) => e.key === dedupeKey)) return;
    this.healthDedupe.push({ key: dedupeKey, sentAt: now });
    const text = this.fmtHealth(h);
    this.markSent('health_degradation');
    this.fire(text);
  }

  private handleStatusSnapshot(s: AgentStatusLike): void {
    const drawdownPct = typeof s?.drawdownPct === 'number' ? s.drawdownPct : null;
    if (drawdownPct === null) return;
    const nextTier = drawdownToTier(drawdownPct);
    if (nextTier === this.lastDrawdownTier) return;
    if (!this.canSend('drawdown_tier_change')) return;
    const prev = this.lastDrawdownTier;
    this.lastDrawdownTier = nextTier;
    const text = this.fmtDrawdownTier(prev, nextTier, drawdownPct);
    this.markSent('drawdown_tier_change');
    this.fire(text);
  }

  private canSend(key: AlertKey): boolean {
    if (!this.client) return false;
    if (key === 'position_update') return true;
    const last = this.lastSentAt.get(key) ?? 0;
    return Date.now() - last >= RATE_LIMIT_MS;
  }

  private markSent(key: AlertKey): void {
    this.lastSentAt.set(key, Date.now());
  }

  private fire(text: string): void {
    if (!this.client) return;
    void this.client.sendMessage(text).catch((err) => {
      console.error(
        '[tg-alerter] sendMessage threw:',
        err instanceof Error ? err.message : String(err),
      );
    });
  }

  // -------- formatters (MarkdownV2) --------

  private fmtBoot(s: BootSnapshot): string {
    const walletLine = s.walletValueUSD > 0
      ? `_wallet_: ${escapeMarkdownV2(`$${s.walletValueUSD.toFixed(2)}`)} \\(${escapeMarkdownV2(String(s.walletNonStableHoldings))} non\\-stable\\)`
      : `_wallet_: ${escapeMarkdownV2('pending first cycle')}`;
    return [
      `*NeuroDegen V2 online*`,
      `_regime_: ${escapeMarkdownV2(s.regime)}`,
      walletLine,
      `_open positions_: ${escapeMarkdownV2(String(s.openPositionCount))}`,
      `_drawdown_: ${escapeMarkdownV2(formatPct(s.drawdownPct))}`,
      `_commit_: \`${escapeMarkdownV2(s.gitSha)}\``,
    ].join('\n');
  }

  private fmtCommitteeRedacted(s: CommitteeSessionLike): string {
    const action = (s.finalAction?.action ?? 'unknown').toUpperCase();
    const token = s.finalAction?.tokenSymbol ?? 'none';
    const conviction = s.finalAction?.confidence ?? 0;
    const sessionShort = (s.sessionId ?? '').slice(0, 8);
    return [
      `*Committee* ${escapeMarkdownV2(action)} *${escapeMarkdownV2(token)}*`,
      `_conviction_: ${escapeMarkdownV2(conviction.toFixed(2))}`,
      `_session_: \`${escapeMarkdownV2(sessionShort)}\``,
    ].join('\n');
  }

  private fmtPositionOpen(p: PositionUpdateLike): string {
    const side = (p.direction ?? 'long').toUpperCase();
    const token = p.tokenSymbol ?? 'unknown';
    const size = formatUSD(p.sizeUSD);
    const entry = formatUSD(p.entryPriceUSD);
    const tp = p.tpPriceUSD != null ? formatUSD(p.tpPriceUSD) : '-';
    const sl = p.slPriceUSD != null ? formatUSD(p.slPriceUSD) : '-';
    const txUrl = p.twakTxHash ? `https://bscscan.com/tx/${p.twakTxHash}` : null;
    const lines = [
      `*OPEN* ${escapeMarkdownV2(side)} *${escapeMarkdownV2(token)}*`,
      `_size_: ${escapeMarkdownV2(`$${size}`)} @ ${escapeMarkdownV2(`$${entry}`)}`,
      `_tp_ / _sl_: ${escapeMarkdownV2(`$${tp}`)} / ${escapeMarkdownV2(`$${sl}`)}`,
    ];
    if (txUrl) lines.push(`[tx](${escapeLinkUrl(txUrl)})`);
    return lines.join('\n');
  }

  private fmtPositionClose(p: PositionUpdateLike): string {
    const side = (p.direction ?? 'long').toUpperCase();
    const token = p.tokenSymbol ?? 'unknown';
    const pnlPct = p.pnlPct ?? 0;
    const pnlUSD = p.pnlUSD ?? 0;
    const sign = pnlPct >= 0 ? '+' : '-';
    const pnlPctAbs = Math.abs(pnlPct).toFixed(2);
    const pnlUSDAbs = Math.abs(pnlUSD).toFixed(2);
    const reason = p.exitReason ?? 'unknown';
    const txUrl = p.twakTxHash ? `https://bscscan.com/tx/${p.twakTxHash}` : null;
    const lines = [
      `*CLOSE* ${escapeMarkdownV2(side)} *${escapeMarkdownV2(token)}*`,
      `_pnl_: ${escapeMarkdownV2(`${sign}${pnlPctAbs}%`)} \\(${escapeMarkdownV2(`${sign}$${pnlUSDAbs}`)}\\)`,
      `_reason_: ${escapeMarkdownV2(reason)}`,
    ];
    if (txUrl) lines.push(`[tx](${escapeLinkUrl(txUrl)})`);
    return lines.join('\n');
  }

  private fmtRegimeChange(r: RegimeChangeLike): string {
    const from = r.from ?? 'unknown';
    const to = r.to ?? 'unknown';
    const rationale = (r.rationale ?? '').slice(0, REGIME_RATIONALE_TRUNCATE);
    return [
      `*Regime shift*: ${escapeMarkdownV2(from)} → ${escapeMarkdownV2(to)}`,
      `_rationale_: ${escapeMarkdownV2(rationale)}`,
    ].join('\n');
  }

  private fmtDrawdownTier(prev: DrawdownTier, next: DrawdownTier, pct: number): string {
    const policy = drawdownPolicyNote(next);
    return [
      `*Drawdown tier*: ${escapeMarkdownV2(prev)} → ${escapeMarkdownV2(next)}`,
      `_drawdown_: ${escapeMarkdownV2(formatPct(pct))}`,
      `_policy_: ${escapeMarkdownV2(policy)}`,
    ].join('\n');
  }

  private fmtErc8183Job(j: Erc8183JobSubmittedPayload): string {
    const jobIdShort = j.jobId.length > 16 ? j.jobId.slice(0, 16) : j.jobId;
    return [
      `*ERC\\-8183 job* \`${escapeMarkdownV2(jobIdShort)}\``,
      `_service_: ${escapeMarkdownV2(j.serviceName)}`,
      `_cost_: ${escapeMarkdownV2(`$${j.costUSD.toFixed(4)}`)}`,
      `_status_: submitted`,
    ].join('\n');
  }

  private fmtHealth(h: HealthDegradationLike): string {
    const source = h.source ?? 'unknown';
    const message = (h.message ?? '').slice(0, HEALTH_RENDERED_TRUNCATE);
    return [
      `⚠️ *Health*: ${escapeMarkdownV2(source)}`,
      `\`${escapeMarkdownV2(message)}\``,
    ].join('\n');
  }
}

function drawdownToTier(pct: number): DrawdownTier {
  // Drawdown values are reported as a fraction (0.05 = 5%) per riskManager.
  if (pct >= DRAWDOWN_HALT_PCT) return 'halt';
  if (pct >= DRAWDOWN_DEFENSIVE_PCT) return 'defensive';
  if (pct >= DRAWDOWN_ALERT_PCT) return 'alert';
  return 'normal';
}

function drawdownPolicyNote(tier: DrawdownTier): string {
  switch (tier) {
    case 'alert':
      return 'Position sizing reduced 50%';
    case 'defensive':
      return 'New entries paused; flatten on signal';
    case 'halt':
      return 'All execution halted';
    case 'normal':
      return 'Normal sizing restored';
  }
}

function formatPct(fraction: number): string {
  if (!Number.isFinite(fraction)) return '0.00%';
  return `${(fraction * 100).toFixed(2)}%`;
}

function formatUSD(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(n)) return '0.00';
  return n.toFixed(2);
}

/** Inside link parens only `)` and `\` are reserved per MarkdownV2 spec. */
function escapeLinkUrl(url: string): string {
  return url.replace(/\\/g, '\\\\').replace(/\)/g, '\\)');
}

export const telegramAlerter = new TelegramAlerter();
