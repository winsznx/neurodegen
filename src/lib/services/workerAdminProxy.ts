import { NextResponse, type NextRequest } from 'next/server';

const FETCH_TIMEOUT_MS = 15_000;

function getWorkerAdminUrl(): string | null {
  const url = process.env.WORKER_ADMIN_URL;
  if (!url) return null;
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function unauthorized(): NextResponse {
  return NextResponse.json(
    { error: 'Unauthorized', code: 'ADMIN_REQUIRED' },
    { status: 403 }
  );
}

function workerMisconfigured(): NextResponse {
  return NextResponse.json(
    {
      error: 'WORKER_ADMIN_URL is not set — admin actions require the web to know the worker URL',
      code: 'WORKER_ADMIN_URL_MISSING',
    },
    { status: 503 }
  );
}

function workerUnreachable(detail: string): NextResponse {
  return NextResponse.json(
    {
      error: 'Worker did not respond — check the Railway worker service is online',
      code: 'WORKER_UNREACHABLE',
      detail,
    },
    { status: 502 }
  );
}

export async function proxyAdminRequest(
  request: NextRequest,
  path: string
): Promise<NextResponse> {
  const secret = request.headers.get('X-Admin-Secret');
  if (!secret || secret !== process.env.ADMIN_SECRET) return unauthorized();

  const base = getWorkerAdminUrl();
  if (!base) return workerMisconfigured();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'X-Admin-Secret': secret },
      signal: controller.signal,
      cache: 'no-store',
    });

    const text = await response.text();
    let body: unknown;
    try {
      body = text.length > 0 ? JSON.parse(text) : null;
    } catch {
      body = { raw: text };
    }
    return NextResponse.json(body, { status: response.status });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return workerUnreachable(detail);
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchWorkerStatusRaw(): Promise<
  | { ok: true; status: unknown }
  | { ok: false; code: string; detail: string }
> {
  const base = getWorkerAdminUrl();
  if (!base) return { ok: false, code: 'WORKER_ADMIN_URL_MISSING', detail: 'WORKER_ADMIN_URL not set' };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(`${base}/health`, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok) {
      return { ok: false, code: 'WORKER_HTTP_ERROR', detail: `status ${response.status}` };
    }
    const json = (await response.json()) as { agent?: unknown };
    if (!json.agent) {
      return { ok: false, code: 'WORKER_PAYLOAD_INVALID', detail: 'no agent field in /health' };
    }
    return { ok: true, status: json.agent };
  } catch (err) {
    return { ok: false, code: 'WORKER_UNREACHABLE', detail: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timeout);
  }
}
