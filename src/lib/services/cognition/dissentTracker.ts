import type {
  DirectionalLabel,
  DissentResult,
  DissentSeverity,
  NarrativeAnalystOutput,
  QuantAnalystOutput,
} from '@/types/cognition';

/**
 * Compare the narrative and quant analyst outputs. Pure function:
 *  - Same direction → no dissent (modifier 1.0)
 *  - One side directional, the other neutral → mild dissent (modifier 0.5)
 *  - Bullish vs bearish → strong dissent (modifier 0.0, forces hold)
 *
 * V2 Phase 2 audit fix: when an analyst parse-fails, its output defaults to
 * direction='neutral'. Without parse-success context, computeDissent would
 * see "neutral==neutral" and falsely report "analysts agree", suppressing the
 * dissent signal entirely. The optional `parseStatus` arg lets the caller
 * disclose which side(s) failed; if any side failed, dissent is at least
 * 'mild' (half-size) regardless of direction match.
 */
export function computeDissent(
  narrative: NarrativeAnalystOutput,
  quant: QuantAnalystOutput,
  parseStatus?: { narrativeOk: boolean; quantOk: boolean },
): DissentResult {
  const narrativeDirection: DirectionalLabel = narrative.direction;
  const quantDirection: DirectionalLabel = quant.dominantDirection;

  if (parseStatus && (!parseStatus.narrativeOk || !parseStatus.quantOk)) {
    const failed = !parseStatus.narrativeOk && !parseStatus.quantOk
      ? 'both analysts'
      : !parseStatus.narrativeOk
        ? 'narrative analyst'
        : 'quant analyst';
    return result(
      'mild',
      0.5,
      narrativeDirection,
      quantDirection,
      `${failed} parse-failed → assume hidden dissent → half-size`,
    );
  }

  if (narrativeDirection === quantDirection) {
    return result('none', 1, narrativeDirection, quantDirection, 'analysts agree');
  }

  const isStrong =
    (narrativeDirection === 'bullish' && quantDirection === 'bearish') ||
    (narrativeDirection === 'bearish' && quantDirection === 'bullish');

  if (isStrong) {
    return result(
      'strong',
      0,
      narrativeDirection,
      quantDirection,
      `strong dissent: narrative ${narrativeDirection} vs quant ${quantDirection} → force hold`,
    );
  }

  return result(
    'mild',
    0.5,
    narrativeDirection,
    quantDirection,
    `mild dissent: narrative ${narrativeDirection}, quant ${quantDirection} → half-size`,
  );
}

function result(
  severity: DissentSeverity,
  modifier: number,
  narrativeDirection: DirectionalLabel,
  quantDirection: DirectionalLabel,
  rationale: string,
): DissentResult {
  return {
    dissentDetected: severity !== 'none',
    dissentSeverity: severity,
    narrativeDirection,
    quantDirection,
    positionSizeModifier: modifier,
    rationale,
  };
}
