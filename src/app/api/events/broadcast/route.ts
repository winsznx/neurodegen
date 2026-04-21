import { NextResponse, type NextRequest } from 'next/server';
import { realtimeService, type SSEEvent, type SSEEventType } from '@/lib/services/realtimeService';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const VALID_TYPES: SSEEventType[] = [
  'perception_event',
  'metrics_update',
  'regime_change',
  'reasoning_complete',
  'position_update',
  'health_degradation',
  'telegram_linked',
];

function isSSEEvent(value: unknown): value is SSEEvent {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { type?: unknown; timestamp?: unknown };
  return (
    typeof candidate.type === 'string' &&
    VALID_TYPES.includes(candidate.type as SSEEventType) &&
    typeof candidate.timestamp === 'number'
  );
}

export async function POST(request: NextRequest) {
  const secret = request.headers.get('X-Admin-Secret');
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json(
      { error: 'Unauthorized', code: 'ADMIN_REQUIRED' },
      { status: 403 }
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'invalid JSON body', code: 'INVALID_BODY' },
      { status: 400 }
    );
  }

  if (!isSSEEvent(payload)) {
    return NextResponse.json(
      { error: 'invalid event shape', code: 'INVALID_EVENT' },
      { status: 400 }
    );
  }

  realtimeService.receiveFromWorker(payload);
  return NextResponse.json({ relayed: true, type: payload.type });
}
