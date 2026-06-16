import { ALLOWED_TOKEN_SYMBOLS, tokenAddressBySymbol } from '@/lib/utils/allowedTokens';
import type { AggregateMetrics, RegimeLabel } from '@/types/perception';
import type { MandateConfig } from '@/types/mandate';
import type { CommitteeSession, EVDecision } from '@/types/cognition';
import { runNarrativeAnalyst } from './narrativeAnalyst';
import { runQuantAnalyst } from './quantAnalyst';
import { runRiskClassifier } from './riskClassifier';
import { computeDissent } from './dissentTracker';
import { buildCommitteeSession } from './sessionGraphBuilder';
import { getNextSessionNumber, insertCommitteeSession } from '@/lib/queries/sessions';

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

  const [narrative, quant] = await Promise.all([
    runNarrativeAnalyst(inputs.metrics),
    runQuantAnalyst(inputs.metrics),
  ]);

  const dissent = computeDissent(narrative.parsed, quant.parsed);

  const risk = await runRiskClassifier({
    narrative: narrative.parsed,
    quant: quant.parsed,
    dissent,
    regime: inputs.regime,
    allowedTokenSymbols: ALLOWED_TOKEN_SYMBOLS,
    mandateRiskLevel: inputs.mandate.riskLevel,
  });

  const sessionNumber = await getNextSessionNumber().catch(() => 1);

  const session = buildCommitteeSession({
    sessionId,
    sessionNumber,
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

  // Persist eagerly so the execution layer can attest with a confirmed session_id.
  await insertCommitteeSession(session).catch((err) => {
    console.error(
      '[committee] insertCommitteeSession failed:',
      err instanceof Error ? err.message : String(err),
    );
  });

  return { session };
}
