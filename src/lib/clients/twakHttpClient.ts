/**
 * Trust Wallet Agent Kit HTTP API client.
 *
 * Auth: HMAC-SHA256. Each request signs the canonical string
 *   METHOD;PATH;SORTED_QUERY;ACCESS_ID;NONCE;DATE
 * with TWAK_HMAC_SECRET and sends the four headers:
 *   X-TW-CREDENTIAL: <access id (uuid)>
 *   X-TW-NONCE:      <uuid v4 per request>
 *   X-TW-DATE:       <RFC 1123 utc string>
 *   Authorization:   HMAC-SHA256 Signature=<base64-hmac>
 *
 * Source: https://portal.trustwallet.com/dashboard/docs (API Reference).
 *
 * Why HTTP for reads when we already have the CLI?
 * - Per the docs the read surface (search/assets, coinstatus, swap route quotes,
 *   provider list, domains) is identical via HTTP. HTTP avoids a ~50-200ms cold
 *   child_process spawn per call, runs in the same event loop as the agent
 *   cycle, and doesn't need TWAK_WALLET_PASSWORD.
 * - Signing operations still go through the CLI (keystore stays with TWAK).
 *
 * Failure semantics:
 * - Throws on non-2xx; caller decides whether to fall back.
 * - 429: exponential backoff (250 / 1000 / 4000 ms) + jitter, 3 attempts.
 * - 5xx: same backoff.
 * - Network errors: same.
 */

import { createHmac, randomUUID } from 'node:crypto';

const TWAK_HTTP_BASE_URL = process.env.TWAK_HTTP_BASE_URL ?? 'https://tws.trustwallet.com';
const MAX_RETRIES = 3;

interface SignedHeadersInput {
  method: string;
  path: string;
  query: string;
  accessId: string;
  nonce: string;
  date: string;
  hmacSecret: string;
}

/**
 * Build the canonical signing string per the docs spec and HMAC-SHA256 sign it
 * with the secret. Exported so tests can verify against a known vector.
 */
export function signRequest(input: SignedHeadersInput): string {
  const canonical = [
    input.method.toUpperCase(),
    input.path,
    input.query,
    input.accessId,
    input.nonce,
    input.date,
  ].join(';');
  return createHmac('sha256', input.hmacSecret).update(canonical).digest('base64');
}

/**
 * Sort URLSearchParams entries by key so the signed string is canonical regardless
 * of the order they were appended in. Required: server signs the same way.
 */
export function canonicalQuery(params: URLSearchParams | Record<string, string | number> | undefined): string {
  if (!params) return '';
  const entries: [string, string][] = [];
  if (params instanceof URLSearchParams) {
    params.forEach((v, k) => entries.push([k, v]));
  } else {
    for (const [k, v] of Object.entries(params)) entries.push([k, String(v)]);
  }
  entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return new URLSearchParams(entries).toString();
}

export class TwakHttpError extends Error {
  readonly status: number;
  readonly body: string;
  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = 'TwakHttpError';
    this.status = status;
    this.body = body;
  }
}

interface RequestOptions {
  query?: URLSearchParams | Record<string, string | number>;
  body?: unknown;
  signal?: AbortSignal;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface TwakHttpClientOptions {
  /** Override TWAK_ACCESS_ID at construction; default reads env. */
  accessId?: string;
  /** Override TWAK_HMAC_SECRET at construction; default reads env. */
  hmacSecret?: string;
  /** Override base URL for tests. */
  baseUrl?: string;
}

export class TwakHttpClient {
  private readonly accessId: string | null;
  private readonly hmacSecret: string | null;
  private readonly baseUrl: string;

  constructor(opts?: TwakHttpClientOptions) {
    this.accessId = opts?.accessId ?? process.env.TWAK_ACCESS_ID ?? null;
    this.hmacSecret = opts?.hmacSecret ?? process.env.TWAK_HMAC_SECRET ?? null;
    this.baseUrl = opts?.baseUrl ?? TWAK_HTTP_BASE_URL;
  }

