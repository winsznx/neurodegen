import { getSupabaseAdmin } from '@/lib/clients/supabase';
import type { UserRecord } from '@/types/users';

interface UserRow {
  user_id: string;
  privy_id: string;
  wallet_address: string;
  wallet_id: string | null;
  email: string | null;
  display_name: string | null;
  created_at: string;
  last_seen_at: string;
}

function fromRow(row: UserRow): UserRecord {
  return {
    userId: row.user_id,
    privyId: row.privy_id,
    walletAddress: row.wallet_address as `0x${string}`,
    walletId: row.wallet_id,
    email: row.email,
    displayName: row.display_name,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
  };
}

export async function upsertUser(input: {
  privyId: string;
  walletAddress: `0x${string}`;
  walletId?: string | null;
  email?: string | null;
  displayName?: string | null;
}): Promise<UserRecord> {
  const patch: Record<string, unknown> = {
    privy_id: input.privyId,
    wallet_address: input.walletAddress,
    email: input.email ?? null,
    display_name: input.displayName ?? null,
    last_seen_at: new Date().toISOString(),
  };
  if (input.walletId !== undefined) patch.wallet_id = input.walletId;

  const { data, error } = await getSupabaseAdmin()
    .schema('neurodegen')
    .from('users')
    .upsert(patch, { onConflict: 'privy_id' })
    .select('*')
    .single();

  if (error) throw new Error(`Failed to upsert user: ${error.message}`);
  return fromRow(data as UserRow);
}

export async function getUserByPrivyId(privyId: string): Promise<UserRecord | null> {
  const { data, error } = await getSupabaseAdmin()
    .schema('neurodegen')
    .from('users')
    .select('*')
    .eq('privy_id', privyId)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch user: ${error.message}`);
  return data ? fromRow(data as UserRow) : null;
}

export async function getUserById(userId: string): Promise<UserRecord | null> {
  const { data, error } = await getSupabaseAdmin()
    .schema('neurodegen')
    .from('users')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch user: ${error.message}`);
  return data ? fromRow(data as UserRow) : null;
}

export async function touchLastSeen(userId: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .schema('neurodegen')
    .from('users')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('user_id', userId);

  if (error) throw new Error(`Failed to touch last_seen_at: ${error.message}`);
}
