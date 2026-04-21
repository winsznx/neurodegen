import { NextResponse } from 'next/server';
import { agentLoop } from '@/lib/services/agentLoop';

export async function GET() {
  const status = agentLoop.getStatus();
  return NextResponse.json({
    status: status.running ? 'running' : 'stopped',
    lastCycleAt: status.lastCycleAt,
    openPositions: status.openPositionCount,
    regime: status.currentRegime,
    cycleCount: status.cycleCount,
    connectedClients: status.connectedSSEClients,
  });
}
