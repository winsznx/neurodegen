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

function summarizePrivyError(fullDetail: string): string {
  const lower = fullDetail.toLowerCase();
  if (lower.includes('not in pem format')) {
    return 'Server verification key is misconfigured (not a valid PEM). Admin: re-paste the full key from Privy Dashboard → App Settings → Verification Key, including the -----BEGIN PUBLIC KEY----- and -----END PUBLIC KEY----- lines, without surrounding quotes.';
  }
  if (lower.includes('keydata') || lower.includes('invalid key')) {
    return 'Server verification key is malformed (PEM markers present but body is invalid). Admin: re-copy the key from Privy Dashboard without any surrounding quotes or truncation.';
  }
  if (lower.includes('privy_verification_key env var is required')) {
    return 'Server verification key is not set. Admin: set PRIVY_VERIFICATION_KEY in deployment env.';
  }
  if (lower.includes('expired')) {
    return 'Auth token expired. Sign in again.';
  }
  if (lower.includes('invalid signature') || lower.includes('signature')) {
    return 'Auth token signature is invalid. Sign out and back in.';
  }
  return 'Auth verification failed. Please sign out and sign in again — if this persists, the admin needs to check Vercel logs.';
}

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
    const fullDetail = err instanceof Error ? err.message : String(err);
    // Log the full diagnostic (including any PEM preview bytes) to Vercel server logs only.
    console.error('[auth/session] Privy verification failed:', fullDetail);
    // Return a short, bytes-free summary to the browser.
    const clientDetail = summarizePrivyError(fullDetail);
    return NextResponse.json(
      { error: 'Privy token verification failed', code: 'PRIVY_VERIFY_FAILED', detail: clientDetail },
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
