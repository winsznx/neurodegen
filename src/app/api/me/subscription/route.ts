import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession, UnauthorizedError } from '@/lib/auth/session';
import { upsertSubscription, getSubscriptionByUserId, pauseSubscription } from '@/lib/queries/subscriptions';
import { PER_POSITION_SIZE_CAP_USD } from '@/config/risk';

const PatchSchema = z.object({
  active: z.boolean().optional(),
  sessionSignerGranted: z.boolean().optional(),
  leverageMultiplier: z.number().positive().max(2).optional(),
  maxPositionUsd: z.number().positive().max(PER_POSITION_SIZE_CAP_USD * 10).optional(),
  minConfidence: z.number().min(0).max(1).optional(),
  pausedUntil: z.string().datetime().nullable().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const subscription = await getSubscriptionByUserId(session.userId);
    return NextResponse.json({ subscription });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'request failed', code: 'INTERNAL', detail: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireSession(request);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'invalid JSON', code: 'INVALID_BODY' }, { status: 400 });
    }

    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid body', code: 'VALIDATION_ERROR', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { pausedUntil, ...rest } = parsed.data;
    const subscription = await upsertSubscription({ userId: session.userId, ...rest });

    if (pausedUntil !== undefined) {
      await pauseSubscription(session.userId, pausedUntil);
    }

    const fresh = await getSubscriptionByUserId(session.userId);
    return NextResponse.json({ subscription: fresh ?? subscription });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'request failed', code: 'INTERNAL', detail: message }, { status: 500 });
  }
}
