import {
  EV_BASE_CONFIDENCE,
  EV_THRESHOLD,
  X402_COST_PER_CALL_USDC,
} from '@/config/perception';
import { AGENT_BASE_POSITION_SIZE_USD } from '@/config/risk';
import { REGIME_PARAMS } from '@/config/regime';
import type { EVDecision } from '@/types/cognition';
import type { RegimeLabel } from '@/types/perception';

export type EvSignal =
  | 'price_spike'
  | 'volume_surge'
  | 'funding_spike'
  | 'kol_velocity'
  | 'security_check'
  | 'narrative_emergence';

export interface EvGateInput {
  triggeringSignal: EvSignal;
  regime: RegimeLabel;
  signalMagnitude: number;
  gasCostUSD: number;
  positionSizeUSD?: number;
  baseConfidence?: number;
  overrideThreshold?: number;
}

/**
 * Decide whether the projected alpha from a premium CMC data call beats the
 * cost of the call itself. Pure function — no side effects, no state, no I/O.
 * The caller (cmcIngester / committeeSession) reads the decision and acts.
 */
export function evaluateEV(input: EvGateInput): EVDecision {
  const regimeParams = REGIME_PARAMS[input.regime];
  const evGateActive = regimeParams.evGateActive;
  const positionSize = input.positionSizeUSD ?? AGENT_BASE_POSITION_SIZE_USD;
  const baseConfidence = input.baseConfidence ?? EV_BASE_CONFIDENCE;
  const projectedAlphaUSD =
    positionSize *
    regimeParams.positionSizeMultiplier *
    Math.abs(input.signalMagnitude) *
    baseConfidence;

  const threshold = input.overrideThreshold ?? EV_THRESHOLD;
  const totalCost = X402_COST_PER_CALL_USDC + Math.max(input.gasCostUSD, 0);
  const evRatio = totalCost > 0 ? projectedAlphaUSD / totalCost : Number.POSITIVE_INFINITY;

  const shouldFetchPremium = evGateActive && evRatio >= threshold && projectedAlphaUSD > 0;

  const rationale = !evGateActive
    ? `regime '${input.regime}' suppresses EV gate (hibernate or volatile defensive); skipping premium fetch`
    : projectedAlphaUSD <= 0
      ? `projected alpha is zero — base position $${positionSize.toFixed(2)} * regime ${regimeParams.positionSizeMultiplier.toFixed(2)} * |signal| ${Math.abs(input.signalMagnitude).toFixed(3)} = $0`
      : shouldFetchPremium
        ? `ratio ${evRatio.toFixed(1)}× >= threshold ${threshold.toFixed(1)}× — fetching premium data`
        : `ratio ${evRatio.toFixed(1)}× < threshold ${threshold.toFixed(1)}× — skipping premium`;

  return {
    shouldFetchPremium,
    projectedAlphaUSD,
    x402CostUSDC: X402_COST_PER_CALL_USDC,
    gasCostUSD: Math.max(input.gasCostUSD, 0),
    evRatio: Number.isFinite(evRatio) ? Number(evRatio.toFixed(2)) : 0,
    rationale,
    triggeringSignal: input.triggeringSignal,
    thresholdUsed: threshold,
  };
}

export interface X402SpendTracker {
  recordSpend(decision: EVDecision): void;
  sessionSpendUSDC(): number;
  dailySpendUSDC(): number;
  reset(): void;
}

class InMemoryX402SpendTracker implements X402SpendTracker {
  private sessionUSDC = 0;
  private dailyUSDC = 0;
  private dayBucket = currentUTCDayBucket();

  recordSpend(decision: EVDecision): void {
    if (!decision.shouldFetchPremium) return;
    const bucket = currentUTCDayBucket();
    if (bucket !== this.dayBucket) {
      this.dayBucket = bucket;
      this.dailyUSDC = 0;
    }
    this.sessionUSDC += decision.x402CostUSDC;
    this.dailyUSDC += decision.x402CostUSDC;
  }

  sessionSpendUSDC(): number {
    return this.sessionUSDC;
  }

  dailySpendUSDC(): number {
    return this.dailyUSDC;
  }

  reset(): void {
    this.sessionUSDC = 0;
  }
}

function currentUTCDayBucket(): string {
  const now = new Date();
  return now.toISOString().slice(0, 10);
}

export const x402SpendTracker: X402SpendTracker = new InMemoryX402SpendTracker();
