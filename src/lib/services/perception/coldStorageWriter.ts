import { insertEventBatch } from '@/lib/queries/events';
import { EVENT_BATCH_SIZE } from '@/config/perception';
import type { PerceptionEvent } from '@/types/perception';

const FLUSH_INTERVAL_MS = 5_000;
const MAX_BUFFER_SIZE = EVENT_BATCH_SIZE * 10;

export class ColdStorageWriter {
  private buffer: PerceptionEvent[] = [];
  private flushInterval: ReturnType<typeof setInterval> | null = null;

  start(): void {
    if (this.flushInterval) return;
    this.flushInterval = setInterval(() => {
      void this.flush();
    }, FLUSH_INTERVAL_MS);
  }

  async stop(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    await this.flush();
  }

  addEvent(event: PerceptionEvent): void {
    if (this.buffer.length >= MAX_BUFFER_SIZE) {
      const dropCount = this.buffer.length - MAX_BUFFER_SIZE + 1;
      this.buffer.splice(0, dropCount);
      console.warn(`[cold-storage] Buffer overflow: dropped ${dropCount} events`);
    }
    this.buffer.push(event);

    if (this.buffer.length >= EVENT_BATCH_SIZE) {
      void this.flush();
    }
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const toFlush = this.buffer.splice(0, this.buffer.length);
    try {
      await insertEventBatch(toFlush);
    } catch (err) {
      console.error(
        `[cold-storage] Flush failed, re-queuing ${toFlush.length} events:`,
        err instanceof Error ? err.message : String(err)
      );
      this.buffer.unshift(...toFlush);
    }
  }
}
