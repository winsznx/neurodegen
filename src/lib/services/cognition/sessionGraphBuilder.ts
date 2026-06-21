import { keccak256, stringToBytes } from 'viem';
import { canonicalize } from '@/lib/utils/canonicalSerialize';
import type {
  ActionRecommendation,
  CommitteeSession,
  DissentResult,
  EVDecision,
  ExecutionResultRecord,
  ModelCallRecord,
  NarrativeAnalystOutput,
  QuantAnalystOutput,
  RiskClassifierOutput,
} from '@/types/cognition';
import type { AggregateMetrics, RegimeLabel } from '@/types/perception';
import type { MandateConfig } from '@/types/mandate';

export interface SessionGraphInputs {
  sessionId: string;
  sessionNumber: number;
  createdAt: number;
  regime: RegimeLabel;
  previousRegime: RegimeLabel | null;
  metrics: AggregateMetrics;
  evGateDecisions: EVDecision[];
  x402SpendSessionUSDC: number;
  narrative: { parsed: NarrativeAnalystOutput; call: ModelCallRecord };
  quant: { parsed: QuantAnalystOutput; call: ModelCallRecord };
  dissent: DissentResult;
  risk: { parsed: RiskClassifierOutput; call: ModelCallRecord };
  mandate: MandateConfig;
  tokenAddressBySymbol: Record<string, `0x${string}`>;
}

export function buildCommitteeSession(inputs: SessionGraphInputs): CommitteeSession {
  const finalAction = deriveFinalAction(inputs);
  const sessionWithoutHash: Omit<CommitteeSession, 'reasoningHash' | 'attestationCommitTx' | 'executionResult'> = {
    sessionId: inputs.sessionId,
    sessionNumber: inputs.sessionNumber,
    createdAt: inputs.createdAt,
    regime: inputs.regime,
    previousRegime: inputs.previousRegime,
    fearGreedAtSession: inputs.metrics.fearGreedValue,
    inputMetrics: inputs.metrics,
    evGateDecisions: inputs.evGateDecisions,
    x402SpendThisSessionUSDC: inputs.x402SpendSessionUSDC,
    narrativeCall: inputs.narrative.call,
    quantCall: inputs.quant.call,
    dissentResult: inputs.dissent,
    riskCall: inputs.risk.call,
    finalAction,
  };
  const reasoningHash = computeReasoningHash(sessionWithoutHash);
  return {
    ...sessionWithoutHash,
    reasoningHash,
    attestationCommitTx: null,
    executionResult: null,
  };
}

export function computeReasoningHash(
  partial: Omit<CommitteeSession, 'reasoningHash' | 'attestationCommitTx' | 'executionResult'>,
): `0x${string}` {
  return keccak256(stringToBytes(canonicalize(partial)));
}

export function withExecutionResult(
  session: CommitteeSession,
  result: ExecutionResultRecord,
  attestationCommitTx: `0x${string}` | null,
): CommitteeSession {
  return {
    ...session,
    attestationCommitTx,
    executionResult: result,
  };
}

function deriveFinalAction(inputs: SessionGraphInputs): ActionRecommendation {
  const risk = inputs.risk.parsed;
  const baseSize = AGENT_BASE_POSITION_SIZE_USD * regimePositionMultiplier(inputs.regime);
  const dissentModifier = inputs.dissent.positionSizeModifier;
  const mandateModifier = riskLevelMultiplier(inputs.mandate.riskLevel);
  const rawSize = baseSize * dissentModifier * mandateModifier;

  // V2 Phase 2 audit fix: if the regime/dissent/mandate stack collapses size
  // to ~0 (e.g. quiet regime → multiplier 0), the risk classifier's chosen
  // action becomes meaningless because we can't size the trade. Collapse to a
  // hold so the displayed action and the actual outcome agree.
  const sizeCollapsedToZero =
    risk.action !== 'hold' && risk.action !== 'close_position' && rawSize <= 0.01;
  const effectiveAction: ActionRecommendation['action'] = sizeCollapsedToZero
    ? 'hold'
    : risk.action;
  const isHold = effectiveAction === 'hold';
  const positionSizeUSD = isHold ? null : Number(rawSize.toFixed(2));
  const tokenSymbol = isHold ? null : risk.targetToken;
  const tokenAddress = tokenSymbol ? inputs.tokenAddressBySymbol[tokenSymbol.toUpperCase()] ?? null : null;

  return {
    action: effectiveAction,
    tokenSymbol,
    tokenAddress,
    confidence: risk.confidence,
    positionSizeUSD,
    leverageMultiplier: 1,
    tpPercentage: isHold ? null : DEFAULT_TP_PERCENTAGE,
    slPercentage: isHold ? null : DEFAULT_SL_PERCENTAGE,
    rationale: risk.rationale,
    plainLanguageExplanation: buildPlainLanguageExplanation({
      action: effectiveAction,
      tokenSymbol,
      regime: inputs.regime,
      narrative: inputs.narrative.parsed,
      quant: inputs.quant.parsed,
      dissent: inputs.dissent,
      collapsedFromAction: sizeCollapsedToZero ? risk.action : null,
    }),
  };
}

function regimePositionMultiplier(regime: RegimeLabel): number {
  switch (regime) {
    case 'quiet':
      return 0;
    case 'active':
      return 0.5;
    case 'momentum':
      return 1.0;
    case 'volatile':
      return 0.1;
    default:
      return 0;
  }
}

function riskLevelMultiplier(level: MandateConfig['riskLevel']): number {
  switch (level) {
    case 'conservative':
      return 0.5;
    case 'aggressive':
      return 1.5;
    default:
      return 1.0;
  }
}

function buildPlainLanguageExplanation(args: {
  action: RiskClassifierOutput['action'];
  tokenSymbol: string | null;
  regime: RegimeLabel;
  narrative: NarrativeAnalystOutput;
  quant: QuantAnalystOutput;
  dissent: DissentResult;
  collapsedFromAction?: RiskClassifierOutput['action'] | null;
}): string {
  if (args.action === 'hold') {
    if (args.collapsedFromAction && args.collapsedFromAction !== 'hold') {
      return `Committee held - risk classifier proposed ${args.collapsedFromAction} but regime/dissent/mandate stack collapsed size to $0. No trade fired.`;
    }
    if (args.dissent.dissentSeverity === 'strong') {
      return `Committee held - analysts disagreed strongly (narrative ${args.dissent.narrativeDirection}, quant ${args.dissent.quantDirection}).`;
    }
    if (!args.quant.liquidityAdequate) {
      return `Committee held - quant flagged inadequate liquidity for all candidate tokens.`;
    }
    return `Committee held - regime ${args.regime}, no setup met the confidence threshold.`;
  }
  if (args.action === 'close_position') {
    return `Committee closed an open position. Regime ${args.regime}.`;
  }
  return `Committee opened ${args.tokenSymbol ?? 'a position'} in ${args.regime} regime. Narrative ${args.narrative.direction} (${args.narrative.confidenceLevel.toFixed(2)} conf), quant ${args.quant.dominantDirection}.`;
}

// Imported here to avoid extra cycles between cognition and risk config.
import { AGENT_BASE_POSITION_SIZE_USD } from '@/config/risk';
import { DEFAULT_TP_PERCENTAGE, DEFAULT_SL_PERCENTAGE } from '@/config/execution';
