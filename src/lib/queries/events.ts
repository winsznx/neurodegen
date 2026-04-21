import { getSupabaseAdmin, getSupabaseClient } from '@/lib/clients/supabase';
import { EVENT_BATCH_SIZE } from '@/config/perception';
import type { PerceptionEvent } from '@/types/perception';

function serializeEvent(event: PerceptionEvent): Record<string, unknown> {
  return {
    event_id: event.eventId,
    source: event.source,
    event_type: event.eventType,
    timestamp: event.timestamp,
    block_number: event.blockNumber,
    raw_hash: event.rawHash,
    payload: JSON.parse(
      JSON.stringify(event, (_key, value) =>
        typeof value === 'bigint' ? value.toString() : value
      )
    ),
  };
}

export async function insertEvent(event: PerceptionEvent): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .schema('neurodegen')
    .from('events')
    .insert(serializeEvent(event));

  if (error) throw new Error(`Failed to insert event: ${error.message}`);
}

export async function insertEventBatch(events: PerceptionEvent[]): Promise<void> {
  for (let i = 0; i < events.length; i += EVENT_BATCH_SIZE) {
    const chunk = events.slice(i, i + EVENT_BATCH_SIZE);
    const rows = chunk.map(serializeEvent);

    const { error } = await getSupabaseAdmin()
      .schema('neurodegen')
      .from('events')
      .insert(rows);

    if (error) throw new Error(`Failed to insert event batch: ${error.message}`);
  }
}

export async function getRecentEvents(
  limit: number,
  source?: string
): Promise<PerceptionEvent[]> {
  let query = getSupabaseClient()
    .schema('neurodegen')
    .from('events')
    .select('payload')
    .order('timestamp', { ascending: false })
    .limit(limit);

  if (source) {
    query = query.eq('source', source);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch events: ${error.message}`);

  return (data ?? []).map(
    (row: { payload: PerceptionEvent }) => row.payload
  );
}
