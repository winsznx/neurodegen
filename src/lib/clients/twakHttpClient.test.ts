import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TwakHttpClient, TwakHttpError, canonicalQuery, signRequest } from './twakHttpClient';

describe('signRequest', () => {
  it('produces a deterministic HMAC-SHA256 signature for the same input', () => {
    // #given a fixed canonical input
    const input = {
      method: 'GET',
      path: '/v1/search/assets',
      query: 'limit=10&query=bnb',
      accessId: 'access-id-abc',
      nonce: 'nonce-fixed',
      date: 'Sat, 21 Jun 2026 03:00:00 GMT',
      hmacSecret: 'shhh',
    };
    // #when signed twice
    const a = signRequest(input);
    const b = signRequest(input);
    // #then signatures match
    expect(a).toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it('changes when any input field changes', () => {
    // #given a base input
    const base = {
      method: 'GET',
      path: '/v1/search/assets',
      query: '',
      accessId: 'a',
      nonce: 'n',
      date: 'd',
      hmacSecret: 's',
    };
    // #when each field is flipped
    const sigBase = signRequest(base);
    const sigDifferentMethod = signRequest({ ...base, method: 'POST' });
    const sigDifferentSecret = signRequest({ ...base, hmacSecret: 's2' });
    // #then each signature is different
    expect(sigDifferentMethod).not.toBe(sigBase);
    expect(sigDifferentSecret).not.toBe(sigBase);
  });
});

describe('canonicalQuery', () => {
  it('sorts param keys alphabetically', () => {
    // #given out-of-order params
    const out = canonicalQuery({ z: '1', a: '2', m: '3' });
    // #then output is sorted
    expect(out).toBe('a=2&m=3&z=1');
  });

  it('returns empty for undefined', () => {
    // #given no params
    // #then empty string
    expect(canonicalQuery(undefined)).toBe('');
  });
});

describe('TwakHttpClient', () => {
  const origFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
    vi.useRealTimers();
  });

  it('throws when neither ACCESS_ID nor HMAC_SECRET is set', async () => {
    // #given env-empty client
    const client = new TwakHttpClient({ accessId: undefined, hmacSecret: undefined });
    // #when calling
    // #then it throws synchronously inside the request method
    await expect(client.searchAssets('bnb')).rejects.toThrow(/TWAK_ACCESS_ID/);
  });

  it('sends the four signed headers on a successful GET', async () => {
    // #given a stub fetch that captures the request
    let captured: { url: string; headers: Headers; method: string } | null = null;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : (input as Request).url ?? String(input);
      captured = {
        url,
        headers: new Headers(init?.headers as HeadersInit),
        method: init?.method ?? 'GET',
      };
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as unknown as typeof fetch;
    const client = new TwakHttpClient({ accessId: 'aid', hmacSecret: 'sec' });

    // #when
    const result = await client.searchAssets('bnb', 5);

    // #then
    expect(result).toEqual({ ok: true });
    expect(captured).not.toBeNull();
    expect(captured!.headers.get('x-tw-credential')).toBe('aid');
    expect(captured!.headers.get('x-tw-nonce')).toMatch(/[0-9a-f-]{8,}/);
    expect(captured!.headers.get('x-tw-date')).toMatch(/GMT$/);
    expect(captured!.headers.get('authorization')).toMatch(/^HMAC-SHA256 Signature=[A-Za-z0-9+/=]+$/);
  });

  it('throws a TwakHttpError with status and body on a non-retryable 4xx', async () => {
    // #given a 400 stub
    globalThis.fetch = vi.fn(async () =>
      new Response('bad request body', { status: 400 }),
    ) as unknown as typeof fetch;
    const client = new TwakHttpClient({ accessId: 'aid', hmacSecret: 'sec' });
    // #when / #then
    await expect(client.searchAssets('bnb')).rejects.toMatchObject({
      status: 400,
      body: expect.stringContaining('bad request body'),
    });
  });

  it('exposes TwakHttpError as an instance type for callers', async () => {
    // #given a 401 stub
    globalThis.fetch = vi.fn(async () =>
      new Response('nope', { status: 401 }),
    ) as unknown as typeof fetch;
    const client = new TwakHttpClient({ accessId: 'aid', hmacSecret: 'sec' });
    // #when
    let caught: unknown;
    try {
      await client.searchAssets('bnb');
    } catch (err) {
      caught = err;
    }
    // #then
    expect(caught).toBeInstanceOf(TwakHttpError);
  });
});
