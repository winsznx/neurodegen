import {
  CMC_QUOTES_POLL_INTERVAL_MS,
  REGIME_REEVAL_INTERVAL_MS,
} from '@/config/perception';
import { realtimeService } from './realtimeService';
import { hotState } from '@/lib/stores/hotState';
import { ColdStorageWriter } from '@/lib/services/perception/coldStorageWriter';
import { keccak256, stringToBytes } from 'viem';
import { canonicalize } from '@/lib/utils/canonicalSerialize';
import { CmcIngester } from '@/lib/services/perception/cmcIngester';
import { setCmcX402PayHook } from '@/lib/clients/cmcHubClient';
import { aggregateMetrics } from '@/lib/services/perception/aggregatorService';
import { llmSpendTracker } from '@/lib/clients/llm/spendTracker';
import { promptCache } from '@/lib/clients/llm/promptCache';
import {
  classifyRegime,
  advanceRegimeState,
  emptyRegimeState,
  type RegimeClassifierState,
} from '@/lib/services/perception/regimeClassifier';
import { runCommitteeSession } from '@/lib/services/cognition/committeeSession';
import { TwakExecutor } from '@/lib/services/execution/twakExecutor';
import { positionTracker } from '@/lib/services/execution/positionTracker';
import {
  shouldFireProbe,
  fireProbe,
  utcDayBucket,
  type ProbeTradeSchedulerState,
} from '@/lib/services/execution/probeTradeScheduler';
import { riskManager, updateDrawdownFromValue, defaultRiskManagerState } from '@/lib/services/execution/riskManager';
import { twakClient } from '@/lib/clients/twakClient';
import { attestationEmitter } from '@/lib/services/execution/attestationEmitter';
import { x402SpendTracker } from '@/lib/services/perception/evGate';
import { getOpenPositions } from '@/lib/queries/positions';
import { insertMetrics } from '@/lib/queries/metrics';
import { updateSessionEvGateDecisions, updateSessionExecutionResult } from '@/lib/queries/sessions';
import type { CMCSecurityEvent } from '@/types/perception';
import type { EVDecision } from '@/types/cognition';
import { DEFAULT_MANDATE, type MandateConfig } from '@/types/mandate';
import { ENABLE_EXECUTION } from '@/config/features';
import type { PositionState, RiskManagerState } from '@/types/execution';
import type { RegimeLabel } from '@/types/perception';

export interface AgentStatus {
  running: boolean;
  cycleCount: number;
  cyclesSkippedSameMetrics: number;
  lastCycleAt: number | null;
  regime: RegimeLabel;
  openPositionCount: number;
  drawdownPct: number;
  x402SpendSessionUSDC: number;
  x402SpendDailyUSDC: number;
  llmSpendDailyUSD: number;
  llmSpendCeilingUSD: number;
  llmKilled: boolean;
  llmCacheHitRatio: number;
}

export class AgentLoop {
  private running = false;
  private cycleCount = 0;
  private lastCycleAt: number | null = null;
  private regimeState: RegimeClassifierState = emptyRegimeState();
  private riskState: RiskManagerState = defaultRiskManagerState(0);
  private mandate: MandateConfig = DEFAULT_MANDATE;
  private cmcIngester: CmcIngester | null = null;
  private coldWriter: ColdStorageWriter | null = null;
  private executor: TwakExecutor = new TwakExecutor();
  private probeState: ProbeTradeSchedulerState = { lastProbeDay: null };
  private cycleTimer: ReturnType<typeof setInterval> | null = null;
  private regimeTimer: ReturnType<typeof setInterval> | null = null;
  private lastMetricsHash: `0x${string}` | null = null;
  private lastOpenPositionCount = -1;
  private cyclesSkippedSameMetrics = 0;

