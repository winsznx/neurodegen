import type { AggregateMetrics } from '@/types/perception';
import { getSupabaseAdmin, getSupabaseClient } from '@/lib/clients/supabase';

interface MetricRow {
  metric_id: string;
  computed_at: string;
  payload: AggregateMetrics;
}

export async function insertMetrics(metrics: AggregateMetrics): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .schema('neurodegen')
    .from('metrics')
    .insert({ payload: metrics });
  if (error) throw new Error(`insertMetrics failed: ${error.message}`);
}

export async function getLatestMetrics(): Promise<AggregateMetrics | null> {
  const { data, error } = await getSupabaseClient()
    .schema('neurodegen')
    .from('metrics')
    .select('*')
    .order('computed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getLatestMetrics failed: ${error.message}`);
  return (data as MetricRow | null)?.payload ?? null;
}

export async function getPeakPortfolioValueUSD(sinceMs: number): Promise<number | null> {
  const { data, error } = await getSupabaseClient()
    .schema('neurodegen')
    .from('metrics')
    .select('payload')
    .gte('computed_at', new Date(sinceMs).toISOString())
    .order('computed_at', { ascending: false })
    .limit(500);
  if (error) throw new Error(`getPeakPortfolioValueUSD failed: ${error.message}`);
  const rows = (data ?? []) as Array<{ payload: { peakPortfolioValueUSD?: number } }>;
  let peak: number | null = null;
  for (const row of rows) {
    const v = row.payload?.peakPortfolioValueUSD;
    if (typeof v === 'number' && (peak === null || v > peak)) peak = v;
  }
  return peak;
}
