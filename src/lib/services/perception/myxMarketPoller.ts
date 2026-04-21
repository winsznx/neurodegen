import type { MYXMarketClient } from '@/lib/clients/myx';
import type { HotStateStore } from '@/lib/stores/hotState';
import type { MarketSnapshot } from '@/types/perception';
import { MYX_POLL_INTERVAL_MS, MYX_TRACKED_PAIRS } from '@/config/perception';

const MAX_CONSECUTIVE_FAILURES_WARN = 3;
const MAX_CONSECUTIVE_FAILURES_STOP = 10;

export class MYXMarketPoller {
  private interval: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private consecutiveFailures = 0;

  constructor(
    private myxClient: MYXMarketClient,
    private hotState: HotStateStore,
    private onSnapshot: (snapshot: MarketSnapshot) => void
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.consecutiveFailures = 0;

    this.interval = setInterval(() => {
      void this.poll();
    }, MYX_POLL_INTERVAL_MS);

    void this.poll();
    console.log(`[myx-poller] Started polling every ${MYX_POLL_INTERVAL_MS}ms`);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.running = false;
    console.log('[myx-poller] Stopped');
  }

  isRunning(): boolean {
    return this.running;
  }

  async pollOnce(): Promise<MarketSnapshot[]> {
    const snapshots = await this.myxClient.getTrackedPairData(MYX_TRACKED_PAIRS);
    for (const snapshot of snapshots) {
      this.hotState.addEvent(snapshot);
      this.onSnapshot(snapshot);
    }
    return snapshots;
  }

  private async poll(): Promise<void> {
    try {
      await this.pollOnce();
      this.consecutiveFailures = 0;
    } catch (err) {
      this.consecutiveFailures++;
      const message = err instanceof Error ? err.message : String(err);

      if (this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES_STOP) {
        console.error(
          `[myx-poller] MYX market polling paused after ${MAX_CONSECUTIVE_FAILURES_STOP} consecutive failures`
        );
        this.stop();
        return;
      }

      if (this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES_WARN) {
        console.error(
          `[myx-poller] ${this.consecutiveFailures} consecutive failures: ${message}`
        );
      }
    }
  }
}
