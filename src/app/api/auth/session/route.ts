import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyPrivyAuthToken } from '@/lib/clients/privy';
import { upsertUser } from '@/lib/queries/users';
import { setServerSessionCookie } from '@/lib/auth/session';
import { upsertSubscription, getSubscriptionByUserId } from '@/lib/queries/subscriptions';

const BodySchema = z.object({
  authToken: z.string().min(10),
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  walletId: z.string().min(1).nullable().optional(),
  email: z.string().email().nullable().optional(),
  displayName: z.string().max(120).nullable().optional(),
});

const SESSION_MAX_AGE_SECONDS = 60 * 60;

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON', code: 'INVALID_BODY' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid body', code: 'VALIDATION_ERROR', details: parsed.error.issues },
      { status: 400 }
    );
  }

  let privyUserId: string;
  try {
    const verified = await verifyPrivyAuthToken(parsed.data.authToken);
    privyUserId = verified.userId;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: 'Privy token verification failed', code: 'PRIVY_VERIFY_FAILED', detail },
      { status: 401 }
    );
  }

  let user;
  try {
    user = await upsertUser({
      privyId: privyUserId,
      walletAddress: parsed.data.walletAddress as `0x${string}`,
      walletId: parsed.data.walletId ?? null,
      email: parsed.data.email ?? null,
      displayName: parsed.data.displayName ?? null,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: 'database write failed', code: 'DB_WRITE_FAILED', detail },
      { status: 503 }
    );
  }

  let subscription;
  try {
    const existing = await getSubscriptionByUserId(user.userId);
    subscription = existing ?? (await upsertSubscription({ userId: user.userId }));
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: 'subscription write failed', code: 'DB_WRITE_FAILED', detail },
      { status: 503 }
    );
  }

  await setServerSessionCookie(parsed.data.authToken, SESSION_MAX_AGE_SECONDS);
  return NextResponse.json({ user, subscription });
}
