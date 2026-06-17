import { ALLOWED_TOKEN_SYMBOLS, tokenAddressBySymbol } from '@/lib/utils/allowedTokens';
import type { AggregateMetrics, RegimeLabel } from '@/types/perception';
import type { MandateConfig } from '@/types/mandate';
import type {
  CommitteeSession,
  EVDecision,
  ModelCallRecord,
  NarrativeAnalystOutput,
  QuantAnalystOutput,
} from '@/types/cognition';
import { runNarrativeAnalyst, type NarrativeAnalystResult } from './narrativeAnalyst';
import { runQuantAnalyst, type QuantAnalystResult } from './quantAnalyst';
import { runRiskClassifier } from './riskClassifier';
import { computeDissent } from './dissentTracker';
import { buildCommitteeSession } from './sessionGraphBuilder';
import {
  getNextSessionNumber,
  insertCommitteeSession,
  SessionNumberCollisionError,
} from '@/lib/queries/sessions';

export interface CommitteeSessionResult {
  session: CommitteeSession;
}

export interface CommitteeSessionInputs {
  metrics: AggregateMetrics;
  regime: RegimeLabel;
  previousRegime: RegimeLabel | null;
  evGateDecisions: EVDecision[];
  x402SpendSessionUSDC: number;
  mandate: MandateConfig;
}

/**
 * Run a full committee deliberation:
 *  1. Narrative and Quant analysts in parallel (independent inputs).
 *  2. Dissent computed deterministically from their outputs.
 *  3. Risk classifier runs sequentially with both analyst outputs + dissent.
 *  4. SessionGraphBuilder assembles the canonical CommitteeSession.
 *  5. Result persists to Supabase via `insertCommitteeSession`.
 *
 * The caller — `agentLoop.runCycle()` — owns the session number assignment
 * and the persistence (so the test harness can build sessions without a DB).
 */
export async function runCommitteeSession(
  inputs: CommitteeSessionInputs,
): Promise<CommitteeSessionResult> {
  const sessionId = crypto.randomUUID();
  const createdAt = Date.now();

  // V2 Phase 2 audit fix: previously this was `Promise.all` — if either
  // analyst threw (network failure, gateway down), the whole cycle died and
  // the agent went silent until the next tick. Use `allSettled` so one
  // failing analyst falls back to a neutral synthetic result; both failing
  // still produces a session that downstream computeDissent + risk classifier
  // can handle (both will force hold).
  const settled = await Promise.allSettled([
    runNarrativeAnalyst(inputs.metrics),
    runQuantAnalyst(inputs.metrics),
  ]);
  const narrative =
    settled[0].status === 'fulfilled'
      ? settled[0].value
      : (logAnalystFailure('narrative', settled[0].reason), buildSyntheticNarrative());
  const quant =
    settled[1].status === 'fulfilled'
      ? settled[1].value
      : (logAnalystFailure('quant', settled[1].reason), buildSyntheticQuant());

  const dissent = computeDissent(narrative.parsed, quant.parsed, {
    narrativeOk: narrative.call.parseSuccess,
    quantOk: quant.call.parseSuccess,
  });

  const risk = await runRiskClassifier({
    narrative: narrative.parsed,
    quant: quant.parsed,
    dissent,
    regime: inputs.regime,
    allowedTokenSymbols: ALLOWED_TOKEN_SYMBOLS,
    mandateRiskLevel: inputs.mandate.riskLevel,
  });

  // V2 Phase 2 audit fix: `sessionNumber` is part of the reasoning-hash
  // preimage. If a concurrent cycle inserts the same number first, we must
  // rebuild the session (and recompute the hash) before retrying — otherwise
  // the on-chain attestation will reference stale data.
  let session: CommitteeSession | null = null;
  let nextNumber = await getNextSessionNumber().catch(() => 1);
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = buildCommitteeSession({
      sessionId,
      sessionNumber: nextNumber,
      createdAt,
      regime: inputs.regime,
      previousRegime: inputs.previousRegime,
      metrics: inputs.metrics,
      evGateDecisions: inputs.evGateDecisions,
      x402SpendSessionUSDC: inputs.x402SpendSessionUSDC,
      narrative: { parsed: narrative.parsed, call: narrative.call },
      quant: { parsed: quant.parsed, call: quant.call },
      dissent,
      risk: { parsed: risk.parsed, call: risk.call },
      mandate: inputs.mandate,
      tokenAddressBySymbol: tokenAddressBySymbol(),
    });
    try {
      await insertCommitteeSession(candidate);
      session = candidate;
      break;
    } catch (err) {
      if (err instanceof SessionNumberCollisionError && attempt < 4) {
        const fresh = await getNextSessionNumber().catch(() => nextNumber + 1);
        nextNumber = Math.max(fresh, nextNumber + 1);
        continue;
      }
      console.error(
        '[committee] insertCommitteeSession failed:',
        err instanceof Error ? err.message : String(err),
      );
      // Fall back to the in-memory session so the agent loop can still execute
      // — the row will be inserted on a later attempt by reconciliation.
      session = candidate;
      break;
    }
  }

  return { session: session! };
}

function logAnalystFailure(role: 'narrative' | 'quant', reason: unknown): void {
  console.error(
    `[committee] ${role} analyst threw — falling back to synthetic neutral:`,
    reason instanceof Error ? reason.message : String(reason),
  );
}

function buildSyntheticCall(role: 'narrative' | 'quant'): ModelCallRecord {
  return {
    modelId: `synthetic-fallback-${role}`,
    endpointFormat: 'openai_compatible',
    routingDecision: 'direct',
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: 0,
    systemPrompt: '',
    userInput: '',
    rawOutput: '',
    parsedOutput: {},
    parseSuccess: false,
  };
}

function buildSyntheticNarrative(): NarrativeAnalystResult {
  const parsed: NarrativeAnalystOutput = {
    narrativeSummary: 'narrative analyst unavailable — synthetic neutral fallback',
    kolMentionedTokens: [],
    sentimentScore: 0,
    confidenceLevel: 0,
    direction: 'neutral',
    flaggedAnomalies: ['NARRATIVE_ANALYST_UNREACHABLE'],
    topThesisToken: null,
  };
  return { parsed, call: buildSyntheticCall('narrative'), attempts: [] };
}

function buildSyntheticQuant(): QuantAnalystResult {
  const parsed: QuantAnalystOutput = {
    features: [],
    dominantDirection: 'neutral',
    liquidityAdequate: false,
    fundingRateWarning: false,
    recommendedToken: null,
  };
  return { parsed, call: buildSyntheticCall('quant'), attempts: [] };
}