  isConfigured(): boolean {
    return !!this.accessId && !!this.hmacSecret;
  }

  async request<T>(method: string, path: string, opts?: RequestOptions): Promise<T> {
    if (!this.accessId || !this.hmacSecret) {
      throw new Error('TwakHttpClient: TWAK_ACCESS_ID + TWAK_HMAC_SECRET required');
    }

    const query = canonicalQuery(opts?.query);
    const nonce = randomUUID();
    const date = new Date().toUTCString();
    const signature = signRequest({
      method,
      path,
      query,
      accessId: this.accessId,
      nonce,
      date,
      hmacSecret: this.hmacSecret,
    });

    const url = `${this.baseUrl}${path}${query ? `?${query}` : ''}`;
    const headers: Record<string, string> = {
      'X-TW-CREDENTIAL': this.accessId,
      'X-TW-NONCE': nonce,
      'X-TW-DATE': date,
      Authorization: `HMAC-SHA256 Signature=${signature}`,
    };
    const init: RequestInit = { method, headers, signal: opts?.signal };
    if (opts?.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }

    let delay = 250;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      let response: Response;
      try {
        response = await fetch(url, init);
      } catch (err) {
        if (attempt >= MAX_RETRIES) throw err;
        await sleep(delay + Math.floor(Math.random() * 200));
        delay *= 4;
        continue;
      }

      if (response.ok) {
        const text = await response.text();
        if (!text) return undefined as unknown as T;
        try {
          return JSON.parse(text) as T;
        } catch {
          throw new TwakHttpError('twak http: non-JSON 2xx body', response.status, text.slice(0, 500));
        }
      }

      // Retryable: 429 (rate limit) + 5xx.
      if (response.status === 429 || response.status >= 500) {
        if (attempt >= MAX_RETRIES) {
          const body = await response.text().catch(() => '');
          throw new TwakHttpError(
            `twak http ${response.status} after ${MAX_RETRIES + 1} attempts`,
            response.status,
            body.slice(0, 500),
          );
        }
        const retryAfter = Number(response.headers.get('retry-after') ?? '0');
        const wait = retryAfter > 0 ? retryAfter * 1000 : delay + Math.floor(Math.random() * 200);
        await sleep(wait);
        delay *= 4;
        continue;
      }

      const body = await response.text().catch(() => '');
      throw new TwakHttpError(
        `twak http ${response.status} ${method} ${path}`,
        response.status,
        body.slice(0, 500),
      );
    }
    throw new TwakHttpError('twak http: retries exhausted', 0, '');
  }

  // ────────────────────────────────────────
  // Endpoint helpers (per portal docs)
  // ────────────────────────────────────────

  /** Search for tokens / assets across supported chains. */
  searchAssets(query: string, limit = 20): Promise<unknown> {
    return this.request('GET', '/v1/search/assets', { query: { query, limit } });
  }

  /** Get live price / 24h change / market cap for a single asset id. */
  getCoinStatus(assetId: string): Promise<unknown> {
    return this.request('GET', `/v1/coinstatus/${encodeURIComponent(assetId)}`);
  }

  /** Quote a swap route. */
  getSwapRoute(args: {
    fromChain: string;
    fromToken: string;
    toChain: string;
    toToken: string;
    amount: string;
    address: string;
  }): Promise<unknown> {
    return this.request('POST', '/amber-api/v1/route', { body: args });
  }

  /** Get the step-by-step swap path (sub-routes per provider). */
  getSwapRouteStep(routeId: string): Promise<unknown> {
    return this.request('POST', '/amber-api/v1/route/step', { body: { routeId } });
  }

  /** List supported swap providers per chain. */
  getProviders(): Promise<unknown> {
    return this.request('GET', '/amber-api/v1/providers');
  }

  /** List supported domain resolvers (ENS, .bnb, .sol, etc.). */
  getDomains(): Promise<unknown> {
    return this.request('GET', '/amber-api/v1/domains');
  }
}

export const twakHttpClient = new TwakHttpClient();
