import { Bot, InlineKeyboard, type Context } from 'grammy';

export type TelegramBot = Bot<Context>;

let cachedBot: TelegramBot | null = null;

export function getTelegramBot(): TelegramBot | null {
  if (cachedBot) return cachedBot;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  cachedBot = new Bot<Context>(token);
  return cachedBot;
}

export function getWebhookSecret(): string | null {
  return process.env.TELEGRAM_WEBHOOK_SECRET ?? null;
}

export function getBotUsername(): string | null {
  return process.env.TELEGRAM_BOT_USERNAME ?? null;
}

export function buildLinkUrl(token: string): string | null {
  const username = getBotUsername();
  if (!username) return null;
  const clean = username.startsWith('@') ? username.slice(1) : username;
  return `https://t.me/${clean}?start=${token}`;
}

export { InlineKeyboard };
