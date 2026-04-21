export type SSEEventType =
  | 'perception_event'
  | 'metrics_update'
  | 'regime_change'
  | 'reasoning_complete'
  | 'position_update'
  | 'health_degradation';

export interface SSEEvent {
  type: SSEEventType;
  data: unknown;
  timestamp: number;
}

const encoder = new TextEncoder();

export class RealtimeService {
  private clients = new Set<WritableStreamDefaultWriter<Uint8Array>>();

  addClient(writer: WritableStreamDefaultWriter<Uint8Array>): () => void {
    this.clients.add(writer);
    return () => {
      this.clients.delete(writer);
    };
  }

  broadcast(event: SSEEvent): void {
    const serialized = JSON.stringify(event.data, (_key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    );
    const message = encoder.encode(
      `event: ${event.type}\ndata: ${serialized}\n\n`
    );

    for (const writer of this.clients) {
      writer.write(message).catch(() => {
        this.clients.delete(writer);
      });
    }
  }

  getClientCount(): number {
    return this.clients.size;
  }
}

export const realtimeService = new RealtimeService();
