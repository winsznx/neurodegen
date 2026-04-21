import type { RegimeLabel, ReasoningGraph } from '@/types/cognition';
import type { LaunchEvent, MarketSnapshot, PurchaseEvent } from '@/types/perception';
import { MYX_POLL_INTERVAL_MS } from '@/config/perception';
import { CLAUDE_CALL_FREQUENCY } from '@/config/cognition';
import { ENABLE_EXECUTION } from '@/config/features';
import { realtimeService } from './realtimeService';
import { hotState } from '@/lib/stores/hotState';
import { aggregator } from '@/lib/services/perception/aggregatorService';
import { insertMetrics } from '@/lib/queries/metrics';
import { getOpenPositions } from '@/lib/queries/positions';
import { FourMemeIngester } from '@/lib/services/perception/fourMemeIngester';
import { MYXMarketPoller } from '@/lib/services/perception/myxMarketPoller';
import { ColdStorageWriter } from '@/lib/services/perception/coldStorageWriter';
import { ReasoningOrchestrator } from '@/lib/services/cognition/reasoningOrchestrator';
import { FallbackHandler } from '@/lib/services/cognition/fallbackHandler';
import { RegimeClassifier } from '@/lib/services/cognition/regimeClassifier';
import { ReasoningGraphBuilder } from '@/lib/services/cognition/reasoningGraphBuilder';
import { BitqueryClient } from '@/lib/clients/bitquery';
import { MYXMarketClient } from '@/lib/clients/myx';
import { ExecutionGateway } from '@/lib/services/execution/executionGateway';
import { buildExecutionLayer } from '@/lib/services/execution/executionFactory';
import { computeReasoningCommitment } from '@/lib/utils/reasoningHash';

export interface AgentStatus {
  running: boolean;
  cycleCount: number;
  lastCycleAt: number | null;
  currentRegime: RegimeLabel;
  openPositionCount: number;
  connectedSSEClients: number;
  perceptionHealthy: boolean;
  cognitionHealthy: boolean;
  executionHealthy: boolean;
}

export class AgentLoop {
  private running = false;
  private cycleCount = 0;
  private lastCycleAt: number | null = null;
  private currentRegime: RegimeLabel = 'quiet';
  private previousRegime: RegimeLabel | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private ingester: FourMemeIngester | null = null;
  private poller: MYXMarketPoller | null = null;
  private coldWriter: ColdStorageWriter | null = null;
  private gateway: ExecutionGateway | null = null;
  private orchestrator: ReasoningOrchestrator;
  private latestSnapshots: MarketSnapshot[] = [];
  private openPositionCount = 0;

  constructor() {
    this.orchestrator = new ReasoningOrchestrator(
      new FallbackHandler(),
      new RegimeClassifier(),
      new ReasoningGraphBuilder()
    );
  }

