import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession, UnauthorizedError } from '@/lib/auth/session';
import { updateTelegramPreferences } from '@/lib/queries/telegram';

export const dynamic = 'force-dynamic';

const PatchSchema = z.object({
  mirror_opened: z.boolean().optional(),
  mirror_closed: z.boolean().optional(),
  mirror_skipped: z.boolean().optional(),
  health_alerts: z.boolean().optional(),
  agent_status: z.boolean().optional(),
  daily_summary: z.boolean().optional(),
});

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

    const updated = await updateTelegramPreferences(session.userId, parsed.data);
    return NextResponse.json({ subscription: updated });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'request failed', code: 'INTERNAL', detail: message }, { status: 500 });
  }
}
