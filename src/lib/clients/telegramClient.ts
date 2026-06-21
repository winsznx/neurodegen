/**
 * Stateless Telegram Bot API client. Outbound-only never calls getUpdates or
 * setWebhook. Fire-and-forget by design: every error path resolves (never
 * throws) so the caller (telegramAlerter) cannot leak into the agent loop.
 *
 * Per-chat serialization: Telegram documents <= 1 msg/sec per chat. We hold a
 * single in-flight Promise chain that gates concurrent calls so bursts queue
 * instead of racing.
 *
 * 429 backoff: read `parameters.retry_after`, sleep that long + jitter,
 * exponential backoff (1s, 2s, 4s) capped at the documented retry_after, max
 * 3 retries.
 *
 * MarkdownV2 only all 18 reserved characters must be backslash-escaped via
 * `escapeMarkdownV2` at template-fill time. Use raw markup (*bold*, `code`)
 * for static template scaffolding only.
 */

const TELEGRAM_API_BASE = 'https://api.telegram.org';
const MAX_MESSAGE_LENGTH = 4096;
const MAX_RETRIES = 3;
const MIN_INTER_MESSAGE_DELAY_MS = 1_000;

/** Reserved characters in MarkdownV2 that MUST be escaped in any user-controlled string. */
const MARKDOWN_V2_RESERVED = [
  '_', '*', '[', ']', '(', ')', '~', '`', '>', '#',
  '+', '-', '=', '|', '{', '}', '.', '!',
] as const;

const ESCAPE_MAP = new Map<string, string>(
  MARKDOWN_V2_RESERVED.map((c) => [c, `\\${c}`]),
);

/**
 * Backslash-escape every MarkdownV2 reserved character in a string. Apply
 * exactly once per interpolated value at template-fill time; do not double-
 * escape.
 */
export function escapeMarkdownV2(input: string): string {
  if (!input) return '';
  let out = '';
  for (const char of input) {
    out += ESCAPE_MAP.get(char) ?? char;
  }
  return out;
}

/** Alias kept for spec parity. */
export const escapeMdV2 = escapeMarkdownV2;

/** Inline keyboard button: opens the url in the user's browser. */
export interface InlineKeyboardButton {
  text: string;
  url: string;
}

export type InlineKeyboard = InlineKeyboardButton[][];

export interface SendMessageOptions {
  /** Override the default chat id (per-chat ceiling still applies). */
  chatId?: string;
  /** Notification-silence. Defaults to false (audible). */
  disableNotification?: boolean;
  /**
   * Link preview policy. `off` (default) disables the preview entirely.
   * `large` opts in to a large unfurled card useful for /proof links that
   * have OG images. `small` shows a compact preview.
   */
  linkPreview?: 'off' | 'small' | 'large';
  /** Specific URL to unfurl when linkPreview != 'off'; defaults to first URL in text. */
  previewUrl?: string;
  /** Inline keyboard buttons rendered under the message. */
  inlineKeyboard?: InlineKeyboard;
}

export interface SendMessageResult {
  ok: boolean;
  messageIds: number[];
  retriedCount: number;
  giveUpReason: string | null;
}

interface TelegramErrorBody {
  ok: false;
  error_code?: number;
  description?: string;
  parameters?: { retry_after?: number };
}

interface TelegramSuccessBody {
  ok: true;
  result: { message_id: number };
}

type TelegramBody = TelegramErrorBody | TelegramSuccessBody;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Split a payload at line boundaries so each chunk fits 4096 chars. */
export function chunkMessage(text: string, limit: number = MAX_MESSAGE_LENGTH): string[] {
  if (text.length <= limit) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > limit) {
    let cut = remaining.lastIndexOf('\n', limit);
    if (cut <= 0) cut = limit;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).replace(/^\n+/, '');
  }
  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

export class TelegramClient {
  private readonly token: string | null;
  private readonly chatId: string | null;
  private readonly enabled: boolean;
  private chainTail: Promise<void> = Promise.resolve();
  private lastSendAt = 0;

