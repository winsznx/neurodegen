import { keccak256, stringToBytes } from 'viem';
import { canonicalize } from '@/lib/utils/canonicalSerialize';
import { aggregateMetrics } from '@/lib/services/perception/aggregatorService';
import { advanceRegimeState, classifyRegime, emptyRegimeState } from '@/lib/services/perception/regimeClassifier';
import { computeDissent } from '@/lib/services/cognition/dissentTracker';
import { buildCommitteeSession } from '@/lib/services/cognition/sessionGraphBuilder';
import { tokenAddressBySymbol } from '@/lib/utils/allowedTokens';
import { DEFAULT_MANDATE, type MandateConfig } from '@/types/mandate';
import type {
  CommitteeSession,
  EVDecision,
  ModelCallRecord,
  NarrativeAnalystOutput,
  QuantAnalystOutput,
  RiskClassifierOutput,
} from '@/types/cognition';
import type { AggregateMetrics, PerceptionEvent } from '@/types/perception';

export interface BacktestStep {
  timestamp: number;
  events: PerceptionEvent[];
  narrativeFixture: NarrativeAnalystOutput;
  quantFixture: QuantAnalystOutput;
  riskFixture: RiskClassifierOutput;
  /** Simulated price for the action's target token at session time. */
  priceUSDBySymbol: Record<string, number>;
  /** Simulated price for the action's target token at exit time (next step). */
  exitPriceUSDBySymbol?: Record<string, number>;
}

export interface BacktestRunResult {
  sessions: CommitteeSession[];
  simulatedTrades: Array<{
    sessionId: string;
    sessionNumber: number;
    action: string;
    tokenSymbol: string | null;
    entryPriceUSD: number | null;
    exitPriceUSD: number | null;
    pnlPct: number | null;
    pnlUSD: number | null;
  }>;
  cumulativePnLPct: number;
  cumulativePnLUSD: number;
  fixtureHash: `0x${string}`;
}

export interface BacktestOptions {
  mandate?: MandateConfig;
  /** Seed influences the synthetic ModelCallRecord ids so reasoning hashes change deterministically per seed. */
  seed?: string;
}

function fakeCall(modelId: string, output: unknown, seed: string): ModelCallRecord {
  return {
    modelId,
    endpointFormat: 'openai_compatible',
    routingDecision: 'dgrid_primary',
    inputTokens: 100,
    outputTokens: 100,
    latencyMs: 0,
    systemPrompt: `backtest:${seed}`,
    userInput: `backtest:${seed}`,
    rawOutput: JSON.stringify(output),
    parsedOutput: output as Record<string, unknown>,
    parseSuccess: true,
  };
}

/**
 * Replay a fixture of CMC events + analyst outputs through the V2 cognition +
 * sizing layer without making real LLM calls. Used for:
 *  - V2 demo: deterministic reproducibility of the /proof page proof of work.
 *  - V2.1 strategy tuning: change regime params or sizing math and run against
 *    a known set of fixtures to see how cumulative PnL shifts.
 */
export async function runBacktest(
  steps: BacktestStep[],
  options: BacktestOptions = {},
): Promise<BacktestRunResult> {
  const mandate = options.mandate ?? DEFAULT_MANDATE;
  const seed = options.seed ?? 'default';
  const regimeState = emptyRegimeState();
  const sessions: CommitteeSession[] = [];
  const trades: BacktestRunResult['simulatedTrades'] = [];
  let cumulativePct = 0;
  let cumulativeUSD = 0;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const metrics: AggregateMetrics = aggregateMetrics(step.events, {
      regime: regimeState.lastRegime ?? 'quiet',
      x402SpendSessionUSDC: 0,
      x402SpendDailyUSDC: 0,
      computedAt: step.timestamp,
    });
    const classification = classifyRegime(metrics, regimeState, step.timestamp);
    advanceRegimeState(regimeState, classification);

    const dissent = computeDissent(step.narrativeFixture, step.quantFixture);
    const evGateDecisions: EVDecision[] = [];

    const session = buildCommitteeSession({
      sessionId: `bt-${seed}-${i.toString().padStart(4, '0')}`,
      sessionNumber: i + 1,
      createdAt: step.timestamp,
      regime: classification.regime,
      previousRegime: classification.previousRegime,
      metrics,
      evGateDecisions,
      x402SpendSessionUSDC: 0,
      narrative: { parsed: step.narrativeFixture, call: fakeCall('claude-sonnet-4.6', step.narrativeFixture, seed) },
      quant: { parsed: step.quantFixture, call: fakeCall('gpt-4o', step.quantFixture, seed) },
      dissent,
      risk: { parsed: step.riskFixture, call: fakeCall('deepseek/deepseek-v3.2', step.riskFixture, seed) },
      mandate,
      tokenAddressBySymbol: tokenAddressBySymbol(),
    });
    sessions.push(session);

    const targetSymbol = session.finalAction.tokenSymbol;
    const entryPriceUSD = targetSymbol ? (step.priceUSDBySymbol[targetSymbol] ?? null) : null;
    const exitPriceUSD = targetSymbol
      ? (step.exitPriceUSDBySymbol?.[targetSymbol] ?? steps[i + 1]?.priceUSDBySymbol[targetSymbol] ?? null)
      : null;

    let pnlPct: number | null = null;
    let pnlUSD: number | null = null;
    if (
      session.finalAction.action === 'open_long' &&
      entryPriceUSD !== null &&
      exitPriceUSD !== null &&
      session.finalAction.positionSizeUSD
    ) {
      pnlPct = (exitPriceUSD - entryPriceUSD) / entryPriceUSD;
      pnlUSD = session.finalAction.positionSizeUSD * pnlPct;
      cumulativePct += pnlPct;
      cumulativeUSD += pnlUSD;
    }

    trades.push({
      sessionId: session.sessionId,
      sessionNumber: session.sessionNumber,
      action: session.finalAction.action,
      tokenSymbol: targetSymbol,
      entryPriceUSD,
      exitPriceUSD,
      pnlPct,
      pnlUSD,
    });
  }

  const fixtureHash = keccak256(stringToBytes(canonicalize({ steps, mandate, seed })));
  return {
    sessions,
    simulatedTrades: trades,
    cumulativePnLPct: cumulativePct,
    cumulativePnLUSD: cumulativeUSD,
    fixtureHash,
  };
}
