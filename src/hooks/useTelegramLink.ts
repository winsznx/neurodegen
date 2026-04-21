'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TelegramSubscription } from '@/types/telegram';

interface TelegramStatusResponse {
  configured: boolean;
  botUsername: string | null;
  subscription: TelegramSubscription | null;
}

export interface UseTelegramLinkState {
  loading: boolean;
  configured: boolean;
  botUsername: string | null;
  subscription: TelegramSubscription | null;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useTelegramLink(): UseTelegramLinkState {
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<TelegramSubscription | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch('/api/me/telegram', { credentials: 'include' });
      if (res.status === 401) {
        if (mountedRef.current) {
          setConfigured(false);
          setSubscription(null);
        }
        return;
      }
      if (!res.ok) throw new Error(`/api/me/telegram status ${res.status}`);
      const json = (await res.json()) as TelegramStatusResponse;
      if (mountedRef.current) {
        setConfigured(json.configured);
        setBotUsername(json.botUsername);
        setSubscription(json.subscription);
      }
    } catch (err) {
      if (mountedRef.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();

    const handler = (): void => {
      void refresh();
    };
    window.addEventListener('neurodegen:telegram-linked', handler);

    return () => {
      mountedRef.current = false;
      window.removeEventListener('neurodegen:telegram-linked', handler);
    };
  }, [refresh]);

  return { loading, configured, botUsername, subscription, error, refresh };
}
