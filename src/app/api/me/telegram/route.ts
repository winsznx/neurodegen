import { NextResponse, type NextRequest } from 'next/server';
import { requireSession, UnauthorizedError } from '@/lib/auth/session';
import {
  createLinkToken,
  getTelegramSubscriptionByUserId,
  unlinkTelegramSubscription,
} from '@/lib/queries/telegram';
import { buildLinkUrl, getBotUsername } from '@/lib/clients/telegram';

export const dynamic = 'force-dynamic';

function botConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN) && Boolean(getBotUsername());
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const subscription = await getTelegramSubscriptionByUserId(session.userId);
    return NextResponse.json({
      configured: botConfigured(),
      botUsername: getBotUsername(),
      subscription,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'request failed', code: 'INTERNAL', detail: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!botConfigured()) {
      return NextResponse.json(
        { error: 'telegram bot is not configured on the server', code: 'TELEGRAM_DISABLED' },
        { status: 503 }
      );
    }

    const session = await requireSession(request);
    const token = await createLinkToken(session.userId);
    const url = buildLinkUrl(token.token);
    if (!url) {
      return NextResponse.json(
        { error: 'TELEGRAM_BOT_USERNAME env not set', code: 'TELEGRAM_DISABLED' },
        { status: 503 }
      );
    }

    return NextResponse.json({
      token: token.token,
      url,
      expiresAt: token.expiresAt,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'request failed', code: 'INTERNAL', detail: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await requireSession(request);
    await unlinkTelegramSubscription(session.userId);
    return NextResponse.json({ unlinked: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'request failed', code: 'INTERNAL', detail: message }, { status: 500 });
  }
}
