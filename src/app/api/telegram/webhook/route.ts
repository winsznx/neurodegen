import { webhookCallback } from 'grammy';
import { getTelegramBot, getWebhookSecret } from '@/lib/clients/telegram';
import { registerHandlers } from '@/lib/services/telegram/botHandlers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

let handler: ((req: Request) => Promise<Response>) | null = null;

function getHandler(): ((req: Request) => Promise<Response>) | null {
  if (handler) return handler;
  const bot = getTelegramBot();
  if (!bot) return null;

  registerHandlers(bot);

  const secret = getWebhookSecret() ?? undefined;
  handler = webhookCallback(bot, 'std/http', {
    secretToken: secret,
  });
  return handler;
}

export async function POST(request: Request): Promise<Response> {
  const fn = getHandler();
  if (!fn) {
    return new Response(
      JSON.stringify({ error: 'telegram bot not configured', code: 'TELEGRAM_DISABLED' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    return await fn(request);
  } catch (err) {
    console.error('[telegram-webhook] handler threw:', err instanceof Error ? err.stack ?? err.message : String(err));
    return new Response(
      JSON.stringify({ error: 'webhook handler failed', code: 'WEBHOOK_ERROR' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function GET(): Promise<Response> {
  const bot = getTelegramBot();
  return new Response(
    JSON.stringify({
      configured: bot !== null,
      hasSecret: getWebhookSecret() !== null,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}
