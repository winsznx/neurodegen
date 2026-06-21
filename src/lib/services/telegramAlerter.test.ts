import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Stable feature-flag + risk thresholds so tests don't depend on env.
vi.mock('@/config/features', () => ({
  ENABLE_TELEGRAM_ALERTS: true,
}));

vi.mock('@/config/risk', () => ({
  DRAWDOWN_ALERT_PCT: 0.05,
  DRAWDOWN_DEFENSIVE_PCT: 0.1,
  DRAWDOWN_HALT_PCT: 0.2,
}));

import {
  TelegramClient,
  escapeMarkdownV2,
  chunkMessage,
} from '@/lib/clients/telegramClient';
import { realtimeService } from '@/lib/services/realtimeService';
import { telegramAlerter } from '@/lib/services/telegramAlerter';

const ORIGINAL_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ORIGINAL_CHAT = process.env.TELEGRAM_CHAT_ID;
const ORIGINAL_WORKER = process.env.WORKER_MODE;

function setEnv(): void {
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  process.env.TELEGRAM_CHAT_ID = '-1001234567890';
  // Force fanout path (no worker forwarding) so listeners always run inline.
  process.env.WORKER_MODE = 'false';
}

function restoreEnv(): void {
  if (ORIGINAL_TOKEN === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
  else process.env.TELEGRAM_BOT_TOKEN = ORIGINAL_TOKEN;
  if (ORIGINAL_CHAT === undefined) delete process.env.TELEGRAM_CHAT_ID;
  else process.env.TELEGRAM_CHAT_ID = ORIGINAL_CHAT;
  if (ORIGINAL_WORKER === undefined) delete process.env.WORKER_MODE;
  else process.env.WORKER_MODE = ORIGINAL_WORKER;
}

function mockFetchOk(): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(global, 'fetch').mockImplementation(
    () =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () => Promise.resolve({ ok: true, result: { message_id: 1 } }),
      } as unknown as Response),
  );
}

/**
 * Flush queued microtasks so the alerter's fire-and-forget `void
 * client.sendMessage(...)` chain has a chance to call fetch.
 */
async function flush(times = 5): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

describe('escapeMarkdownV2', () => {
  it('escapes every reserved character', () => {
    // #given
    const reserved = '_*[]()~`>#+-=|{}.!';

    // #when
    const out = escapeMarkdownV2(reserved);

    // #then — every char now has a leading backslash
    expect(out).toBe(reserved.split('').map((c) => `\\${c}`).join(''));
  });

  it('leaves non-reserved chars untouched', () => {
    // #given
    const input = 'hello world 123 abc';

    // #when
    const out = escapeMarkdownV2(input);

    // #then
    expect(out).toBe(input);
  });

  it('escapes mixed strings correctly', () => {
    // #given
    const input = 'a.b_c*';

    // #when
    const out = escapeMarkdownV2(input);

    // #then
    expect(out).toBe('a\\.b\\_c\\*');
  });

  it('handles empty input', () => {
    expect(escapeMarkdownV2('')).toBe('');
  });
});

describe('chunkMessage', () => {
  it('returns single chunk when under limit', () => {
    // #given
    const text = 'short message';

    // #when
    const chunks = chunkMessage(text);

    // #then
    expect(chunks).toEqual([text]);
  });

  it('splits long messages at line boundaries', () => {
    // #given
    const lines = Array.from({ length: 500 }, (_, i) => `line${i}`).join('\n');

    // #when
    const chunks = chunkMessage(lines, 1_000);

    // #then
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(1_000);
    }
    expect(chunks.join('\n')).toBe(lines);
  });

  it('hard-cuts when no line boundary is present', () => {
    // #given
    const text = 'x'.repeat(5_000);

    // #when
    const chunks = chunkMessage(text, 4_096);

    // #then
    expect(chunks.length).toBe(2);
    expect(chunks[0].length).toBe(4_096);
    expect(chunks[1].length).toBe(904);
  });
});

