import {
  WS_RECONNECT_INITIAL_MS,
  WS_RECONNECT_MAX_MS,
} from '@/config/perception';

const BITQUERY_GRAPHQL_URL = 'https://streaming.bitquery.io/graphql';
const BITQUERY_WS_URL = 'wss://streaming.bitquery.io/graphql';

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
        const error = new Error(`Bitquery WebSocket error: ${String(event)}`);
        console.error(`[bitquery] WebSocket error`, error.message);
        onError?.(error);
      };

      ws.onclose = () => {
        if (closed) return;
        const delay = Math.min(
          WS_RECONNECT_INITIAL_MS * Math.pow(2, reconnectAttempts) + Math.random() * 500,
          WS_RECONNECT_MAX_MS
        );
        reconnectAttempts++;
        console.log(`[bitquery] WebSocket closed, reconnecting in ${Math.round(delay)}ms (attempt ${reconnectAttempts})`);
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
