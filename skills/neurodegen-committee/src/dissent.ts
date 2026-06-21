import type {
  DirectionalLabel,
  DissentResult,
  DissentSeverity,
  NarrativeAnalystOutput,
  QuantAnalystOutput,
} from './types';

/**
 * Compare narrative and quant analyst outputs. Pure function:
 *  - Same direction -> no dissent (modifier 1.0)
 *  - One side directional, the other neutral -> mild dissent (modifier 0.5)
 *  - Bull vs bear -> strong dissent (modifier 0.0, forces hold)
 *
 * When `parseStatus` reports a parse failure, dissent is at least 'mild'
 * regardless of direction match: a parse-failed analyst defaults to neutral,
 * and silently treating that as "agreement with the other neutral" would
 * suppress the dissent signal entirely.
 */
export function computeDissent(
  narrative: NarrativeAnalystOutput,
  quant: QuantAnalystOutput,
  parseStatus?: { narrativeOk: boolean; quantOk: boolean },
): DissentResult {
  const narrativeDirection: DirectionalLabel = narrative.direction;
  const quantDirection: DirectionalLabel = quant.dominantDirection;

  if (parseStatus && (!parseStatus.narrativeOk || !parseStatus.quantOk)) {
    const failed =
      !parseStatus.narrativeOk && !parseStatus.quantOk
        ? 'both analysts'
        : !parseStatus.narrativeOk
          ? 'narrative analyst'
          : 'quant analyst';
    return build(
      'mild',
      0.5,
      narrativeDirection,
      quantDirection,
      `${failed} parse-failed; assume hidden dissent; half-size`,
    );
  }

  if (narrativeDirection === quantDirection) {
    return build(
      'none',
      1,
      narrativeDirection,
      quantDirection,
      'analysts agree',
    );
  }

  const isStrong =
    (narrativeDirection === 'bullish' && quantDirection === 'bearish') ||
    (narrativeDirection === 'bearish' && quantDirection === 'bullish');

  if (isStrong) {
    return build(
      'strong',
      0,
      narrativeDirection,
      quantDirection,
      `strong dissent: narrative ${narrativeDirection} vs quant ${quantDirection}; force hold`,
    );
  }

  return build(
    'mild',
    0.5,
    narrativeDirection,
    quantDirection,
    `mild dissent: narrative ${narrativeDirection}, quant ${quantDirection}; half-size`,
  );
}

function build(
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
