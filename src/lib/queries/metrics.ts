import { getSupabaseAdmin, getSupabaseClient } from '@/lib/clients/supabase';
import type { AggregateMetrics } from '@/types/perception';

export async function insertMetrics(metrics: AggregateMetrics): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .schema('neurodegen')
    .from('metrics')
    .insert({
      computed_at: new Date(metrics.computedAt).toISOString(),
      payload: JSON.parse(
        JSON.stringify(metrics, (_key, value) =>
          typeof value === 'bigint' ? value.toString() : value
        )
      ),
    });

  if (error) throw new Error(`Failed to insert metrics: ${error.message}`);
}

export async function getLatestMetrics(): Promise<AggregateMetrics | null> {
  const { data, error } = await getSupabaseClient()
    .schema('neurodegen')
    .from('metrics')
    .select('payload')
    .order('computed_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code === 'PGRST116') return null;
  if (error) throw new Error(`Failed to fetch latest metrics: ${error.message}`);
  return data.payload as AggregateMetrics;
}