  constructor(opts?: { token?: string | null; chatId?: string | null; enabled?: boolean }) {
    const token = opts?.token ?? process.env.TELEGRAM_BOT_TOKEN ?? null;
    const chatId = opts?.chatId ?? process.env.TELEGRAM_CHAT_ID ?? null;
    const enabled = opts?.enabled ?? false;

    if (enabled) {
      if (!token) {
        throw new Error('TELEGRAM_BOT_TOKEN required when ENABLE_TELEGRAM_ALERTS=true');
      }
      if (!chatId) {
        throw new Error('TELEGRAM_CHAT_ID required when ENABLE_TELEGRAM_ALERTS=true');
      }
    }

    this.token = token;
    this.chatId = chatId;
    this.enabled = enabled;
  }

  /**
   * Send a MarkdownV2 message. Resolves with the result; NEVER throws. Errors
   * are logged. Concurrent calls queue via a single in-flight chain to honor
   * the documented <= 1 msg/sec/chat ceiling.
   */
  async sendMessage(text: string, opts?: SendMessageOptions): Promise<SendMessageResult> {
    if (!this.enabled || !this.token || !this.chatId) {
      return { ok: false, messageIds: [], retriedCount: 0, giveUpReason: 'disabled' };
    }
    let resolver!: (value: SendMessageResult) => void;
    const result = new Promise<SendMessageResult>((res) => {
      resolver = res;
    });

    // Queue this send behind any in-flight chain.
    this.chainTail = this.chainTail.then(async () => {
      try {
        const now = Date.now();
        const wait = Math.max(0, MIN_INTER_MESSAGE_DELAY_MS - (now - this.lastSendAt));
        if (wait > 0) await sleep(wait);
        const r = await this.sendInternal(text, opts);
        this.lastSendAt = Date.now();
        resolver(r);
      } catch (err) {
        // Internal swallows already; this is belt-and-suspenders.
        console.error(
          '[tg-client] unexpected sendInternal throw:',
          err instanceof Error ? err.message : String(err),
        );
        resolver({
          ok: false,
          messageIds: [],
          retriedCount: 0,
          giveUpReason: 'internal-throw',
        });
      }
    });

    return result;
  }

  private async sendInternal(
    text: string,
    opts: SendMessageOptions | undefined,
  ): Promise<SendMessageResult> {
    const chatId = opts?.chatId ?? this.chatId!;
    const disableNotification = opts?.disableNotification ?? false;
    const url = `${TELEGRAM_API_BASE}/bot${this.token}/sendMessage`;
    const chunks = chunkMessage(text);
    const messageIds: number[] = [];
    let retriedTotal = 0;
    let giveUpReason: string | null = null;

    const linkPreview = opts?.linkPreview ?? 'off';
    const previewUrl = opts?.previewUrl;
    const inlineKeyboard = opts?.inlineKeyboard;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const isLast = i === chunks.length - 1;
      const body: Record<string, unknown> = {
        chat_id: chatId,
        text: chunk,
        parse_mode: 'MarkdownV2' as const,
        link_preview_options:
          linkPreview === 'off'
            ? { is_disabled: true }
            : {
                is_disabled: false,
                ...(previewUrl ? { url: previewUrl } : {}),
                ...(linkPreview === 'large' ? { prefer_large_media: true } : {}),
                ...(linkPreview === 'small' ? { prefer_small_media: true } : {}),
              },
        disable_notification: disableNotification,
      };
      // Inline keyboards attach to the final chunk only (Telegram requirement).
      if (isLast && inlineKeyboard && inlineKeyboard.length > 0) {
        body.reply_markup = { inline_keyboard: inlineKeyboard };
      }

      const chunkResult = await this.postWithRetry(url, body);
      retriedTotal += chunkResult.retried;
      if (chunkResult.messageId !== null) {
        messageIds.push(chunkResult.messageId);
      } else {
        giveUpReason = chunkResult.giveUpReason;
        break;
      }
    }

