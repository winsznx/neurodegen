import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { verifyPrivyAuthToken } from '@/lib/clients/privy';
import { getUserByPrivyId, upsertUser } from '@/lib/queries/users';
import type { SessionContext, UserRecord } from '@/types/users';

const PRIVY_TOKEN_COOKIE = 'privy-token';

function extractPrivyToken(request: NextRequest): string | null {
  const cookieToken = request.cookies.get(PRIVY_TOKEN_COOKIE)?.value;
  if (cookieToken) return cookieToken;

  const authHeader = request.headers.get('Authorization') ?? request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);
  return null;
}

export async function requireSession(request: NextRequest): Promise<SessionContext> {
  const token = extractPrivyToken(request);
  if (!token) throw new UnauthorizedError('missing Privy auth token');

  const verified = await verifyPrivyAuthToken(token).catch((err) => {
    throw new UnauthorizedError(`token verification failed: ${err instanceof Error ? err.message : String(err)}`);
  });

  const user = await getUserByPrivyId(verified.userId);
  if (!user) throw new UnauthorizedError('user not registered — call /api/auth/session first');

  return {
    userId: user.userId,
    privyId: user.privyId,
    walletAddress: user.walletAddress,
  };
}

export async function getOptionalSession(request: NextRequest): Promise<SessionContext | null> {
  try {
    return await requireSession(request);
  } catch {
    return null;
  }
}

export interface RegisterSessionInput {
  authToken: string;
  walletAddress: `0x${string}`;
  walletId?: string | null;
  email?: string | null;
  displayName?: string | null;
}

export async function registerSessionFromPrivyToken(input: RegisterSessionInput): Promise<UserRecord> {
  const verified = await verifyPrivyAuthToken(input.authToken);
  return upsertUser({
    privyId: verified.userId,
    walletAddress: input.walletAddress,
    walletId: input.walletId,
    email: input.email,
    displayName: input.displayName,
  });
}

export async function setServerSessionCookie(token: string, maxAgeSeconds: number): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(PRIVY_TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: maxAgeSeconds,
    path: '/',
  });
}

export async function clearServerSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(PRIVY_TOKEN_COOKIE);
}

export class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnauthorizedError';
  }
}