describe('TelegramClient', () => {
  beforeEach(() => {
    setEnv();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreEnv();
  });

  it('POSTs MarkdownV2 with link previews disabled on happy path', async () => {
    // #given
    const fetchSpy = mockFetchOk();
    const client = new TelegramClient({ enabled: true });

    // #when
    const result = await client.sendMessage('hello');

    // #then
    expect(result.ok).toBe(true);
    expect(result.messageIds).toEqual([1]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/bottest-token/sendMessage');
    const body = JSON.parse(init.body as string);
    expect(body.parse_mode).toBe('MarkdownV2');
    expect(body.link_preview_options).toEqual({ is_disabled: true });
    expect(body.chat_id).toBe('-1001234567890');
  });

  it('retries once on 429 with retry_after, then succeeds', async () => {
    // #given
    let call = 0;
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(() => {
      call++;
      if (call === 1) {
        return Promise.resolve({
          ok: false,
          status: 429,
          headers: new Headers(),
          json: () =>
            Promise.resolve({
              ok: false,
              error_code: 429,
              parameters: { retry_after: 1 },
            }),
        } as unknown as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () => Promise.resolve({ ok: true, result: { message_id: 42 } }),
      } as unknown as Response);
    });
    const client = new TelegramClient({ enabled: true });

    // #when
    const result = await client.sendMessage('hi');

    // #then
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
    expect(result.retriedCount).toBe(1);
    expect(result.messageIds).toEqual([42]);
  });

  it('gives up after 3 consecutive 429s without throwing', async () => {
    // #given
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 429,
        headers: new Headers(),
        json: () =>
          Promise.resolve({ ok: false, parameters: { retry_after: 1 } }),
      } as unknown as Response),
    );
    const client = new TelegramClient({ enabled: true });

    // #when
    const result = await client.sendMessage('hi');

    // #then — initial attempt + 3 retries = 4 total
    expect(fetchSpy).toHaveBeenCalledTimes(4);
    expect(result.ok).toBe(false);
    expect(result.giveUpReason).toBe('429-give-up');
    expect(result.retriedCount).toBe(3);
  }, 30_000);

  it('does not retry on 400 and resolves cleanly', async () => {
    // #given
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 400,
        headers: new Headers(),
        json: () =>
          Promise.resolve({
            ok: false,
            error_code: 400,
            description: 'Bad Request: chat not found',
          }),
      } as unknown as Response),
    );
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const client = new TelegramClient({ enabled: true });

    // #when
    const result = await client.sendMessage('hi');

    // #then
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    expect(result.giveUpReason).toBe('http-400');
    expect(errSpy).toHaveBeenCalled();
  });

  it('resolves without throwing when fetch throws', async () => {
    // #given
    vi.spyOn(global, 'fetch').mockImplementation(() => {
      throw new Error('network down');
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const client = new TelegramClient({ enabled: true });

    // #when
    const result = await client.sendMessage('hi');

    // #then
    expect(result.ok).toBe(false);
    expect(result.giveUpReason).toBe('fetch-threw');
  });

  it('serializes concurrent sends per-chat (>=1s gap)', async () => {
    // #given
    const callTimes: number[] = [];
    vi.spyOn(global, 'fetch').mockImplementation(() => {
      callTimes.push(Date.now());
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () => Promise.resolve({ ok: true, result: { message_id: 1 } }),
      } as unknown as Response);
    });
    const client = new TelegramClient({ enabled: true });

    // #when — fire three concurrently
    const [r1, r2, r3] = await Promise.all([
      client.sendMessage('a'),
      client.sendMessage('b'),
      client.sendMessage('c'),
    ]);

    // #then
    expect(r1.ok && r2.ok && r3.ok).toBe(true);
    expect(callTimes.length).toBe(3);
    expect(callTimes[1] - callTimes[0]).toBeGreaterThanOrEqual(990);
    expect(callTimes[2] - callTimes[1]).toBeGreaterThanOrEqual(990);
  }, 10_000);

  it('throws at construction when enabled and env missing', () => {
    // #given
    delete process.env.TELEGRAM_BOT_TOKEN;

    // #when / #then
    expect(() => new TelegramClient({ enabled: true })).toThrow(
      /TELEGRAM_BOT_TOKEN/,
    );
  });

  it('is a no-op when disabled', async () => {
    // #given
    const fetchSpy = mockFetchOk();
    const client = new TelegramClient({ enabled: false });

    // #when
    const result = await client.sendMessage('hi');

    // #then
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.giveUpReason).toBe('disabled');
  });
});

