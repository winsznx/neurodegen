import { NextResponse } from 'next/server';
import { getRecentSessions } from '@/lib/queries/sessions';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') ?? '20', 10), 1), 100);
  try {
    const sessions = await getRecentSessions(limit);
    return NextResponse.json({ sessions });
  } catch (err) {
    return NextResponse.json(
      { sessions: [], error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
