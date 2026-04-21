import { HOT_STATE_TTL_MINUTES } from '@/config/perception';
import type { PerceptionEvent, AggregateMetrics } from '@/types/perception';

interface StoredEvent {
  event: PerceptionEvent;
  expiresAt: number;
}

const EVICTION_THROTTLE_MS = 60_000;

export class HotStateStore {
  private events = new Map<string, StoredEvent>();
  private currentMetrics: AggregateMetrics | null = null;
  private lastEvictionAt = 0;
  private readonly ttlMs: number;

  constructor(ttlMinutes: number = HOT_STATE_TTL_MINUTES) {
    this.ttlMs = ttlMinutes * 60 * 1000;
  }

  addEvent(event: PerceptionEvent): void {
    const expiresAt = Date.now() + this.ttlMs;
    this.events.set(event.eventId, { event, expiresAt });
    this.maybeEvict();
  }

  getRecentEvents(source?: string, limit?: number): PerceptionEvent[] {
    const all: PerceptionEvent[] = [];
    const now = Date.now();

    for (const stored of this.events.values()) {
      if (stored.expiresAt <= now) continue;
      if (source && stored.event.source !== source) continue;
      all.push(stored.event);
    }

    all.sort((a, b) => b.timestamp - a.timestamp);
    return limit ? all.slice(0, limit) : all;
  }

  setMetrics(metrics: AggregateMetrics): void {
    this.currentMetrics = metrics;
  }

  getMetrics(): AggregateMetrics | null {
    return this.currentMetrics;
  }

  evict(): void {
    const now = Date.now();
    for (const [key, stored] of this.events) {
      if (stored.expiresAt <= now) {
        this.events.delete(key);
      }
    }
    this.lastEvictionAt = now;
  }

  getEventCount(): number {
    return this.events.size;
  }

  private maybeEvict(): void {
    if (Date.now() - this.lastEvictionAt > EVICTION_THROTTLE_MS) {
      this.evict();
    }
  }
}

export const hotState = new HotStateStore();
