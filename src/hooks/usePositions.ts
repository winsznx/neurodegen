'use client';

import { useEffect, useState } from 'react';
import type { PositionState } from '@/types/execution';

interface PositionsResponse {
  positions: PositionState[];
  total: number;
}

interface UsePositionsState {
  positions: PositionState[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function usePositions(status: 'open' | 'all' = 'open'): UsePositionsState {
  const [positions, setPositions] = useState<PositionState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch(`/api/positions?status=${status}`);
        if (!res.ok) throw new Error(`Positions request failed: ${res.status}`);
        const json = (await res.json()) as PositionsResponse;
        if (!cancelled) {
          setPositions(json.positions);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [status, refreshKey]);

  return {
    positions,
    loading,
    error,
    refresh: () => setRefreshKey((k) => k + 1),
  };
}
