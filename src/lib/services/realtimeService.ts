export type SSEEventType =
  | 'perception_event'
  | 'metrics_update'
  | 'regime_change'
  | 'committee_session_started'
  | 'committee_session_complete'
  | 'position_update'
  | 'health_degradation'
  | 'agent_status_snapshot';

export interface SSEEvent {
  type: SSEEventType;
  data: unknown;
  timestamp: number;
}

const encoder = new TextEncoder();

function isWorker(): boolean {
  return process.env.WORKER_MODE === 'true';
}

function jsonReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

export type SSEEventListener = (event: SSEEvent) => void;

export class RealtimeService {
  private clients = new Set<WritableStreamDefaultWriter<Uint8Array>>();
  private listeners = new Set<SSEEventListener>();

  addClient(writer: WritableStreamDefaultWriter<Uint8Array>): () => void {
    this.clients.add(writer);
    return () => {
      this.clients.delete(writer);
    };
  }

  /**
   * Subscribe a synchronous in-process listener invoked before SSE fanout /
   * worker forward. Used by the Telegram alerter (and any future in-process
   * subscriber) to observe every event with zero latency. Throwing listeners
   * are isolated; they do not break fanout to other listeners or SSE clients.
   * Returns a disposer.
   */
  addListener(fn: SSEEventListener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  broadcast(event: SSEEvent): void {
    for (const fn of this.listeners) {
      try {
        fn(event);
      } catch (err) {
        console.error(
          '[realtime] listener threw:',
          err instanceof Error ? err.message : String(err),
        );
      }
    }
    if (isWorker()) {
      void this.forwardToWeb(event);
      return;
    }
    this.fanout(event);
  }

  private fanout(event: SSEEvent): void {
    const serialized = JSON.stringify(event.data, jsonReplacer);
    const message = encoder.encode(
      `event: ${event.type}\ndata: ${serialized}\n\n`,
    );

    for (const writer of this.clients) {
      writer.write(message).catch(() => {
        this.clients.delete(writer);
      });
    }
  }

  private async forwardToWeb(event: SSEEvent): Promise<void> {
    const url = process.env.WEB_BROADCAST_URL;
    const secret = process.env.ADMIN_SECRET;
    if (!url || !secret) return;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': secret,
        },
        body: JSON.stringify(event, jsonReplacer),
      });
      if (!response.ok) {
        console.error(
          '[realtime] forward to web failed:',
          `HTTP ${response.status}`,
        );
      }
    } catch (err) {
      console.error(
        '[realtime] forward to web failed:',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  receiveFromWorker(event: SSEEvent): void {
    this.fanout(event);
  }

  getClientCount(): number {
    return this.clients.size;
  }
}

export const realtimeService = new RealtimeService();
