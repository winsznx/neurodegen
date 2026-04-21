import { NextResponse } from 'next/server';
import { agentLoop } from '@/lib/services/agentLoop';
import { getLatestMetrics } from '@/lib/queries/metrics';

export async function GET() {
  const status = agentLoop.getStatus();

  let databaseHealthy = false;
  try {
    await getLatestMetrics();
    databaseHealthy = true;
  } catch {
    databaseHealthy = false;
  }

  const services = {
    perception: status.perceptionHealthy,
    cognition: status.cognitionHealthy,
    execution: status.executionHealthy,
    database: databaseHealthy,
  };

  const healthy = Object.values(services).every(Boolean);

  return NextResponse.json({ healthy, services });
}
