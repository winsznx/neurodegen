import { NextResponse, type NextRequest } from 'next/server';
import { agentLoop } from '@/lib/services/agentLoop';
import { getPositionById } from '@/lib/queries/positions';

const OPEN_STATES = new Set(['submitted', 'pending', 'filled', 'managed']);

function unauthorized() {
  return NextResponse.json(
    { error: 'Unauthorized', code: 'ADMIN_REQUIRED' },
    { status: 403 }
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ positionId: string }> }
) {
  const secret = request.headers.get('X-Admin-Secret');
  if (!secret || secret !== process.env.ADMIN_SECRET) return unauthorized();

  const { positionId } = await params;
  if (!/^[0-9a-fA-F-]{36}$/.test(positionId)) {
    return NextResponse.json({ error: 'invalid position id', code: 'BAD_REQUEST' }, { status: 400 });
  }

  const position = await getPositionById(positionId).catch(() => null);
  if (!position) {
    return NextResponse.json({ error: 'position not found', code: 'NOT_FOUND' }, { status: 404 });
  }
  if (!OPEN_STATES.has(position.status)) {
    return NextResponse.json(
      { error: `position is ${position.status}, not closeable`, code: 'BAD_STATE' },
      { status: 409 }
    );
  }

  const gateway = agentLoop.getExecutionGateway();
  if (!gateway) {
    return NextResponse.json(
      { error: 'execution gateway not initialized — is ENABLE_EXECUTION=true and agent running?', code: 'GATEWAY_UNAVAILABLE' },
      { status: 503 }
    );
  }

  const result = await gateway.closeSinglePosition(position, 'manual');
  if (!result.closed) {
    return NextResponse.json(
      { closed: false, error: result.error ?? 'close failed', code: 'CLOSE_FAILED' },
      { status: 500 }
    );
  }

  return NextResponse.json({ closed: true, positionId, txHash: result.txHash });
}
