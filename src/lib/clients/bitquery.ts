import {
  WS_RECONNECT_INITIAL_MS,
  WS_RECONNECT_MAX_MS,
} from '@/config/perception';

const BITQUERY_GRAPHQL_URL = 'https://streaming.bitquery.io/graphql';
const BITQUERY_WS_URL = 'wss://streaming.bitquery.io/graphql';

function extractWsErrorDetail(event: Event | ErrorEvent | unknown): string {
  if (!event || typeof event !== 'object') return String(event);
  const candidate = event as {
    message?: unknown;
    error?: unknown;
    code?: unknown;
    reason?: unknown;
    type?: unknown;
  };
  const parts: string[] = [];
  if (typeof candidate.message === 'string' && candidate.message.length > 0) parts.push(candidate.message);
  if (candidate.error instanceof Error) parts.push(candidate.error.message);
  if (typeof candidate.code === 'number' || typeof candidate.code === 'string') parts.push(`code=${candidate.code}`);
  if (typeof candidate.reason === 'string' && candidate.reason.length > 0) parts.push(`reason=${candidate.reason}`);
  if (typeof candidate.type === 'string' && candidate.type.length > 0) parts.push(`type=${candidate.type}`);
  return parts.length > 0 ? parts.join(' · ') : 'opaque ErrorEvent (no message/code/reason)';
}

export class BitqueryClient {
  private readonly apiKey: string;
  private readonly wsToken: string;

  constructor(apiKey: string, wsToken: string) {
    this.apiKey = apiKey;
    this.wsToken = wsToken;
  }

  subscribeToEvents(
    subscriptionQuery: string,
    onEvent: (data: unknown) => void,
    onError?: (error: Error) => void
  ): () => void {
    let ws: WebSocket | null = null;
    let reconnectAttempts = 0;
    let closed = false;

    const connect = () => {
      if (closed) return;

      ws = new WebSocket(BITQUERY_WS_URL, 'graphql-ws');

      ws.onopen = () => {
        reconnectAttempts = 0;
        ws?.send(JSON.stringify({ type: 'connection_init', payload: { Authorization: `Bearer ${this.wsToken}` } }));
        ws?.send(JSON.stringify({ id: '1', type: 'start', payload: { query: subscriptionQuery } }));
      };

      ws.onmessage = (event) => {
        const message = JSON.parse(String(event.data)) as { type: string; payload?: { data?: unknown } };
        if (message.type === 'data' && message.payload?.data) {
          onEvent(message.payload.data);
        }
      };

      ws.onerror = (event) => {
        const detail = extractWsErrorDetail(event);
        const error = new Error(`Bitquery WebSocket error: ${detail}`);
        console.error(`[bitquery] WebSocket error: ${detail}`);
        onError?.(error);
      };

      ws.onclose = (event) => {
        if (closed) return;
        const delay = Math.min(
          WS_RECONNECT_INITIAL_MS * Math.pow(2, reconnectAttempts) + Math.random() * 500,
          WS_RECONNECT_MAX_MS
        );
        reconnectAttempts++;
        const code = (event as CloseEvent).code;
        const reason = (event as CloseEvent).reason;
        console.log(
          `[bitquery] WebSocket closed (code=${code}, reason="${reason || 'none'}"), reconnecting in ${Math.round(delay)}ms (attempt ${reconnectAttempts})`
        );
        setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      closed = true;
      if (ws) {
        ws.close();
        ws = null;
      }
    };
  }

  async queryRecentEvents(query: string, variables?: Record<string, unknown>): Promise<unknown[]> {
    const response = await fetch(BITQUERY_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Bitquery query failed [status=${response.status}]: ${body}`);
    }

    const result = (await response.json()) as { data?: Record<string, unknown>; errors?: unknown[] };
    if (result.errors) {
      throw new Error(`Bitquery query returned errors: ${JSON.stringify(result.errors)}`);
    }

    const data = result.data;
    if (!data) return [];

    const firstKey = Object.keys(data)[0];
    const value = firstKey ? data[firstKey] : [];
    return Array.isArray(value) ? value : [value];
  }
}
