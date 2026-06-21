/**
 * One-off: clear the probe_scheduler/v1 row in worker_state so the next
 * agent cycle re-attempts today's probe trade. Use when a stale
 * lastProbeDay (e.g. set during a DRY_RUN-on window) is blocking a real
 * probe from firing.
 *
 * Run:
 *   railway run --service neurodegen -- pnpm exec tsx scripts/clearProbeState.ts
 *
 * Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from env (injected by
 * `railway run`).
 */
import { createClient } from '@supabase/supabase-js';

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing');
    process.exit(1);
  }
  const client = createClient(url, key);
  const KEY = 'probe_scheduler/v1';

  const { data: before } = await client
    .schema('neurodegen')
    .from('worker_state')
    .select('value, updated_at')
    .eq('key', KEY)
    .maybeSingle();
  console.warn('[clear-probe] before:', JSON.stringify(before));

  const { error } = await client
    .schema('neurodegen')
    .from('worker_state')
    .upsert(
      { key: KEY, value: { lastProbeDay: null }, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    );
  if (error) {
    console.error('[clear-probe] upsert failed:', error.message);
    process.exit(1);
  }

  const { data: after } = await client
    .schema('neurodegen')
    .from('worker_state')
    .select('value, updated_at')
    .eq('key', KEY)
    .maybeSingle();
  console.warn('[clear-probe] after: ', JSON.stringify(after));
  console.warn('[clear-probe] done. Next cycle will re-attempt the probe.');
}

void main().catch((err) => {
  console.error('[clear-probe] fatal:', err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