    return {
      ok: giveUpReason === null && messageIds.length > 0,
      messageIds,
      retriedCount: retriedTotal,
      giveUpReason,
    };
  }

  private async postWithRetry(
    url: string,
    body: Record<string, unknown>,
  ): Promise<{ messageId: number | null; retried: number; giveUpReason: string | null }> {
    let retried = 0;
    let nextDelayMs = 1_000;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch (err) {
        console.error(
          '[tg-client] fetch threw:',
          err instanceof Error ? err.message : String(err),
        );
        return { messageId: null, retried, giveUpReason: 'fetch-threw' };
      }

      let parsed: TelegramBody | null = null;
      try {
        parsed = (await response.json()) as TelegramBody;
      } catch {
        // ignore parse failure; fall through to status-based handling.
      }

      if (response.ok && parsed && parsed.ok) {
        return { messageId: parsed.result.message_id, retried, giveUpReason: null };
      }

      if (response.status === 429) {
        if (attempt >= MAX_RETRIES) {
          console.error('[tg-client] gave up after 429 retries');
          return { messageId: null, retried, giveUpReason: '429-give-up' };
        }
        const retryAfterSeconds = readRetryAfter(parsed, response);
        const cappedExponentialMs = Math.min(nextDelayMs, retryAfterSeconds * 1_000);
        const jitterMs = 100 + Math.floor(Math.random() * 400);
        const sleepMs = retryAfterSeconds * 1_000 + jitterMs;
        await sleep(Math.max(sleepMs, cappedExponentialMs));
        nextDelayMs *= 2;
        retried++;
        continue;
      }

      // Non-2xx, non-429 log and give up (do not throw).
      const errBody = parsed && !parsed.ok ? parsed : null;
      console.error('[tg-client] non-2xx', {
        status: response.status,
        error_code: errBody?.error_code,
        description: errBody?.description,
      });
      return {
        messageId: null,
        retried,
        giveUpReason: `http-${response.status}`,
      };
    }

    return { messageId: null, retried, giveUpReason: 'max-retries' };
  }

  /**
   * Edit a previously sent message in-place. Used to keep one pinned status
   * message current instead of flooding the channel. NEVER throws.
   */
  async editMessageText(
    messageId: number,
    text: string,
    opts?: Omit<SendMessageOptions, 'disableNotification'>,
  ): Promise<boolean> {
    if (!this.enabled || !this.token || !this.chatId) return false;
    const chatId = opts?.chatId ?? this.chatId;
    const url = `${TELEGRAM_API_BASE}/bot${this.token}/editMessageText`;
    const linkPreview = opts?.linkPreview ?? 'off';
    const body: Record<string, unknown> = {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'MarkdownV2',
      link_preview_options:
        linkPreview === 'off'
          ? { is_disabled: true }
          : {
              is_disabled: false,
              ...(opts?.previewUrl ? { url: opts.previewUrl } : {}),
              ...(linkPreview === 'large' ? { prefer_large_media: true } : {}),
            },
    };
    if (opts?.inlineKeyboard && opts.inlineKeyboard.length > 0) {
      body.reply_markup = { inline_keyboard: opts.inlineKeyboard };
    }
    const r = await this.postWithRetry(url, body);
    return r.messageId !== null;
  }

  /**
   * Pin a message in the channel so it stays at the top. The bot needs the
   * "Pin Messages" admin permission. NEVER throws.
   */
  async pinChatMessage(messageId: number, opts?: { disableNotification?: boolean }): Promise<boolean> {
    if (!this.enabled || !this.token || !this.chatId) return false;
    const url = `${TELEGRAM_API_BASE}/bot${this.token}/pinChatMessage`;
    const body = {
      chat_id: this.chatId,
      message_id: messageId,
      disable_notification: opts?.disableNotification ?? true,
    };
    const r = await this.postWithRetry(url, body);
    return r.messageId !== null;
  }
}

function readRetryAfter(parsed: TelegramBody | null, response: Response): number {
  if (parsed && !parsed.ok && parsed.parameters?.retry_after !== undefined) {
    return Math.max(1, parsed.parameters.retry_after);
  }
  const header = response.headers.get('retry-after');
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds > 0) return seconds;
  }
  return 1;
}
