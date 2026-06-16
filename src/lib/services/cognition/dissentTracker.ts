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
 */
export function computeDissent(
  narrative: NarrativeAnalystOutput,
  quant: QuantAnalystOutput,
): DissentResult {
  const narrativeDirection: DirectionalLabel = narrative.direction;
  const quantDirection: DirectionalLabel = quant.dominantDirection;

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
