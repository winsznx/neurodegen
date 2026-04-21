export interface TelegramLinkToken {
  token: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
}

export interface TelegramPreferences {
  mirror_opened: boolean;
  mirror_closed: boolean;
  mirror_skipped: boolean;
  health_alerts: boolean;
  agent_status: boolean;
  daily_summary: boolean;
}

export const DEFAULT_TELEGRAM_PREFERENCES: TelegramPreferences = {
  mirror_opened: true,
  mirror_closed: true,
  mirror_skipped: false,
  health_alerts: true,
  agent_status: true,
  daily_summary: true,
};

export interface TelegramSubscription {
  subscriptionId: string;
  userId: string;
  chatId: string;
  username: string | null;
  firstName: string | null;
  languageCode: string | null;
  preferences: TelegramPreferences;
  linkedAt: string;
  lastMessageAt: string | null;
  unlinkedAt: string | null;
}

export type NotificationChannel = 'telegram' | 'web_push';

export type NotificationStatus = 'sent' | 'failed' | 'skipped';

export interface NotificationLogEntry {
  notificationId: string;
  userId: string;
  channel: NotificationChannel;
  kind: string;
  payload: Record<string, unknown>;
  status: NotificationStatus;
  error: string | null;
  createdAt: string;
}
