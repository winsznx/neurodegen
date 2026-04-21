import { InlineKeyboard, type Bot, type Context } from 'grammy';
import {
  consumeLinkToken,
  upsertTelegramSubscription,
  getTelegramSubscriptionByChatId,
  updateTelegramPreferences,
  unlinkTelegramSubscription,
  touchLastMessage,
} from '@/lib/queries/telegram';
import { getSubscriptionByUserId, upsertSubscription } from '@/lib/queries/subscriptions';
import { getOpenPositions } from '@/lib/queries/positions';
import { agentLoop } from '@/lib/services/agentLoop';
import { realtimeService } from '@/lib/services/realtimeService';

function settingsKeyboard(prefs: {
  mirror_opened: boolean;
  mirror_closed: boolean;
  mirror_skipped: boolean;
  health_alerts: boolean;
  daily_summary: boolean;
}): InlineKeyboard {
  const label = (on: boolean, title: string): string => `${on ? '✅' : '⬜️'} ${title}`;
  return new InlineKeyboard()
    .text(label(prefs.mirror_opened, 'position opens'), 'pref:mirror_opened')
    .row()
    .text(label(prefs.mirror_closed, 'position closes'), 'pref:mirror_closed')
    .row()
    .text(label(prefs.mirror_skipped, 'skipped signals'), 'pref:mirror_skipped')
    .row()
    .text(label(prefs.health_alerts, 'health alerts'), 'pref:health_alerts')
    .row()
    .text(label(prefs.daily_summary, 'daily summary'), 'pref:daily_summary');
}

function controlKeyboard(active: boolean): InlineKeyboard {
  return new InlineKeyboard()
    .text(active ? '⏸ pause mirroring' : '▶ resume mirroring', active ? 'ctrl:pause' : 'ctrl:resume')
    .row()
    .text('🔧 settings', 'ctrl:settings')
    .text('📊 status', 'ctrl:status');
}