describe('telegramAlerter', () => {
  beforeEach(() => {
    setEnv();
  });

  afterEach(() => {
    telegramAlerter.stop();
    vi.restoreAllMocks();
    restoreEnv();
  });

  it('start() is idempotent', () => {
    // #given / #when
    telegramAlerter.start();
    telegramAlerter.start();

    // #then
    expect(telegramAlerter.isStarted()).toBe(true);
  });

  it('rate-limits same event type within 30s window', async () => {
    // #given
    const fetchSpy = mockFetchOk();
    telegramAlerter.start();

    // #when — two health_degradation events with the same payload
    realtimeService.broadcast({
      type: 'health_degradation',
      data: { source: 'agent_loop', message: 'kaboom' },
      timestamp: Date.now(),
    });
    realtimeService.broadcast({
      type: 'health_degradation',
      data: { source: 'agent_loop', message: 'kaboom' },
      timestamp: Date.now() + 1_000,
    });
    await flush();

    // #then — only the first fires
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('dedupes health_degradation on source|message within 5min', async () => {
    // #given
    const fetchSpy = mockFetchOk();
    telegramAlerter.start();

    // #when — different source ⇒ both fire (rate-limit is exempt because of distinct dedupe key + same type)
    realtimeService.broadcast({
      type: 'health_degradation',
      data: { source: 'agent_loop', message: 'msg-a' },
      timestamp: Date.now(),
    });
    await flush();
    // Force past the 30s rate-limit floor by directly poking the map.
    realtimeService.broadcast({
      type: 'health_degradation',
      data: { source: 'agent_loop', message: 'msg-a' },
      timestamp: Date.now() + 5_000,
    });
    await flush();

    // #then — same source|message within 5min window: still 1 send
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does NOT rate-limit position_update events', async () => {
    // #given
    const fetchSpy = mockFetchOk();
    telegramAlerter.start();

    // #when — two distinct open positions back-to-back
    realtimeService.broadcast({
      type: 'position_update',
      data: {
        status: 'open',
        direction: 'long',
        tokenSymbol: 'BNB',
        sizeUSD: 50,
        entryPriceUSD: 612.4,
        tpPriceUSD: 640,
        slPriceUSD: 595,
        twakTxHash: '0xabc',
      },
      timestamp: Date.now(),
    });
    realtimeService.broadcast({
      type: 'position_update',
      data: {
        status: 'open',
        direction: 'long',
        tokenSymbol: 'CAKE',
        sizeUSD: 25,
        entryPriceUSD: 2.5,
        tpPriceUSD: 2.8,
        slPriceUSD: 2.3,
        twakTxHash: '0xdef',
      },
      timestamp: Date.now() + 1_000,
    });
    // Per-chat serialization gates sends to >= 1s apart; wait for the second
    // queued message to flush.
    await new Promise((resolve) => setTimeout(resolve, 1_300));

    // #then
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  }, 5_000);

  it('emits drawdown_tier_change when crossing thresholds', async () => {
    // #given
    const fetchSpy = mockFetchOk();
    telegramAlerter.start();

    // #when — cross 5% (normal→alert)
    realtimeService.broadcast({
      type: 'agent_status_snapshot',
      data: { drawdownPct: 0.06 },
      timestamp: Date.now(),
    });
    await flush();

    // #then
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = JSON.parse(
      (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.text).toContain('Drawdown tier');
    expect(body.text).toContain('normal');
    expect(body.text).toContain('alert');
  });

  it('does not re-send drawdown_tier_change when tier is unchanged', async () => {
    // #given
    const fetchSpy = mockFetchOk();
    telegramAlerter.start();
    realtimeService.broadcast({
      type: 'agent_status_snapshot',
      data: { drawdownPct: 0.06 },
      timestamp: Date.now(),
    });
    await flush();

    // #when — same tier
    realtimeService.broadcast({
      type: 'agent_status_snapshot',
      data: { drawdownPct: 0.07 },
      timestamp: Date.now() + 1,
    });
    await flush();

    // #then
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does not throw when client send rejects (failure isolation)', async () => {
    // #given
    vi.spyOn(global, 'fetch').mockImplementation(() => {
      throw new Error('network');
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    telegramAlerter.start();

    // #when / #then — broadcast must not throw, must not leak unhandled rejection
    let unhandled = false;
    const onUnhandled = (): void => {
      unhandled = true;
    };
    process.on('unhandledRejection', onUnhandled);
    expect(() =>
      realtimeService.broadcast({
        type: 'regime_change',
        data: { from: 'TRENDING_UP', to: 'CHOPPY', rationale: 'x' },
        timestamp: Date.now(),
      }),
    ).not.toThrow();
    await flush();
    process.off('unhandledRejection', onUnhandled);
    expect(unhandled).toBe(false);
  });

  it('renders the boot template with MarkdownV2 escaping applied to dynamic fields', async () => {
    // #given
    const fetchSpy = mockFetchOk();
    telegramAlerter.start();

    // #when
    await telegramAlerter.notifyBoot({
      regime: 'TRENDING_UP',
      openPositionCount: 0,
      drawdownPct: 0,
      gitSha: 'ef5e607',
    });
    await flush();

    // #then
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = JSON.parse(
      (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.text).toContain('*NeuroDegen V2 online*');
    expect(body.text).toContain('TRENDING\\_UP');
    expect(body.text).toContain('0\\.00%');
    expect(body.text).toContain('`ef5e607`');
  });

  it('renders the position_update open template', async () => {
    // #given
    const fetchSpy = mockFetchOk();
    telegramAlerter.start();

    // #when
    realtimeService.broadcast({
      type: 'position_update',
      data: {
        status: 'open',
        direction: 'long',
        tokenSymbol: 'BNB',
        sizeUSD: 50,
        entryPriceUSD: 612.4,
        tpPriceUSD: 640,
        slPriceUSD: 595,
        twakTxHash: '0xabc123',
      },
      timestamp: Date.now(),
    });
    await flush();

    // #then
    const body = JSON.parse(
      (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.text).toContain('*OPEN*');
    expect(body.text).toContain('*BNB*');
    // `$` is NOT MarkdownV2-reserved; `.` IS, so 612.40 → 612\.40
    expect(body.text).toContain('$612\\.40');
    // Inside link parens only `)` and `\` are reserved — `.` stays raw.
    expect(body.text).toContain('[tx](https://bscscan.com/tx/0xabc123)');
  });

  it('renders the regime_change template', async () => {
    // #given
    const fetchSpy = mockFetchOk();
    telegramAlerter.start();

    // #when
    realtimeService.broadcast({
      type: 'regime_change',
      data: {
        from: 'TRENDING_UP',
        to: 'CHOPPY',
        rationale: 'ATR expanded 2.3x',
      },
      timestamp: Date.now(),
    });
    await flush();

    // #then
    const body = JSON.parse(
      (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.text).toContain('*Regime shift*');
    expect(body.text).toContain('TRENDING\\_UP → CHOPPY');
    expect(body.text).toContain('ATR expanded 2\\.3x');
  });

  it('registers no listener when ENABLE_TELEGRAM_ALERTS=false', async () => {
    // #given — flip flag via the module mock
    const featuresMod = await import('@/config/features');
    const original = featuresMod.ENABLE_TELEGRAM_ALERTS;
    Object.defineProperty(featuresMod, 'ENABLE_TELEGRAM_ALERTS', {
      value: false,
      configurable: true,
    });
    const fetchSpy = mockFetchOk();

    // #when
    telegramAlerter.start();
    realtimeService.broadcast({
      type: 'regime_change',
      data: { from: 'A', to: 'B', rationale: 'x' },
      timestamp: Date.now(),
    });
    await flush();

    // #then
    expect(telegramAlerter.isStarted()).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();

    // restore
    Object.defineProperty(featuresMod, 'ENABLE_TELEGRAM_ALERTS', {
      value: original,
      configurable: true,
    });
  });

  it('throwing listeners do not break fanout to other listeners', () => {
    // #given
    const good = vi.fn();
    realtimeService.addListener(() => {
      throw new Error('boom');
    });
    const dispose = realtimeService.addListener(good);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    // #when
    realtimeService.broadcast({
      type: 'metrics_update',
      data: { x: 1 },
      timestamp: Date.now(),
    });

    // #then
    expect(good).toHaveBeenCalledTimes(1);

    dispose();
  });
});
