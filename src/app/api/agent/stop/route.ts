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

  await agentLoop.stop();
  return NextResponse.json({ stopped: true });
}
