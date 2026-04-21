import { NextResponse, type NextRequest } from 'next/server';
import { agentLoop } from '@/lib/services/agentLoop';

export async function POST(request: NextRequest) {
  const secret = request.headers.get('X-Admin-Secret');
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json(
      { error: 'Unauthorized', code: 'ADMIN_REQUIRED' },
      { status: 403 }
    );
  }

  const status = agentLoop.getStatus();
  if (status.running) {
    return NextResponse.json({ started: false, reason: 'Agent is already running' });
  }

  await agentLoop.start();
  return NextResponse.json({ started: true });
}
