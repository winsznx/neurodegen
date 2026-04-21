import { randomBytes } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/clients/supabase';
import type {
  TelegramLinkToken,
  TelegramPreferences,
  TelegramSubscription,
} from '@/types/telegram';
import { DEFAULT_TELEGRAM_PREFERENCES } from '@/types/telegram';

const TOKEN_TTL_MS = 10 * 60 * 1000;

interface TokenRow {
  token: string;
  user_id: string;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
}

interface SubscriptionRow {
  subscription_id: string;
  user_id: string;
  chat_id: number | string;
  username: string | null;
  first_name: string | null;
  language_code: string | null;
  preferences: Partial<TelegramPreferences> | null;
  linked_at: string;
  last_message_at: string | null;
  unlinked_at: string | null;
}

function tokenFromRow(row: TokenRow): TelegramLinkToken {
  return {
    token: row.token,
    userId: row.user_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
  };
}

function subFromRow(row: SubscriptionRow): TelegramSubscription {
  return {
    subscriptionId: row.subscription_id,
    userId: row.user_id,
    chatId: String(row.chat_id),
    username: row.username,
    firstName: row.first_name,
    languageCode: row.language_code,
    preferences: { ...DEFAULT_TELEGRAM_PREFERENCES, ...(row.preferences ?? {}) },
    linkedAt: row.linked_at,
    lastMessageAt: row.last_message_at,
    unlinkedAt: row.unlinked_at,
  };
}

function generateToken(): string {
  return randomBytes(24).toString('base64url');
}

export async function createLinkToken(userId: string): Promise<TelegramLinkToken> {
  const token = generateToken();
  const now = Date.now();
  const { error } = await getSupabaseAdmin()
    .schema('neurodegen')
    .from('telegram_link_tokens')
    .insert({
      token,
      user_id: userId,
      expires_at: new Date(now + TOKEN_TTL_MS).toISOString(),
    });
  if (error) throw new Error(`Failed to create link token: ${error.message}`);
  return {
    token,
    userId,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + TOKEN_TTL_MS).toISOString(),
    consumedAt: null,
  };
}

export async function consumeLinkToken(token: string): Promise<TelegramLinkToken | null> {
  const { data, error } = await getSupabaseAdmin()
    .schema('neurodegen')
    .from('telegram_link_tokens')
    .select('*')
    .eq('token', token)
    .is('consumed_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error) throw new Error(`Failed to look up link token: ${error.message}`);
  if (!data) return null;

  const row = data as TokenRow;
  const { error: updateErr } = await getSupabaseAdmin()
    .schema('neurodegen')
    .from('telegram_link_tokens')
    .update({ consumed_at: new Date().toISOString() })
    .eq('token', token)
    .is('consumed_at', null);
  if (updateErr) throw new Error(`Failed to consume link token: ${updateErr.message}`);

  return tokenFromRow(row);
}

export interface UpsertTelegramSubscriptionInput {
  userId: string;
  chatId: string | number;
  username: string | null;
  firstName: string | null;
  languageCode: string | null;
}

export async function upsertTelegramSubscription(
  input: UpsertTelegramSubscriptionInput
): Promise<TelegramSubscription> {
  const { data, error } = await getSupabaseAdmin()
    .schema('neurodegen')
    .from('telegram_subscriptions')
    .upsert(
      {
        user_id: input.userId,
        chat_id: Number(input.chatId),
        username: input.username,
        first_name: input.firstName,
        language_code: input.languageCode,
        unlinked_at: null,
      },
      { onConflict: 'user_id' }
    )
    .select('*')
    .single();

  if (error) throw new Error(`Failed to upsert telegram subscription: ${error.message}`);
  return subFromRow(data as SubscriptionRow);
}

export async function getTelegramSubscriptionByUserId(
  userId: string
): Promise<TelegramSubscription | null> {
  const { data, error } = await getSupabaseAdmin()
    .schema('neurodegen')
    .from('telegram_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .is('unlinked_at', null)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch telegram subscription: ${error.message}`);
  return data ? subFromRow(data as SubscriptionRow) : null;
}

export async function getTelegramSubscriptionByChatId(
  chatId: string | number
): Promise<TelegramSubscription | null> {
  const { data, error } = await getSupabaseAdmin()
    .schema('neurodegen')
    .from('telegram_subscriptions')
    .select('*')
    .eq('chat_id', Number(chatId))
    .is('unlinked_at', null)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch telegram subscription: ${error.message}`);
  return data ? subFromRow(data as SubscriptionRow) : null;
}

export async function updateTelegramPreferences(
  userId: string,
  preferences: Partial<TelegramPreferences>
): Promise<TelegramSubscription> {
  const existing = await getTelegramSubscriptionByUserId(userId);
  const merged = { ...(existing?.preferences ?? DEFAULT_TELEGRAM_PREFERENCES), ...preferences };

  const { data, error } = await getSupabaseAdmin()
    .schema('neurodegen')
    .from('telegram_subscriptions')
    .update({ preferences: merged })
    .eq('user_id', userId)
    .is('unlinked_at', null)
    .select('*')
    .single();

  if (error) throw new Error(`Failed to update telegram preferences: ${error.message}`);
  return subFromRow(data as SubscriptionRow);
}

export async function unlinkTelegramSubscription(userId: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .schema('neurodegen')
    .from('telegram_subscriptions')
    .update({ unlinked_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('unlinked_at', null);

  if (error) throw new Error(`Failed to unlink telegram subscription: ${error.message}`);
}

export async function touchLastMessage(chatId: string | number): Promise<void> {
  await getSupabaseAdmin()
    .schema('neurodegen')
    .from('telegram_subscriptions')
    .update({ last_message_at: new Date().toISOString() })
    .eq('chat_id', Number(chatId));
}

export async function listActiveTelegramSubscriptions(): Promise<TelegramSubscription[]> {
  const { data, error } = await getSupabaseAdmin()
    .schema('neurodegen')
    .from('telegram_subscriptions')
    .select('*')
    .is('unlinked_at', null);
  if (error) throw new Error(`Failed to list telegram subscriptions: ${error.message}`);
  return (data ?? []).map((row) => subFromRow(row as SubscriptionRow));
}
