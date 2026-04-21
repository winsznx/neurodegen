import type { AgentStatus } from './agentLoop';
import { fetchWorkerStatusRaw } from './workerAdminProxy';

export interface WorkerStatusView {
  status: AgentStatus | null;
  receivedAt: number | null;
  stale: boolean;
  source: 'worker' | 'none';
}

export interface ResolvedStatus {
  status: AgentStatus | null;
  receivedAt: number | null;
  stale: boolean;
  source: 'cache' | 'fetched' | 'fetched-stale-fallback' | 'none';
  error: string | null;
}

const STALE_AFTER_MS = 30_000;

let latest: { status: AgentStatus; receivedAt: number } | null = null;

function isAgentStatus(value: unknown): value is AgentStatus {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.running === 'boolean' &&
    typeof v.cycleCount === 'number' &&
    (v.lastCycleAt === null || typeof v.lastCycleAt === 'number') &&
    typeof v.currentRegime === 'string' &&
    typeof v.openPositionCount === 'number' &&
    typeof v.connectedSSEClients === 'number' &&
    typeof v.perceptionHealthy === 'boolean' &&
    typeof v.cognitionHealthy === 'boolean' &&
    typeof v.executionHealthy === 'boolean'
  );
}

export function setWorkerStatus(raw: unknown): boolean {
  if (!isAgentStatus(raw)) return false;
  latest = { status: raw, receivedAt: Date.now() };
  return true;
}

export function getWorkerStatus(): WorkerStatusView {
  if (!latest) {
    return { status: null, receivedAt: null, stale: true, source: 'none' };
  }
  const stale = Date.now() - latest.receivedAt > STALE_AFTER_MS;
  return { status: latest.status, receivedAt: latest.receivedAt, stale, source: 'worker' };
}

export function clearWorkerStatus(): void {
  latest = null;
}

export async function resolveAgentStatus(): Promise<ResolvedStatus> {
  const cached = getWorkerStatus();
  if (cached.status && !cached.stale) {
    return {
      status: cached.status,
      receivedAt: cached.receivedAt,
      stale: false,
      source: 'cache',
      error: null,
    };
  }

  const fresh = await fetchWorkerStatusRaw();
  if (fresh.ok && setWorkerStatus(fresh.status)) {
    const hydrated = getWorkerStatus();
    if (hydrated.status) {
      return {
        status: hydrated.status,
        receivedAt: hydrated.receivedAt,
        stale: false,
        source: 'fetched',
        error: null,
      };
    }
  }

  if (cached.status) {
    return {
      status: cached.status,
      receivedAt: cached.receivedAt,
      stale: true,
      source: 'fetched-stale-fallback',
      error: fresh.ok ? 'fetched payload invalid' : fresh.detail,
    };
  }

  return {
    status: null,
    receivedAt: null,
    stale: true,
    source: 'none',
    error: fresh.ok ? 'no status available' : fresh.detail,
  };
}