  setMandate(mandate: MandateConfig): void {
    this.mandate = mandate;
    riskManager.setMandate(mandate);
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    riskManager.setMandate(this.mandate);

    // Wire the CMC x402 outbound payment hook so cmcHubClient.callX402
    // can authenticate paid /x402/mcp calls without a circular import.
    setCmcX402PayHook(async (url, maxAtomic) => {
      const result = await twakClient.payX402({ url, maxPaymentAtomic: maxAtomic });
      return result.proofHeader;
    });

    this.coldWriter = new ColdStorageWriter();
    this.coldWriter.start();

    this.cmcIngester = new CmcIngester(hotState, this.coldWriter, {
      onEvent: (event) =>
        realtimeService.broadcast({
          type: 'perception_event',
          data: event,
          timestamp: Date.now(),
        }),
    });
    this.cmcIngester.start();

    positionTracker.start(async () =>
      twakClient.getPortfolio({
        agentAddress: process.env.TWAK_AGENT_WALLET_ADDRESS as `0x${string}`,
      }),
    );

    this.cycleTimer = setInterval(
      () => void this.runCycle(),
      CMC_QUOTES_POLL_INTERVAL_MS,
    );
    this.regimeTimer = setInterval(
      () => void this.evaluateRegime(),
      REGIME_REEVAL_INTERVAL_MS,
    );

    realtimeService.broadcast({
      type: 'agent_status_snapshot',
      data: this.getStatus(),
      timestamp: Date.now(),
    });
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.cycleTimer) clearInterval(this.cycleTimer);
    if (this.regimeTimer) clearInterval(this.regimeTimer);
    this.cycleTimer = null;
    this.regimeTimer = null;
    this.cmcIngester?.stop();
    positionTracker.stop();
    if (this.coldWriter) await this.coldWriter.stop();
    realtimeService.broadcast({
      type: 'agent_status_snapshot',
      data: this.getStatus(),
      timestamp: Date.now(),
    });
  }

  getStatus(): AgentStatus {
    const llm = llmSpendTracker.status();
    const cache = promptCache.stats();
    return {
      running: this.running,
      cycleCount: this.cycleCount,
      cyclesSkippedSameMetrics: this.cyclesSkippedSameMetrics,
      lastCycleAt: this.lastCycleAt,
      regime: this.regimeState.lastRegime ?? 'quiet',
      openPositionCount: this.riskState.positionsOpenCount,
      drawdownPct: this.riskState.currentDrawdownFromPeak,
      x402SpendSessionUSDC: x402SpendTracker.sessionSpendUSDC(),
      x402SpendDailyUSDC: x402SpendTracker.dailySpendUSDC(),
      llmSpendDailyUSD: llm.dailyUSD,
      llmSpendCeilingUSD: llm.ceilingUSD,
      llmKilled: llm.killed,
      llmCacheHitRatio: cache.hitRatio,
    };
  }

  /**
   * Hash a stable subset of AggregateMetrics so we can detect "nothing has
   * meaningfully changed since the last cycle" and skip cognition. Excludes
   * `computedAt` (always changes) and x402SpendTracker fields (cumulative).
   * V1 audit §3.5 step 2 fix.
   */
  private computeStableMetricsHash(
    metrics: ReturnType<typeof aggregateMetrics>,
  ): `0x${string}` {
    const stable = {
      regime: metrics.regime,
      fearGreedValue: metrics.fearGreedValue,
      fearGreedLabel: metrics.fearGreedLabel,
      topMoversByVolume: metrics.topMoversByVolume,
      kolActivityByToken: metrics.kolActivityByToken,
      fundingRatesByPair: metrics.fundingRatesByPair,
      marketLiquidityScore: Number(metrics.marketLiquidityScore.toFixed(2)),
      activeSurgeTokens: metrics.activeSurgeTokens,
    };
    return keccak256(stringToBytes(canonicalize(stable)));
  }

  /**
   * Evaluate the regime independently of the trade cycle. Fires at
   * REGIME_REEVAL_INTERVAL_MS, broadcasts transitions, and emits the on-chain
   * attestation for regime changes.
   */
  private async evaluateRegime(): Promise<void> {
    if (!this.running) return;
    const events = hotState.getRecentEvents();
    const metrics = aggregateMetrics(events, {
      regime: this.regimeState.lastRegime ?? 'quiet',
      x402SpendSessionUSDC: x402SpendTracker.sessionSpendUSDC(),
      x402SpendDailyUSDC: x402SpendTracker.dailySpendUSDC(),
    });
    hotState.setMetrics(metrics);
    const classification = classifyRegime(metrics, this.regimeState);
    const prev = this.regimeState.lastRegime;
    advanceRegimeState(this.regimeState, classification);
    if (prev && prev !== classification.regime) {
      realtimeService.broadcast({
        type: 'regime_change',
        data: { from: prev, to: classification.regime, rationale: classification.transitionRationale },
        timestamp: Date.now(),
      });
      void attestationEmitter.attestRegimeChange(prev, classification.regime);
    }
  }

  /**
   * One full perception → cognition → execution cycle. Runs at
   * CMC_QUOTES_POLL_INTERVAL_MS. Hibernates in quiet regime (only the probe
   * trade scheduler can fire). Persists metrics + session each cycle so the
   * /journal and /proof pages have rows to read.
   */
  private async runCycle(): Promise<void> {
    if (!this.running) return;
    try {
      const events = hotState.getRecentEvents();
      const regimeLabel = this.regimeState.lastRegime ?? 'quiet';
      const metrics = aggregateMetrics(events, {
        regime: regimeLabel,
        x402SpendSessionUSDC: x402SpendTracker.sessionSpendUSDC(),
        x402SpendDailyUSDC: x402SpendTracker.dailySpendUSDC(),
      });
      hotState.setMetrics(metrics);
      void insertMetrics(metrics).catch(() => undefined);
      realtimeService.broadcast({ type: 'metrics_update', data: metrics, timestamp: Date.now() });

      // Refresh portfolio + drawdown state.
      const portfolio = await twakClient.getPortfolio({
        agentAddress: process.env.TWAK_AGENT_WALLET_ADDRESS as `0x${string}`,
      });
      this.riskState = updateDrawdownFromValue(this.riskState, portfolio.totalValueUSD);

      // Probe-trade gate (fires only in quiet/defensive/halt, or when no
      // trade has been recorded today).
      const probeCheck = await shouldFireProbe(this.probeState);
      if (probeCheck.should) {
        const probe = await fireProbe();
        if (probe.fired) {
          this.probeState.lastProbeDay = utcDayBucket(new Date());
        }
      }

      if (regimeLabel === 'quiet') {
        this.cycleCount++;
        this.lastCycleAt = Date.now();
        return;
      }

      // V1 audit §3.4.6 + §3.5 step 2 fix: if metrics haven't materially
      // changed AND the open-position count is unchanged, skip cognition
      // entirely. This is the single biggest cost saver — V1 produced 92.8%
      // hold decisions because it asked the model about static markets.
      const stableHash = this.computeStableMetricsHash(metrics);
      const openCount = (await getOpenPositions().catch(() => [])).length;
      if (
        this.lastMetricsHash !== null &&
        this.lastMetricsHash === stableHash &&
        this.lastOpenPositionCount === openCount
      ) {
        this.cyclesSkippedSameMetrics++;
        this.cycleCount++;
        this.lastCycleAt = Date.now();
        return;
      }
      this.lastMetricsHash = stableHash;
      this.lastOpenPositionCount = openCount;

      // V1 audit §3.4.10 fix: short-circuit to a "halted" cycle if LLM spend
      // is over the daily ceiling. The cycle still ticks (perception keeps
      // running, drawdown updates) but no model is called.
      if (llmSpendTracker.isKilled()) {
        realtimeService.broadcast({
          type: 'health_degradation',
          data: {
            source: 'llm_spend_kill',
            message: 'daily LLM spend ceiling hit; cognition skipped',
            status: llmSpendTracker.status(),
          },
          timestamp: Date.now(),
        });
        this.cycleCount++;
        this.lastCycleAt = Date.now();
        return;
      }

      const previousRegime = this.regimeState.lastRegime;
      const { session } = await runCommitteeSession({
        metrics,
        regime: regimeLabel,
        previousRegime,
        evGateDecisions: [],
        x402SpendSessionUSDC: x402SpendTracker.sessionSpendUSDC(),
        mandate: this.mandate,
      });
      realtimeService.broadcast({
        type: 'committee_session_complete',
        data: session,
        timestamp: Date.now(),
      });

      if (!ENABLE_EXECUTION) {
        this.cycleCount++;
        this.lastCycleAt = Date.now();
        return;
      }

      if (
        session.finalAction.action === 'hold' ||
        session.finalAction.action === 'adjust_parameters'
      ) {
        this.cycleCount++;
        this.lastCycleAt = Date.now();
        return;
      }

      const openPositions: PositionState[] = await getOpenPositions().catch(() => []);
      const cmcPriceUSD = pickQuotedPrice(events, session.finalAction.tokenSymbol);
      const pythSymbol = mapPythSymbol(session.finalAction.tokenSymbol);
      const liquidityAdequate = session.quantCall.parsedOutput.liquidityAdequate as boolean | undefined ?? false;
      const fundingRateWarning = session.quantCall.parsedOutput.fundingRateWarning as boolean | undefined ?? false;

      // EV-gated security check: pay 0.01 USDC via TWAK x402 for CMC security
      // data IFF projected alpha > cost (regime-aware). Persist the resulting
      // EVDecision back onto the session so /journal + /proof can show it.
      const evDecisions: EVDecision[] = [];
      let securityEvent: CMCSecurityEvent | null = null;
      const sentimentScore = (session.narrativeCall.parsedOutput.sentimentScore as number | undefined) ?? 0;
      const signalMagnitude = Math.max(0.01, Math.abs(sentimentScore));
      if (this.cmcIngester && session.finalAction.tokenAddress) {
        const result = await this.cmcIngester
          .ensureSecurityCheck(session.finalAction.tokenAddress, regimeLabel, signalMagnitude)
          .catch((err) => {
            console.error(
              '[agent-loop] ensureSecurityCheck failed:',
              err instanceof Error ? err.message : String(err),
            );
            return null;
          });
        if (result) {
          evDecisions.push(result.decision);
          securityEvent = result.event;
        }
      }
      // Update the persisted session with the EV decision array + spend.
      void updateSessionEvGateDecisions(
        session.sessionId,
        evDecisions as unknown as Record<string, unknown>[],
        x402SpendTracker.sessionSpendUSDC(),
      ).catch((err) =>
        console.error(
          '[agent-loop] updateSessionEvGateDecisions failed:',
          err instanceof Error ? err.message : String(err),
        ),
      );

      const execution = await this.executor.execute({
        sessionId: session.sessionId,
        reasoningHash: session.reasoningHash,
        recommendation: session.finalAction,
        state: this.riskState,
        openPositions,
        portfolio,
        agentAddress: process.env.TWAK_AGENT_WALLET_ADDRESS as `0x${string}`,
        cmcPriceUSD,
        pythSymbol,
        liquidityAdequate,
        fundingRateWarning,
        securityRiskScore: securityEvent?.riskScore ?? null,
        isHoneypot: securityEvent?.isHoneypot ?? null,
      });

      void updateSessionExecutionResult(session.sessionId, execution.executionResult).catch(
        (err) => console.error('[agent-loop] updateSession failed:', err instanceof Error ? err.message : String(err)),
      );

      if (execution.executionResult.executed) {
        realtimeService.broadcast({
          type: 'position_update',
          data: execution.position,
          timestamp: Date.now(),
        });
      }

      this.cycleCount++;
      this.lastCycleAt = Date.now();
    } catch (err) {
      console.error(
        '[agent-loop] cycle error:',
        err instanceof Error ? err.message : String(err),
      );
      realtimeService.broadcast({
        type: 'health_degradation',
        data: {
          source: 'agent_loop',
          message: err instanceof Error ? err.message : String(err),
        },
        timestamp: Date.now(),
      });
    }
  }
}

function pickQuotedPrice(
  events: ReturnType<typeof hotState.getRecentEvents>,
  symbol: string | null,
): number | null {
  if (!symbol) return null;
  const upper = symbol.toUpperCase();
  let latest: { priceUSD: number; ts: number } | null = null;
  for (const event of events) {
    if (event.eventType !== 'quote_update') continue;
    if (event.tokenSymbol.toUpperCase() !== upper) continue;
    if (!latest || event.timestamp > latest.ts) {
      latest = { priceUSD: event.priceUSD, ts: event.timestamp };
    }
  }
  return latest?.priceUSD ?? null;
}

function mapPythSymbol(symbol: string | null): 'BTC_USD' | 'ETH_USD' | 'BNB_USD' | null {
  if (!symbol) return null;
  const upper = symbol.toUpperCase();
  if (upper === 'BTC' || upper === 'WBTC') return 'BTC_USD';
  if (upper === 'ETH' || upper === 'WETH') return 'ETH_USD';
  if (upper === 'BNB' || upper === 'WBNB') return 'BNB_USD';
  return null;
}

export const agentLoop = new AgentLoop();
