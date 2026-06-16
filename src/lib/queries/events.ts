import type { PerceptionEvent } from '@/types/perception';
import { getSupabaseAdmin, getSupabaseClient } from '@/lib/clients/supabase';

interface PerceptionEventRow {
  event_id: string;
  source: string;
  event_type: string;
  timestamp: number;
  payload: Record<string, unknown>;
  created_at: string;
}

function toRow(event: PerceptionEvent): Record<string, unknown> {
  const { eventId, source, eventType, timestamp, ...rest } = event as unknown as {
    eventId: string;
    source: string;
    eventType: string;
    timestamp: number;
  } & Record<string, unknown>;
  return {
    event_id: eventId,
    source,
    event_type: eventType,
    timestamp,
    payload: rest,
  };
}

function fromRow(row: PerceptionEventRow): PerceptionEvent {
  return {
    eventId: row.event_id,
    source: row.source,
    eventType: row.event_type,
    timestamp: row.timestamp,
    ...row.payload,
  } as PerceptionEvent;
}

export async function insertEventBatch(events: PerceptionEvent[]): Promise<void> {
  if (events.length === 0) return;
  const { error } = await getSupabaseAdmin()
    .schema('neurodegen')
    .from('events')
    .insert(events.map(toRow));
  if (error) throw new Error(`insertEventBatch failed: ${error.message}`);
}

export async function getRecentEventsBySource(
  source: PerceptionEvent['source'],
  limit: number,
): Promise<PerceptionEvent[]> {
  const { data, error } = await getSupabaseClient()
    .schema('neurodegen')
    .from('events')
    .select('*')
    .eq('source', source)
    .order('timestamp', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`getRecentEventsBySource failed: ${error.message}`);
  return ((data as PerceptionEventRow[] | null) ?? []).map(fromRow);
}
