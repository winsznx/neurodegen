export type SSEEventType =
  | 'perception_event'
  | 'metrics_update'
  | 'regime_change'
  | 'reasoning_complete'
  | 'position_update'
  | 'health_degradation'
  | 'telegram_linked';

export interface SSEEvent {
  type: SSEEventType;
  data: unknown;
  timestamp: number;
  userId?: string;
}

const encoder = new TextEncoder();

function isWorker(): boolean {
  return process.env.WORKER_MODE === 'true';
}

function jsonReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

export class RealtimeService {
  private clients = new Set<WritableStreamDefaultWriter<Uint8Array>>();

  addClient(writer: WritableStreamDefaultWriter<Uint8Array>): () => void {
    this.clients.add(writer);
    return () => {
      this.clients.delete(writer);
    };
  }

  broadcast(event: SSEEvent): void {
    if (isWorker()) {
      void this.forwardToWeb(event);
      return;
    }
    this.fanout(event);
  }

  private fanout(event: SSEEvent): void {
    const serialized = JSON.stringify(event.data, jsonReplacer);
    const message = encoder.encode(`event: ${event.type}\ndata: ${serialized}\n\n`);

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
      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': secret,
        },
        body: JSON.stringify(event, jsonReplacer),
      });
    } catch (err) {
      console.error('[realtime] forward to web failed:', err instanceof Error ? err.message : String(err));
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
