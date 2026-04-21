'use client';

import { useEffect, useRef, useState } from 'react';

export type SSEEventHandler = (event: MessageEvent) => void;

export interface SSEState {
  connected: boolean;
  error: string | null;
}

export function useSSE(
  url: string,
  handlers: Record<string, SSEEventHandler>
): SSEState {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const eventSource = new EventSource(url);

    eventSource.onopen = () => {
      setConnected(true);
      setError(null);
    };

    eventSource.onerror = () => {
      setConnected(false);
      setError('Stream disconnected');
    };

    const listeners = Object.entries(handlersRef.current).map(([eventType, handler]) => {
      const wrapped = (evt: MessageEvent) => handler(evt);
      eventSource.addEventListener(eventType, wrapped);
      return { eventType, wrapped };
    });

    return () => {
      listeners.forEach(({ eventType, wrapped }) => {
        eventSource.removeEventListener(eventType, wrapped);
      });
      eventSource.close();
    };
  }, [url]);

  return { connected, error };
}
