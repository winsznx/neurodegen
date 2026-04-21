import { getTelegramBot } from '@/lib/clients/telegram';
import { getSupabaseAdmin } from '@/lib/clients/supabase';
import {
  getTelegramSubscriptionByUserId,
  listActiveTelegramSubscriptions,
} from '@/lib/queries/telegram';
import type { TelegramPreferences, TelegramSubscription } from '@/types/telegram';
import {
  formatMirrorOpenedTelegram,
  formatMirrorClosedTelegram,
  formatMirrorSkippedTelegram,
  formatHealthTelegram,
  formatAgentStatusTelegram,
  formatDailySummaryTelegram,
  type MirrorOpenedPayload,
  type MirrorClosedPayload,
  type MirrorSkippedPayload,
  type HealthPayload,
  type AgentStatusPayload,
  type DailySummaryPayload,
} from './formatters';

export type NotificationKind =
  | 'mirror_opened'
  | 'mirror_closed'
  | 'mirror_skipped'
  | 'health_alerts'
  | 'agent_status'
  | 'daily_summary';

type Envelope =
  | { kind: 'mirror_opened'; payload: MirrorOpenedPayload }
  | { kind: 'mirror_closed'; payload: MirrorClosedPayload }
  | { kind: 'mirror_skipped'; payload: MirrorSkippedPayload }
  | { kind: 'health_alerts'; payload: HealthPayload }
  | { kind: 'agent_status'; payload: AgentStatusPayload }
  | { kind: 'daily_summary'; payload: DailySummaryPayload };

type Status = 'sent' | 'failed' | 'skipped';

function formatFor(envelope: Envelope): string {
  switch (envelope.kind) {
    case 'mirror_opened': return formatMirrorOpenedTelegram(envelope.payload);
    case 'mirror_closed': return formatMirrorClosedTelegram(envelope.payload);
    case 'mirror_skipped': return formatMirrorSkippedTelegram(envelope.payload);
    case 'health_alerts': return formatHealthTelegram(envelope.payload);
    case 'agent_status': return formatAgentStatusTelegram(envelope.payload);
    case 'daily_summary': return formatDailySummaryTelegram(envelope.payload);
  }
}

function prefFor(envelope: Envelope): keyof TelegramPreferences {
  return envelope.kind;
}

async function logNotification(
  userId: string,
  kind: string,
  payload: unknown,
  status: Status,
  error: string | null
): Promise<void> {
  try {
    await getSupabaseAdmin()
      .schema('neurodegen')
      .from('notifications_log')
      .insert({
        user_id: userId,
        channel: 'telegram',
        kind,
        payload: payload as Record<string, unknown>,
        status,
        error,
      });
  } catch (err) {
    console.error('[notifications] failed to write log:', err instanceof Error ? err.message : String(err));
  }
}

async function sendToUser(
  sub: TelegramSubscription,
  envelope: Envelope
): Promise<Status> {
  const bot = getTelegramBot();
  if (!bot) return 'skipped';

  const pref = prefFor(envelope);
  if (sub.preferences[pref] === false) {
    void logNotification(sub.userId, envelope.kind, envelope.payload, 'skipped', 'user preference disabled');
    return 'skipped';
  }

  const text = formatFor(envelope);
  try {
    await bot.api.sendMessage(Number(sub.chatId), text, {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    });
    void logNotification(sub.userId, envelope.kind, envelope.payload, 'sent', null);
    return 'sent';
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[notifications] send to user ${sub.userId} failed:`, message);
    void logNotification(sub.userId, envelope.kind, envelope.payload, 'failed', message);
    return 'failed';
  }
}

export async function notifyUser(userId: string, envelope: Envelope): Promise<Status> {
  try {
    const sub = await getTelegramSubscriptionByUserId(userId);
    if (!sub) return 'skipped';
    return await sendToUser(sub, envelope);
  } catch (err) {
    console.error('[notifications] notifyUser failed:', err instanceof Error ? err.message : String(err));
    return 'failed';
  }
}

export async function broadcastToAll(envelope: Envelope): Promise<void> {
  try {
    const subs = await listActiveTelegramSubscriptions();
    await Promise.all(subs.map((sub) => sendToUser(sub, envelope)));
  } catch (err) {
    console.error('[notifications] broadcastToAll failed:', err instanceof Error ? err.message : String(err));
  }
}

export const notify = {
  mirrorOpened: (userId: string, payload: MirrorOpenedPayload) =>
    notifyUser(userId, { kind: 'mirror_opened', payload }),
  mirrorClosed: (userId: string, payload: MirrorClosedPayload) =>
    notifyUser(userId, { kind: 'mirror_closed', payload }),
  mirrorSkipped: (userId: string, payload: MirrorSkippedPayload) =>
    notifyUser(userId, { kind: 'mirror_skipped', payload }),
  health: (payload: HealthPayload) =>
    broadcastToAll({ kind: 'health_alerts', payload }),
  agentStatus: (payload: AgentStatusPayload) =>
    broadcastToAll({ kind: 'agent_status', payload }),
  dailySummaryForUser: (userId: string, payload: DailySummaryPayload) =>
    notifyUser(userId, { kind: 'daily_summary', payload }),
};
