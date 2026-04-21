import { NextResponse, type NextRequest } from 'next/server';
import { requireSession, UnauthorizedError } from '@/lib/auth/session';
import { getUserPositions } from '@/lib/queries/userPositions';

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const { searchParams } = request.nextUrl;
    const limit = Math.min(Number(searchParams.get('limit') ?? 50), 200);
    const positions = await getUserPositions(session.userId, limit);
    return NextResponse.json({ positions, total: positions.length });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'request failed', code: 'INTERNAL', detail: message }, { status: 500 });
  }
}
