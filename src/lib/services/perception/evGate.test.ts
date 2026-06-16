import { describe, it, expect } from 'vitest';
import { evaluateEV } from './evGate';

describe('evaluateEV', () => {
  it('suppresses premium fetch in quiet regime regardless of ratio', () => {
    // #given a quiet regime (hibernate) with a large signal
    // #when the EV gate evaluates
    const decision = evaluateEV({
      triggeringSignal: 'volume_surge',
      regime: 'quiet',
      signalMagnitude: 0.5,
      gasCostUSD: 0.001,
    });

    // #then shouldFetchPremium is false and the rationale calls out the regime
    expect(decision.shouldFetchPremium).toBe(false);
    expect(decision.rationale).toMatch(/quiet/);
  });

  it('approves premium when ratio clears threshold in momentum regime', () => {
    // #given a momentum regime (1.0x position multiplier) and a 4% signal
    // #when the gate evaluates with default base position $100
    const decision = evaluateEV({
      triggeringSignal: 'kol_velocity',
      regime: 'momentum',
      signalMagnitude: 0.04,
      gasCostUSD: 0.001,
    });

    // #then projectedAlpha = 100 * 1.0 * 0.04 * 0.5 = $2.00; ratio = 2 / 0.011 ≈ 181x ≥ 3x threshold
    expect(decision.shouldFetchPremium).toBe(true);
    expect(decision.evRatio).toBeGreaterThan(50);
    expect(decision.projectedAlphaUSD).toBeCloseTo(2, 2);
  });

  it('blocks premium when the ratio is below threshold even in active regime', () => {
    // #given an active regime (0.5x position multiplier) and a tiny signal
    const decision = evaluateEV({
      triggeringSignal: 'price_spike',
      regime: 'active',
      signalMagnitude: 0.0001,
      gasCostUSD: 0.001,
    });

    // #then ratio is below the 3x threshold and shouldFetchPremium is false
    expect(decision.shouldFetchPremium).toBe(false);
    expect(decision.evRatio).toBeLessThan(3);
  });

  it('blocks premium when projected alpha computes to zero', () => {
    // #given a 0% signal magnitude
    const decision = evaluateEV({
      triggeringSignal: 'narrative_emergence',
      regime: 'momentum',
      signalMagnitude: 0,
      gasCostUSD: 0.001,
    });

    // #then shouldFetchPremium is false and the rationale calls out zero alpha
    expect(decision.shouldFetchPremium).toBe(false);
    expect(decision.rationale).toMatch(/zero/);
  });

  it('honors a caller-supplied overrideThreshold', () => {
    // #given an explicit threshold higher than the default 3.0
    const decision = evaluateEV({
      triggeringSignal: 'price_spike',
      regime: 'momentum',
      signalMagnitude: 0.001,
      gasCostUSD: 0.001,
      overrideThreshold: 1000,
    });

    // #then the override sticks
    expect(decision.thresholdUsed).toBe(1000);
    expect(decision.shouldFetchPremium).toBe(false);
  });

  it('records gasCostUSD in the decision verbatim and clamps negatives to zero', () => {
    // #given a deliberately negative gas cost (bad caller input)
    const decision = evaluateEV({
      triggeringSignal: 'price_spike',
      regime: 'active',
      signalMagnitude: 0.04,
      gasCostUSD: -1,
    });

    // #then gasCostUSD is clamped to 0 instead of inflating the ratio
    expect(decision.gasCostUSD).toBe(0);
  });
});
