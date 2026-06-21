import { getSupabaseAdmin } from '@/lib/clients/supabase';

/**
 * Tiny key/value store for worker singletons that need to survive restart.
 *
 * Currently used by the probe-trade scheduler (`lastProbeDay`) so a worker
 * crash between 00:00 UTC and the daily probe window can't cause two
 * probes to fire the same day. Other restart-sensitive scheduler state
 * should land here too - one row per key, no migrations needed.
 */
export async function getWorkerState<T>(key: string): Promise<T | null> {
  const { data, error } = await getSupabaseAdmin()
    .schema('neurodegen')
    .from('worker_state')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  if (error) throw new Error(`getWorkerState(${key}) failed: ${error.message}`);
  return data ? ((data as { value: T }).value) : null;
}

export async function setWorkerState<T>(key: string, value: T): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .schema('neurodegen')
    .from('worker_state')
    .upsert(
      {
        key,
        value: value as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' },
    );
  if (error) throw new Error(`setWorkerState(${key}) failed: ${error.message}`);
}
