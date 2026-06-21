import type { RiskBand } from './types';

/**
 * Drawdown ladder per spec section 4.5. Drawdown is expressed as a positive
 * percent (15 means 15% drawdown).
 */
export function drawdownBand(drawdownPct: number): RiskBand {
  if (drawdownPct >= 30) {
    return {
      label: 'disqualified',
      sizeMult: 0,
      newEntriesBlocked: true,
      stop: true,
    };
  }
  if (drawdownPct >= 25) {
    return {
      label: 'halt',
      sizeMult: 0,
      newEntriesBlocked: true,
      stop: false,
    };
  }
  if (drawdownPct >= 20) {
    return {
      label: 'defensive',
      sizeMult: 0,
      newEntriesBlocked: true,
      stop: false,
    };
  }
  if (drawdownPct >= 15) {
    return {
      label: 'alert',
      sizeMult: 0.5,
      newEntriesBlocked: false,
      stop: false,
    };
  }
  return {
    label: 'normal',
    sizeMult: 1,
    newEntriesBlocked: false,
    stop: false,
  };
}

export interface RiskCapsInput {
  openPositions: number;
  dailyLossUsd: number;
}

export interface RiskCapsResult {
  ok: boolean;
  reasons: string[];
}

export function checkRiskCaps(
  input: RiskCapsInput,
  maxConcurrent: number,
  dailyLossCap: number,
): RiskCapsResult {
  const reasons: string[] = [];
  if (input.openPositions >= maxConcurrent) {
    reasons.push(`open positions ${input.openPositions} >= cap ${maxConcurrent}`);
  }
  if (input.dailyLossUsd >= dailyLossCap) {
    reasons.push(`daily loss ${input.dailyLossUsd.toFixed(2)} >= cap ${dailyLossCap}`);
  }
  return { ok: reasons.length === 0, reasons };
}
