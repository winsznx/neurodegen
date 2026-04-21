import { NextResponse } from 'next/server';
import { resolveAgentStatus } from '@/lib/services/workerStatusCache';

export const dynamic = 'force-dynamic';

export async function GET() {
  const resolved = await resolveAgentStatus();
  if (!resolved.status) {
    return NextResponse.json(
      {
        status: 'unknown',
        source: resolved.source,
        stale: true,
        reason: resolved.error,
      },
      { status: 503 }
    );
  }

  const s = resolved.status;
  return NextResponse.json({
    status: s.running ? 'running' : 'stopped',
    cycleCount: s.cycleCount,
    lastCycleAt: s.lastCycleAt,
    regime: s.currentRegime,
    openPositions: s.openPositionCount,
    connectedClients: s.connectedSSEClients,
    perceptionHealthy: s.perceptionHealthy,
    cognitionHealthy: s.cognitionHealthy,
    executionHealthy: s.executionHealthy,
    source: resolved.source,
    stale: resolved.stale,
    receivedAt: resolved.receivedAt,
  });
}
