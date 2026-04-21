import { NextResponse, type NextRequest } from 'next/server';
import { requireSession, UnauthorizedError } from '@/lib/auth/session';
import { getUserById, touchLastSeen } from '@/lib/queries/users';
import { getSubscriptionByUserId } from '@/lib/queries/subscriptions';

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const [user, subscription] = await Promise.all([
      getUserById(session.userId),
      getSubscriptionByUserId(session.userId),
    ]);
    if (!user) {
      return NextResponse.json({ error: 'user not found', code: 'NOT_FOUND' }, { status: 404 });
    }
    void touchLastSeen(session.userId).catch((err) =>
      console.error('[me] touchLastSeen failed:', err instanceof Error ? err.message : String(err))
    );
    return NextResponse.json({ user, subscription });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'unauthorized', code: 'UNAUTHORIZED', detail: err.message }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'request failed', code: 'INTERNAL', detail: message }, { status: 500 });
  }
}
