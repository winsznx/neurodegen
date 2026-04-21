import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { agentLoop } from '@/lib/services/agentLoop';
import { dailySummaryScheduler } from '@/lib/services/notifications/dailySummary';
import { realtimeService } from '@/lib/services/realtimeService';
import { getPositionById } from '@/lib/queries/positions';

const TAG = '[worker]';
const HEALTH_PORT = Number(process.env.PORT ?? 8080);
const STATUS_BROADCAST_INTERVAL_MS = 10_000;
const OPEN_STATES = new Set(['submitted', 'pending', 'filled', 'managed']);

function log(...args: unknown[]): void {
  console.log(new Date().toISOString(), TAG, ...args);
}

function err(...args: unknown[]): void {
  console.error(new Date().toISOString(), TAG, ...args);
}

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

async function handleAdmin(
  req: IncomingMessage,
  res: ServerResponse,
  op: string,
  param: string | null
): Promise<void> {
  if (!checkAdmin(req)) return unauthorized(res);

  try {
    switch (op) {
      case 'start': {
        const status = agentLoop.getStatus();
        if (status.running) return sendJson(res, 200, { started: false, reason: 'already running', status });
        await agentLoop.start();
        return sendJson(res, 200, { started: true, status: agentLoop.getStatus() });
      }
      case 'stop': {
        await agentLoop.stop();
        return sendJson(res, 200, { stopped: true, status: agentLoop.getStatus() });
      }
      case 'trigger': {
        const graph = await agentLoop.runSingleCycle();
        return sendJson(res, 200, {
          triggered: true,
          graphId: graph.graphId,
          action: graph.finalAction.action,
        });
      }
      case 'close': {
        if (!param) return sendJson(res, 400, { error: 'positionId required' });
        const position = await getPositionById(param).catch(() => null);
        if (!position) return sendJson(res, 404, { error: 'position not found' });
        if (!OPEN_STATES.has(position.status)) {
          return sendJson(res, 409, { error: `position is ${position.status}, not closeable` });
        }
        const gateway = agentLoop.getExecutionGateway();
        if (!gateway) return sendJson(res, 503, { error: 'execution gateway not initialized' });
        const result = await gateway.closeSinglePosition(position, 'manual');
        return sendJson(res, result.closed ? 200 : 500, result);
      }
      case 'status': {
        return sendJson(res, 200, agentLoop.getStatus());
      }
      default:
        return sendJson(res, 404, { error: `unknown op: ${op}` });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    err(`admin ${op} failed:`, msg);
    return sendJson(res, 500, { error: msg });
  }
}

const ADMIN_PATH_RE = /^\/admin\/([a-z]+)(?:\/([^/?]+))?$/;

function preflightEnv(): void {
  const required: Array<{ name: string; hint: string }> = [
    { name: 'ADMIN_SECRET', hint: 'shared with Vercel web service; signs the event-bridge POST' },
    { name: 'SUPABASE_URL', hint: 'database' },
    { name: 'SUPABASE_SERVICE_ROLE_KEY', hint: 'database writes' },
    { name: 'BSC_RPC_URL', hint: 'viem chain client' },
    { name: 'BITQUERY_API_KEY', hint: 'Four.meme event stream' },
    { name: 'BITQUERY_WS_TOKEN', hint: 'Bitquery WebSocket auth — without this, all 5 subscriptions fail with opaque ErrorEvent' },
    { name: 'DGRID_API_KEY', hint: 'LLM gateway — cognition cycles will fail' },
    { name: 'NEURODEGEN_AGENT_PRIVATE_KEY', hint: 'agent signer (only needed when ENABLE_EXECUTION=true)' },
  ];
  const missing = required.filter((r) => !process.env[r.name]);
  if (missing.length > 0) {
    err('⚠ missing env vars:');
    for (const r of missing) err(`  - ${r.name} (${r.hint})`);
  }

  if (process.env.WORKER_MODE !== 'true') {
    err(
      '⚠ WORKER_MODE is not "true" — realtimeService will NOT forward events to the web. ' +
        'Every SSE broadcast will be a no-op. Set WORKER_MODE=true in Railway service env.'
    );
  }
  if (!process.env.WEB_BROADCAST_URL) {
    err(
      '⚠ WEB_BROADCAST_URL is not set — even if WORKER_MODE=true, the worker has nowhere to forward events. ' +
        'Set WEB_BROADCAST_URL=https://<web-domain>/api/events/broadcast.'
    );
  }
}

async function main(): Promise<void> {
  log('booting', {
    workerMode: process.env.WORKER_MODE,
    webBroadcastUrl: process.env.WEB_BROADCAST_URL ? 'set' : 'unset',
    adminPort: HEALTH_PORT,
    enableExecution: process.env.ENABLE_EXECUTION ?? 'unset(false)',
    dryRunMode: process.env.DRY_RUN_MODE ?? 'unset(true)',
    enableByokRouting: process.env.ENABLE_BYOK_ROUTING ?? 'unset(false)',
    enableAttestation: process.env.ENABLE_ATTESTATION ?? 'unset(true)',
  });
  preflightEnv();

  const startedAt = Date.now();

  const server = createServer((req, res) => {
    const rawUrl = req.url ?? '/';
    const pathname = rawUrl.split('?')[0] ?? '/';

    if (pathname === '/health') {
      sendJson(res, 200, { ok: true, uptime: Date.now() - startedAt, agent: agentLoop.getStatus() });
      return;
    }

    const match = ADMIN_PATH_RE.exec(pathname);
    if (match && req.method === 'POST') {
      const op = match[1];
      const param = match[2] ?? null;
      void handleAdmin(req, res, op, param);
      return;
    }

    res.writeHead(404);
    res.end();
  });

  server.listen(HEALTH_PORT, () => {
    log(`http server listening on :${HEALTH_PORT} (/health + /admin/{start,stop,trigger,status,close/:id})`);
  });

  try {
    await agentLoop.start();
    log('agent loop started');
  } catch (e) {
    err('agent loop failed to start:', e instanceof Error ? e.stack ?? e.message : String(e));
    process.exit(1);
  }

  dailySummaryScheduler.start();

  const broadcastStatus = (): void => {
    realtimeService.broadcast({
      type: 'agent_status_snapshot',
      data: agentLoop.getStatus(),
      timestamp: Date.now(),
    });
  };
  broadcastStatus();
  const statusTimer = setInterval(broadcastStatus, STATUS_BROADCAST_INTERVAL_MS);

  const shutdown = async (signal: string): Promise<void> => {
    log(`received ${signal}, shutting down`);
    clearInterval(statusTimer);
    server.close();
    dailySummaryScheduler.stop();
    try {
      await agentLoop.stop();
    } catch (e) {
      err('stop failed:', e);
    }
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    err('unhandledRejection:', reason instanceof Error ? reason.stack : reason);
  });
  process.on('uncaughtException', (e) => {
    err('uncaughtException:', e.stack ?? e.message);
    void shutdown('uncaughtException');
  });
}

void main();
