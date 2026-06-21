/**
 * One-off: list + clean up phantom positions inserted today by a dry-run
 * probe, then clear the probe scheduler state so today's REAL probe can
 * re-fire.
 *
 * Use only when DRY_RUN_MODE was inadvertently true during a probe attempt
 * (synthetic tx hash got persisted, no real on-chain swap landed).
 *
 * Run:
 *   railway run --service neurodegen -- pnpm exec tsx scripts/resetTodayProbe.ts
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

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  // List today's positions for inspection.
  const { data: todayPositions, error: readErr } = await client
    .schema('neurodegen')
    .from('positions')
    .select('position_id, token_symbol, twak_tx_hash, status, opened_at, session_id')
    .gte('opened_at', todayStart.toISOString());
  if (readErr) {
    console.error('[reset-probe] read positions failed:', readErr.message);
    process.exit(1);
  }
  console.warn(`[reset-probe] positions opened since ${todayStart.toISOString()}: ${todayPositions?.length ?? 0}`);
  for (const p of todayPositions ?? []) {
    console.warn(`  - ${p.position_id} | ${p.token_symbol} | ${p.status} | tx=${p.twak_tx_hash} | sessionId=${p.session_id ?? 'null'}`);
  }

  if (!todayPositions || todayPositions.length === 0) {
    console.warn('[reset-probe] nothing to clean. Just clearing probe state.');
  } else {
    // Delete only the probe-tagged positions (sessionId=null indicates a
    // probe trade per Q.1 fix; committee positions always have a real UUID).
    const probeIds = todayPositions.filter((p) => p.session_id === null).map((p) => p.position_id);
    console.warn(`[reset-probe] probe-phantom rows to delete: ${probeIds.length}`);
    if (probeIds.length > 0) {
      const { error: delErr } = await client
        .schema('neurodegen')
        .from('positions')
        .delete()
        .in('position_id', probeIds);
      if (delErr) {
        console.error('[reset-probe] delete failed:', delErr.message);
        process.exit(1);
      }
      console.warn(`[reset-probe] deleted ${probeIds.length} phantom rows`);
    }
  }

  // Reset probe scheduler.
  const { error: stateErr } = await client
    .schema('neurodegen')
    .from('worker_state')
    .upsert(
      {
        key: 'probe_scheduler/v1',
        value: { lastProbeDay: null },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' },
    );
  if (stateErr) {
    console.error('[reset-probe] state reset failed:', stateErr.message);
    process.exit(1);
  }
  console.warn('[reset-probe] probe state cleared.');
  console.warn('[reset-probe] DONE. Next cycle will re-attempt the probe with real on-chain trades.');
}

void main().catch((err) => {
  console.error('[reset-probe] fatal:', err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
