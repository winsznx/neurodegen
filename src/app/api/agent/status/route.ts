import { NextResponse } from 'next/server';
import { fetchWorkerStatusRaw } from '@/lib/services/workerAdminProxy';

export const dynamic = 'force-dynamic';

export async function GET() {
  const resolved = await fetchWorkerStatusRaw();
  if (resolved.ok) {
    return NextResponse.json({ status: 'running', ...(resolved.status as Record<string, unknown>) });
  }
  return NextResponse.json(
    { status: 'stopped', cycleCount: 0, error: resolved.detail, code: resolved.code },
    { status: 200 },
  );
}
