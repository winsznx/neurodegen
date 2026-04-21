import { createServer } from 'node:http';
import { agentLoop } from '@/lib/services/agentLoop';
import { dailySummaryScheduler } from '@/lib/services/notifications/dailySummary';

const TAG = '[worker]';
const HEALTH_PORT = Number(process.env.PORT ?? 8080);

function log(...args: unknown[]): void {
  console.log(new Date().toISOString(), TAG, ...args);
}

function err(...args: unknown[]): void {
  console.error(new Date().toISOString(), TAG, ...args);
}

async function main(): Promise<void> {
  log('booting', {
    workerMode: process.env.WORKER_MODE,
    webBroadcastUrl: process.env.WEB_BROADCAST_URL ? 'set' : 'unset',
    enableExecution: process.env.ENABLE_EXECUTION,
  });

  const startedAt = Date.now();

  const server = createServer((req, res) => {
    if (req.url === '/health') {
      const status = agentLoop.getStatus();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          ok: true,
          uptime: Date.now() - startedAt,
          agent: {
            running: status.running,
            cycleCount: status.cycleCount,
            lastCycleAt: status.lastCycleAt,
            regime: status.currentRegime,
            perception: status.perceptionHealthy,
            cognition: status.cognitionHealthy,
            execution: status.executionHealthy,
          },
        })
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });

  server.listen(HEALTH_PORT, () => {
    log(`health endpoint listening on :${HEALTH_PORT}/health`);
  });

  try {
    await agentLoop.start();
    log('agent loop started');
  } catch (e) {
    err('agent loop failed to start:', e instanceof Error ? e.stack ?? e.message : String(e));
    process.exit(1);
  }

  dailySummaryScheduler.start();

  const shutdown = async (signal: string): Promise<void> => {
    log(`received ${signal}, shutting down`);
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
