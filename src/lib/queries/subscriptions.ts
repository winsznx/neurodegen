import { getSupabaseAdmin } from '@/lib/clients/supabase';
import type { Subscription } from '@/types/users';

interface SubscriptionRow {
  subscription_id: string;
  user_id: string;
  active: boolean;
  session_signer_granted: boolean;
  leverage_multiplier: number;
  max_position_usd: number;
  min_confidence: number;
  paused_until: string | null;
  created_at: string;
  updated_at: string;
}

function fromRow(row: SubscriptionRow): Subscription {
  return {
    subscriptionId: row.subscription_id,
    userId: row.user_id,
    active: row.active,
    sessionSignerGranted: row.session_signer_granted,
    leverageMultiplier: Number(row.leverage_multiplier),
    maxPositionUsd: Number(row.max_position_usd),
    minConfidence: Number(row.min_confidence),
    pausedUntil: row.paused_until,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function upsertSubscription(input: {
  userId: string;
  active?: boolean;
  sessionSignerGranted?: boolean;
  leverageMultiplier?: number;
  maxPositionUsd?: number;
  minConfidence?: number;
}): Promise<Subscription> {
  const patch: Record<string, unknown> = { user_id: input.userId };
  if (input.active !== undefined) patch.active = input.active;
  if (input.sessionSignerGranted !== undefined) patch.session_signer_granted = input.sessionSignerGranted;
  if (input.leverageMultiplier !== undefined) patch.leverage_multiplier = input.leverageMultiplier;
  if (input.maxPositionUsd !== undefined) patch.max_position_usd = input.maxPositionUsd;
  if (input.minConfidence !== undefined) patch.min_confidence = input.minConfidence;

  const { data, error } = await getSupabaseAdmin()
    .schema('neurodegen')
    .from('subscriptions')
    .upsert(patch, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error) throw new Error(`Failed to upsert subscription: ${error.message}`);
  return fromRow(data as SubscriptionRow);
}

export async function getSubscriptionByUserId(userId: string): Promise<Subscription | null> {
  const { data, error } = await getSupabaseAdmin()
    .schema('neurodegen')
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch subscription: ${error.message}`);
  return data ? fromRow(data as SubscriptionRow) : null;
}

export async function getActiveSubscriptions(): Promise<Subscription[]> {
  const { data, error } = await getSupabaseAdmin()
    .schema('neurodegen')
    .from('subscriptions')
    .select('*')
    .eq('active', true)
    .eq('session_signer_granted', true);

  if (error) throw new Error(`Failed to fetch active subscriptions: ${error.message}`);
  const rows = (data ?? []) as SubscriptionRow[];
  const now = Date.now();
  return rows
    .filter((r) => !r.paused_until || new Date(r.paused_until).getTime() < now)
    .map(fromRow);
}

export async function pauseSubscription(userId: string, pausedUntil: string | null): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .schema('neurodegen')
    .from('subscriptions')
    .update({ paused_until: pausedUntil })
    .eq('user_id', userId);

  if (error) throw new Error(`Failed to pause subscription: ${error.message}`);
}
