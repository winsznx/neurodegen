'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Subscription, UserPosition, UserRecord } from '@/types/users';

interface MeResponse {
  user: UserRecord | null;
  subscription: Subscription | null;
}

export interface UseMeState {
  loading: boolean;
  user: UserRecord | null;
  subscription: Subscription | null;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useMe(): UseMeState {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserRecord | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch('/api/me', { credentials: 'include' });
      if (res.status === 401) {
        setUser(null);
        setSubscription(null);
        return;
      }
      if (!res.ok) throw new Error(`/api/me status ${res.status}`);
      const json = (await res.json()) as MeResponse;
      setUser(json.user);
      setSubscription(json.subscription);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { loading, user, subscription, error, refresh };
}

export function useMyPositions(): {
  positions: UserPosition[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const [positions, setPositions] = useState<UserPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch('/api/me/positions', { credentials: 'include' });
      if (res.status === 401) {
        setPositions([]);
        return;
      }
      if (!res.ok) throw new Error(`/api/me/positions status ${res.status}`);
      const json = (await res.json()) as { positions: UserPosition[] };
      setPositions(json.positions);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { positions, loading, error, refresh };
}