  getExecutionGateway(): ExecutionGateway | null {
    return this.gateway;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    this.coldWriter = new ColdStorageWriter();
    this.coldWriter.start();

    this.ingester = new FourMemeIngester(
      new BitqueryClient(process.env.BITQUERY_API_KEY ?? '', process.env.BITQUERY_WS_TOKEN ?? ''),
      hotState,
      (event) => {
        this.coldWriter?.addEvent(event);
        realtimeService.broadcast({ type: 'perception_event', data: event, timestamp: Date.now() });
      }
    );
    this.ingester.start();

    const myxBaseUrl = process.env.MYX_API_BASE_URL ?? 'https://api.myx.finance';
    this.poller = new MYXMarketPoller(
      new MYXMarketClient(myxBaseUrl),
      hotState,
      (snapshot) => {
        this.latestSnapshots = [snapshot, ...this.latestSnapshots.filter((s) => s.pair !== snapshot.pair)];
        realtimeService.broadcast({ type: 'perception_event', data: snapshot, timestamp: Date.now() });
      }
    );
    this.poller.start();

    if (ENABLE_EXECUTION) {
      try {
        const layer = buildExecutionLayer();
        this.gateway = layer.gateway;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[agent-loop] execution layer not initialized:', msg);
      }
    }

    this.interval = setInterval(() => {
      void this.runCycle();
    }, MYX_POLL_INTERVAL_MS);
    console.log('[agent-loop] started');
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.interval) { clearInterval(this.interval); this.interval = null; }
    this.ingester?.stop();
    this.poller?.stop();
    this.gateway?.stop();
    if (this.coldWriter) await this.coldWriter.stop();
    console.log('[agent-loop] stopped');
  }

  async runSingleCycle(): Promise<ReasoningGraph> {
    const events = hotState.getRecentEvents();
    const launches = events.filter((e): e is LaunchEvent => e.eventType === 'token_create');
    const purchases = events.filter((e): e is PurchaseEvent => e.eventType === 'token_purchase');
    const metrics = aggregator.computeMetrics(events, this.latestSnapshots);
    hotState.setMetrics(metrics);

    const graph = await this.orchestrator.runCycle(launches, purchases, metrics, this.latestSnapshots);
    realtimeService.broadcast({ type: 'reasoning_complete', data: graph, timestamp: Date.now() });
    return graph;
  }

  getStatus(): AgentStatus {
    return {
      running: this.running,
      cycleCount: this.cycleCount,
      lastCycleAt: this.lastCycleAt,
      currentRegime: this.currentRegime,
      openPositionCount: this.openPositionCount,
      connectedSSEClients: realtimeService.getClientCount(),
      perceptionHealthy: !!this.ingester?.isRunning() && !!this.poller?.isRunning(),
      cognitionHealthy: this.lastCycleAt === null || Date.now() - this.lastCycleAt < 300_000,
      executionHealthy: !ENABLE_EXECUTION || this.gateway !== null,
    };
  }

  private async runCycle(): Promise<void> {
    try {
      const events = hotState.getRecentEvents();
      const metrics = aggregator.computeMetrics(events, this.latestSnapshots);
      hotState.setMetrics(metrics);
      void insertMetrics(metrics).catch((err) => console.error('[agent-loop] metrics insert failed:', err));
      realtimeService.broadcast({ type: 'metrics_update', data: metrics, timestamp: Date.now() });

      const positions = await getOpenPositions().catch(() => []);
      this.openPositionCount = positions.length;

      if (this.cycleCount % CLAUDE_CALL_FREQUENCY === 0) {
        await this.runCognitionAndExecution(events, metrics);
      }

      this.cycleCount++;
      this.lastCycleAt = Date.now();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[agent-loop] cycle error:', msg);
      realtimeService.broadcast({
        type: 'health_degradation',
        data: { source: 'agent_loop', message: msg },
        timestamp: Date.now(),
      });
    }
  }

  private async runCognitionAndExecution(
    events: ReturnType<typeof hotState.getRecentEvents>,
    metrics: ReturnType<typeof aggregator.computeMetrics>
  ): Promise<void> {
    const launches = events.filter((e): e is LaunchEvent => e.eventType === 'token_create');
    const purchases = events.filter((e): e is PurchaseEvent => e.eventType === 'token_purchase');
    const graph = await this.orchestrator.runCycle(launches, purchases, metrics, this.latestSnapshots);
    realtimeService.broadcast({ type: 'reasoning_complete', data: graph, timestamp: Date.now() });
    this.currentRegime = graph.regime;
    if (this.previousRegime && this.previousRegime !== this.currentRegime) {
      realtimeService.broadcast({
        type: 'regime_change',
        data: { from: this.previousRegime, to: this.currentRegime },
        timestamp: Date.now(),
      });
    }
    if (this.gateway) {
      const parameters = new RegimeClassifier().classify(metrics).parameters;
      const commitment = computeReasoningCommitment(graph);
      const execResult = await this.gateway.executeAction(graph.finalAction, parameters, graph.graphId, commitment);
      if (execResult.executed) realtimeService.broadcast({ type: 'position_update', data: execResult, timestamp: Date.now() });
      await this.gateway.checkAndClosePositions(this.currentRegime, this.previousRegime);
    }
    this.previousRegime = this.currentRegime;
  }
}

export const agentLoop = new AgentLoop();
