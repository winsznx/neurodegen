import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { agentLoop } from '@/lib/services/agentLoop';
import { realtimeService } from '@/lib/services/realtimeService';
import { loadAllowlistFromEnv } from '@/lib/utils/allowedTokens';

const PORT = Number(process.env.PORT ?? 8080);
const STATUS_BROADCAST_INTERVAL_MS = 10_000;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function unauthorized(res: ServerResponse): void {
  sendJson(res, 403, { error: 'forbidden', code: 'ADMIN_REQUIRED' });
}

function checkAdmin(req: IncomingMessage): boolean {
  const expected = process.env.ADMIN_SECRET;
  if (!expected) return false;
  const got = req.headers['x-admin-secret'];
  const secret = Array.isArray(got) ? got[0] : got;
  return secret === expected;
}

const ADMIN_PATH_RE = /^\/admin\/([a-z-]+)(?:\/([^/?]+))?$/;

async function handleAdmin(
  req: IncomingMessage,
  res: ServerResponse,
  op: string,
  _param: string | null,
): Promise<void> {
  if (!checkAdmin(req)) return unauthorized(res);
  try {
    switch (op) {
      case 'start': {
        await agentLoop.start();
        return sendJson(res, 200, { started: true, status: agentLoop.getStatus() });
      }
      case 'stop': {
        await agentLoop.stop();
        return sendJson(res, 200, { stopped: true, status: agentLoop.getStatus() });
      }
      case 'status': {
        return sendJson(res, 200, agentLoop.getStatus());
      }
      default:
        return sendJson(res, 404, { error: `unknown op: ${op}` });
    }
  } catch (err) {
    return sendJson(res, 500, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function preflightEnv(): void {
  const required = [
    { name: 'ADMIN_SECRET', hint: 'shared with web service' },
    { name: 'SUPABASE_URL', hint: 'database' },
    { name: 'SUPABASE_SERVICE_ROLE_KEY', hint: 'database writes' },
    { name: 'BSC_RPC_URL', hint: 'viem chain client' },
    { name: 'CMC_PRO_API_KEY', hint: 'CMC Hub MCP transport' },
    { name: 'DGRID_API_KEY', hint: 'LLM gateway' },
    { name: 'TWAK_AGENT_WALLET_ADDRESS', hint: 'agent wallet (TWAK keychain)' },
  ];
  const missing = required.filter((r) => !process.env[r.name]);
  for (const r of missing) {
    console.error(`[worker] ⚠ missing env: ${r.name} (${r.hint})`);
  }
  if (process.env.WORKER_MODE !== 'true') {
    console.error(
      '[worker] ⚠ WORKER_MODE is not "true" — realtimeService will NOT forward to the web. Set WORKER_MODE=true in Railway env.',
    );
  }
  if (!process.env.WEB_BROADCAST_URL) {
    console.error(
      '[worker] ⚠ WEB_BROADCAST_URL is not set — events have nowhere to forward.',
    );
  }
}

async function main(): Promise<void> {
  console.warn('[worker] booting', {
    workerMode: process.env.WORKER_MODE,
    webBroadcastUrl: process.env.WEB_BROADCAST_URL ? 'set' : 'unset',
    port: PORT,
  });
  preflightEnv();

  // Inject the live competition allowlist (149-token list) from
  // ALLOWED_TOKENS_JSON env var if present. Falls back to the seed list with a
  // warning so dev/demo runs still work.
  const allowlistResult = loadAllowlistFromEnv();
  if (allowlistResult.loaded) {
    console.warn(
      `[worker] allowlist loaded from env: ${allowlistResult.count} tokens`,
    );
  } else {
    console.warn(
      `[worker] ⚠ using seed allowlist (${allowlistResult.count} tokens); reason: ${allowlistResult.reason}`,
    );
  }

  const server = createServer((req, res) => {
    const rawUrl = req.url ?? '/';
    const pathname = rawUrl.split('?')[0] ?? '/';

    if (pathname === '/health') {
      sendJson(res, 200, { ok: true, agent: agentLoop.getStatus() });
      return;
    }

    const match = ADMIN_PATH_RE.exec(pathname);
    if (match && req.method === 'POST') {
      void handleAdmin(req, res, match[1], match[2] ?? null);
      return;
    }
    res.writeHead(404);
    res.end();
  });

  server.listen(PORT, () => {
    console.warn(`[worker] http server listening on :${PORT}`);
  });

  try {
    await agentLoop.start();
    console.warn('[worker] agent loop started');
  } catch (err) {
    console.error(
      '[worker] agent loop failed to start:',
      err instanceof Error ? (err.stack ?? err.message) : String(err),
    );
    process.exit(1);
  }

  const statusTimer = setInterval(() => {
    realtimeService.broadcast({
      type: 'agent_status_snapshot',
      data: agentLoop.getStatus(),
      timestamp: Date.now(),
    });
  }, STATUS_BROADCAST_INTERVAL_MS);

  const shutdown = async (signal: string): Promise<void> => {
    console.warn(`[worker] received ${signal}, shutting down`);
    clearInterval(statusTimer);
    server.close();
    try {
      await agentLoop.stop();
    } catch (err) {
      console.error('[worker] stop failed:', err);
    }
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    console.error(
      '[worker] unhandledRejection:',
      reason instanceof Error ? reason.stack : reason,
    );
  });
  process.on('uncaughtException', (e) => {
    console.error('[worker] uncaughtException:', e.stack ?? e.message);
    void shutdown('uncaughtException');
  });
}

void main();
