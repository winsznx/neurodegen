import {
  BASE_SIZE_USD,
  MANDATE_MULT,
  MAX_EXPOSURE_PCT,
  MAX_POSITION_USD,
  MIN_VIABLE_SIZE_USD,
  REGIME_PARAMS,
} from './config';
import { drawdownBand } from './risk';
import type { DissentSeverity, SizingInput, SizingResult } from './types';

export function dissentMultiplier(severity: DissentSeverity): number {
  switch (severity) {
    case 'none':
      return 1.0;
    case 'mild':
      return 0.5;
    case 'strong':
      return 0.0;
  }
}

/**
 * Pure sizing math. Returns the final size in USD plus a breakdown of every
 * multiplier so the decision record can show its work.
 */
export function sizePosition(input: SizingInput): SizingResult {
  const regimeMult = REGIME_PARAMS[input.regime].sizeMult;
  const dissentMult = dissentMultiplier(input.dissent);
  const mandateMult = MANDATE_MULT[input.mandate];
  const band = drawdownBand(input.drawdownPct);
  const drawdownMult = band.sizeMult;

  let size = input.baseUsd * regimeMult * dissentMult * mandateMult * drawdownMult;
  let capped = false;
  let reason: string | undefined;

  if (size > MAX_POSITION_USD) {
    size = MAX_POSITION_USD;
    capped = true;
    reason = `clamped to per-position cap ${MAX_POSITION_USD}`;
  }

  const exposureRoom = Math.max(
    0,
    input.equityUsd * MAX_EXPOSURE_PCT - input.currentExposureUsd,
  );
  if (size > exposureRoom) {
    size = exposureRoom;
    capped = true;
    reason = `clamped to remaining exposure room ${exposureRoom.toFixed(2)}`;
  }

  if (band.newEntriesBlocked) {
    size = 0;
    capped = true;
    reason = `risk band ${band.label} blocks new entries`;
  }

  if (size <= MIN_VIABLE_SIZE_USD) {
    size = 0;
    if (!reason) reason = `size <= min viable ${MIN_VIABLE_SIZE_USD}`;
  }

  return {
    sizeUsd: round2(size),
    regimeMult,
    dissentMult,
    mandateMult,
    drawdownMult,
    capped,
    reason,
  };
}

export function defaultSizingInput(
  partial: Partial<SizingInput> & Pick<SizingInput, 'regime' | 'dissent'>,
): SizingInput {
  return {
    baseUsd: BASE_SIZE_USD,
    mandate: 'moderate',
    equityUsd: 1000,
    currentExposureUsd: 0,
    drawdownPct: 0,
    ...partial,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
