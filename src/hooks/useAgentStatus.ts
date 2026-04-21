'use client';

import { useEffect, useState } from 'react';

export interface AgentStatusResponse {
  status: 'running' | 'stopped';
  lastCycleAt: number | null;
  openPositions: number;
  regime: string;
  cycleCount: number;
  connectedClients: number;
}

export interface AgentStatusState {
  data: AgentStatusResponse | null;
  loading: boolean;
  error: string | null;
}

const POLL_INTERVAL_MS = 10_000;

export function useAgentStatus(): AgentStatusState {
  const [data, setData] = useState<AgentStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/agent/status');
        if (!res.ok) throw new Error(`Status request failed: ${res.status}`);
        const json = (await res.json()) as AgentStatusResponse;
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchStatus();
    const interval = setInterval(fetchStatus, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return { data, loading, error };
}