export function registerHandlers(bot: Bot<Context>): void {
  bot.command('start', async (ctx) => {
    const payload = ctx.match?.trim();
    if (!payload) {
      await ctx.reply(
        'Welcome to NeuroDegen 🤖\n\nTo link your account, open your dashboard at https://neurodegen.xyz/me and click "Connect Telegram". That will send you back here with a secure one-tap link.'
      );
      return;
    }

    try {
      const linked = await consumeLinkToken(payload);
      if (!linked) {
        await ctx.reply('❌ That link token is expired or already used. Open /me on the dashboard and click *Connect Telegram* again.', { parse_mode: 'Markdown' });
        return;
      }

      const from = ctx.from;
      if (!from || !ctx.chat) {
        await ctx.reply('❌ Could not resolve your Telegram account. Try again from a direct chat.');
        return;
      }

      const subscription = await upsertTelegramSubscription({
        userId: linked.userId,
        chatId: ctx.chat.id,
        username: from.username ?? null,
        firstName: from.first_name ?? null,
        languageCode: from.language_code ?? null,
      });

      realtimeService.broadcast({
        type: 'telegram_linked',
        data: { userId: linked.userId, username: subscription.username, chatId: subscription.chatId },
        timestamp: Date.now(),
        userId: linked.userId,
      });

      await ctx.reply(
        `✅ Linked${from.username ? ` as @${from.username}` : ''}.\n\nYou'll receive alerts here when:\n• the agent opens a position you mirror\n• the agent closes a position you mirror\n• agent health degrades\n\nUse /settings to tune what you receive, /status for a snapshot, /help for commands.`
      );
    } catch (err) {
      console.error('[telegram] /start handler failed:', err instanceof Error ? err.message : String(err));
      await ctx.reply('❌ Something broke while linking. Try again in a minute, or ping support.');
    }
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(
      '*NeuroDegen commands*\n\n' +
        '/status — agent + your mirror snapshot\n' +
        '/settings — toggle which notifications you get\n' +
        '/pause — pause your mirroring\n' +
        '/resume — resume your mirroring\n' +
        '/unlink — disconnect this chat from your account',
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('status', async (ctx) => {
    if (!ctx.chat) return;
    const sub = await getTelegramSubscriptionByChatId(ctx.chat.id);
    if (!sub) {
      await ctx.reply('This chat is not linked. Open https://neurodegen.xyz/me and click *Connect Telegram*.', { parse_mode: 'Markdown' });
      return;
    }
    await touchLastMessage(ctx.chat.id);

    const [mirror, open, status] = await Promise.all([
      getSubscriptionByUserId(sub.userId).catch(() => null),
      getOpenPositions().catch(() => []),
      Promise.resolve(agentLoop.getStatus()),
    ]);

    const active = mirror?.active === true;
    const perception = status.perceptionHealthy ? '🟢' : '🔴';
    const cognition = status.cognitionHealthy ? '🟢' : '🔴';
    const execution = status.executionHealthy ? '🟢' : '🔴';

    await ctx.reply(
      `*agent*\n` +
        `${status.running ? '🟢 running' : '⏸ stopped'} · cycle ${status.cycleCount} · regime *${status.currentRegime}*\n` +
        `${perception} perception  ${cognition} cognition  ${execution} execution\n\n` +
        `*your mirror*\n` +
        `${active ? '🟢 active' : '⚪ paused'} · ${open.length} agent position${open.length === 1 ? '' : 's'} open`,
      { parse_mode: 'Markdown', reply_markup: controlKeyboard(active) }
    );
  });

  bot.command('settings', async (ctx) => {
    if (!ctx.chat) return;
    const sub = await getTelegramSubscriptionByChatId(ctx.chat.id);
    if (!sub) {
      await ctx.reply('Link your account first: https://neurodegen.xyz/me');
      return;
    }
    await ctx.reply('Tap to toggle which alerts you receive:', {
      reply_markup: settingsKeyboard(sub.preferences),
    });
  });

  bot.command('pause', async (ctx) => {
    if (!ctx.chat) return;
    const sub = await getTelegramSubscriptionByChatId(ctx.chat.id);
    if (!sub) return;
    await upsertSubscription({ userId: sub.userId, active: false });
    await ctx.reply('⏸ Mirroring paused. You will not mirror new agent positions. Use /resume to turn it back on.');
  });

  bot.command('resume', async (ctx) => {
    if (!ctx.chat) return;
    const sub = await getTelegramSubscriptionByChatId(ctx.chat.id);
    if (!sub) return;
    await upsertSubscription({ userId: sub.userId, active: true });
    await ctx.reply('▶ Mirroring resumed.');
  });

  bot.command('unlink', async (ctx) => {
    if (!ctx.chat) return;
    const sub = await getTelegramSubscriptionByChatId(ctx.chat.id);
    if (!sub) return;
    await unlinkTelegramSubscription(sub.userId);
    await ctx.reply('👋 This chat has been disconnected from your NeuroDegen account. Goodbye.');
  });

  bot.callbackQuery(/^pref:(\w+)$/, async (ctx) => {
    const key = ctx.match?.[1] as keyof typeof togglablePrefs | undefined;
    const togglablePrefs = {
      mirror_opened: true,
      mirror_closed: true,
      mirror_skipped: true,
      health_alerts: true,
      daily_summary: true,
    } as const;
    if (!key || !(key in togglablePrefs) || !ctx.chat) {
      await ctx.answerCallbackQuery({ text: 'unknown setting' });
      return;
    }
    const sub = await getTelegramSubscriptionByChatId(ctx.chat.id);
    if (!sub) {
      await ctx.answerCallbackQuery({ text: 'not linked' });
      return;
    }
    const current = sub.preferences[key];
    const updated = await updateTelegramPreferences(sub.userId, { [key]: !current });
    await ctx.answerCallbackQuery({ text: updated.preferences[key] ? 'enabled' : 'disabled' });
    await ctx.editMessageReplyMarkup({ reply_markup: settingsKeyboard(updated.preferences) });
  });

  bot.callbackQuery('ctrl:pause', async (ctx) => {
    if (!ctx.chat) return;
    const sub = await getTelegramSubscriptionByChatId(ctx.chat.id);
    if (!sub) return;
    await upsertSubscription({ userId: sub.userId, active: false });
    await ctx.answerCallbackQuery({ text: 'paused' });
    await ctx.editMessageReplyMarkup({ reply_markup: controlKeyboard(false) });
  });

  bot.callbackQuery('ctrl:resume', async (ctx) => {
    if (!ctx.chat) return;
    const sub = await getTelegramSubscriptionByChatId(ctx.chat.id);
    if (!sub) return;
    await upsertSubscription({ userId: sub.userId, active: true });
    await ctx.answerCallbackQuery({ text: 'resumed' });
    await ctx.editMessageReplyMarkup({ reply_markup: controlKeyboard(true) });
  });

  bot.callbackQuery('ctrl:settings', async (ctx) => {
    if (!ctx.chat) return;
    const sub = await getTelegramSubscriptionByChatId(ctx.chat.id);
    if (!sub) return;
    await ctx.answerCallbackQuery();
    await ctx.reply('Tap to toggle which alerts you receive:', {
      reply_markup: settingsKeyboard(sub.preferences),
    });
  });

  bot.callbackQuery('ctrl:status', async (ctx) => {
    await ctx.answerCallbackQuery();
    // re-run /status flow inline
    const status = agentLoop.getStatus();
    await ctx.reply(
      `agent ${status.running ? 'running' : 'stopped'} · cycle ${status.cycleCount} · regime ${status.currentRegime}`
    );
  });

  bot.catch((err) => {
    console.error('[telegram] unhandled bot error:', err.error);
  });
}
