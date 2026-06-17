import {
  CMC_QUOTES_POLL_INTERVAL_MS,
  CMC_GLOBAL_POLL_INTERVAL_MS,
  CMC_DERIVATIVES_POLL_INTERVAL_MS,
  CMC_NARRATIVES_POLL_INTERVAL_MS,
  CMC_NEWS_POLL_INTERVAL_MS,
} from '@/config/perception';
import { BSC_USDT_ADDRESS, BSC_CAKE_ADDRESS, BSC_WBNB_ADDRESS, BSC_BUSD_ADDRESS } from '@/config/chains';
import { cmcHubClient, type CmcTool } from '@/lib/clients/cmcHubClient';
import {
  normalizeCmcQuotes,
  normalizeDerivatives,
  normalizeFearGreed,
  normalizeNews,
  normalizeSecurity,
  normalizeTrendingNarratives,
} from './eventNormalizer';
import type { HotStateStore } from '@/lib/stores/hotState';
import type { ColdStorageWriter } from './coldStorageWriter';
import type {
  CMCSecurityEvent,
  PerceptionEvent,
  RegimeLabel,
} from '@/types/perception';
import { evaluateEV, x402SpendTracker, type EvSignal } from './evGate';
import type { EVDecision } from '@/types/cognition';

const FALLBACK_ADDRESSES: Record<string, `0x${string}`> = {
  USDT: BSC_USDT_ADDRESS,
  BUSD: BSC_BUSD_ADDRESS,
  CAKE: BSC_CAKE_ADDRESS,
  WBNB: BSC_WBNB_ADDRESS,
};

const DEFAULT_TRACKED_SYMBOLS = ['BTC', 'ETH', 'BNB', 'CAKE'];

export interface CmcIngesterOptions {
  trackedSymbols?: string[];
  onEvent?: (event: PerceptionEvent) => void;
}

export class CmcIngester {
  private running = false;
  private timers: ReturnType<typeof setInterval>[] = [];
  private readonly trackedSymbols: string[];
  private readonly onEvent: (event: PerceptionEvent) => void;

  constructor(
    private readonly hotState: HotStateStore,
    private readonly coldWriter: ColdStorageWriter,
    options: CmcIngesterOptions = {},
  ) {
    this.trackedSymbols = options.trackedSymbols ?? DEFAULT_TRACKED_SYMBOLS;
    this.onEvent = options.onEvent ?? (() => undefined);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    // Kick off each cadence with an immediate run + interval.
    void this.runQuotes();
    void this.runGlobal();
    void this.runDerivatives();
    void this.runNarratives();
    void this.runNews();
    this.timers.push(setInterval(() => void this.runQuotes(), CMC_QUOTES_POLL_INTERVAL_MS));
    this.timers.push(setInterval(() => void this.runGlobal(), CMC_GLOBAL_POLL_INTERVAL_MS));
    this.timers.push(setInterval(() => void this.runDerivatives(), CMC_DERIVATIVES_POLL_INTERVAL_MS));
    this.timers.push(setInterval(() => void this.runNarratives(), CMC_NARRATIVES_POLL_INTERVAL_MS));
    this.timers.push(setInterval(() => void this.runNews(), CMC_NEWS_POLL_INTERVAL_MS));
    console.warn('[cmc-ingester] started');
  }

  stop(): void {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    this.running = false;
    console.warn('[cmc-ingester] stopped');
  }

  isRunning(): boolean {
    return this.running;
  }

  /**
   * Triggered by the cognition layer before a trade is proposed. Evaluates EV;
   * if positive, pays for and fetches a security score via the x402 transport
   * and pushes the resulting CMCSecurityEvent into hot state.
   */
  async ensureSecurityCheck(
    tokenAddress: `0x${string}`,
    regime: RegimeLabel,
    signalMagnitude: number,
  ): Promise<{ decision: EVDecision; event: CMCSecurityEvent | null }> {
    const decision = evaluateEV({
      triggeringSignal: 'security_check',
      regime,
      signalMagnitude,
      gasCostUSD: 0,
    });
    if (!decision.shouldFetchPremium) {
      return { decision, event: null };
    }
    try {
      // cmcHubClient.callX402 invokes the injected x402 pay hook
      // (twakClient.payX402, wired at worker boot via setCmcX402PayHook)
      // and attaches the X-Payment header automatically. The settlement
      // tx hash + proof header are observed there.
      const raw = await cmcHubClient.callX402<unknown>(
        'get_crypto_metrics' as CmcTool,
        { token_address: tokenAddress, network: 'bsc' },
      );
      const event = normalizeSecurity(raw.data);
      if (event) {
        this.recordEvent(event);
        x402SpendTracker.recordSpend(decision);
      }
      return { decision, event };
    } catch (err) {
      console.error(
        '[cmc-ingester] ensureSecurityCheck failed:',
        err instanceof Error ? err.message : String(err),
      );
      return { decision, event: null };
    }
  }

  private recordEvent(event: PerceptionEvent): void {
    this.hotState.addEvent(event);
    this.coldWriter.addEvent(event);
    this.onEvent(event);
  }

  private async runQuotes(): Promise<void> {
    if (!this.running) return;
    try {
      const result = await cmcHubClient.getCryptoQuotes({ symbols: this.trackedSymbols });
      const events = normalizeCmcQuotes(result.data, FALLBACK_ADDRESSES);
      for (const e of events) this.recordEvent(e);
    } catch (err) {
      console.error(
        '[cmc-ingester] runQuotes failed:',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  private async runGlobal(): Promise<void> {
    if (!this.running) return;
    try {
      const result = await cmcHubClient.getGlobalMetrics();
      const event = normalizeFearGreed(result.data);
      if (event) this.recordEvent(event);
    } catch (err) {
      console.error(
        '[cmc-ingester] runGlobal failed:',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  private async runDerivatives(): Promise<void> {
    if (!this.running) return;
    try {
      const result = await cmcHubClient.getDerivativesMetrics();
      const events = normalizeDerivatives(result.data);
      for (const e of events) this.recordEvent(e);
    } catch (err) {
      console.error(
        '[cmc-ingester] runDerivatives failed:',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  private async runNarratives(): Promise<void> {
    if (!this.running) return;
    try {
      const result = await cmcHubClient.getTrendingNarratives({ limit: 10 });
      const events = normalizeTrendingNarratives(result.data);
      for (const e of events) this.recordEvent(e);
    } catch (err) {
      console.error(
        '[cmc-ingester] runNarratives failed:',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  private async runNews(): Promise<void> {
    if (!this.running) return;
    try {
      const result = await cmcHubClient.getLatestNews({ limit: 10 });
      const events = normalizeNews(result.data);
      for (const e of events) this.recordEvent(e);
    } catch (err) {
      console.error(
        '[cmc-ingester] runNews failed:',
        err instanceof Error ? err.message : String(err),
      );
    }
  }
}

export function evSignalFromMetrics(metrics: {
  activeSurgeTokens: number;
  fearGreedValue: number;
}): EvSignal {
  if (metrics.activeSurgeTokens >= 5) return 'volume_surge';
  if (metrics.fearGreedValue >= 80 || metrics.fearGreedValue <= 20) return 'price_spike';
  return 'narrative_emergence';
}
