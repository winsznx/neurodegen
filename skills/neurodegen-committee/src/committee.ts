import {
  ALLOWLIST_SYMBOLS,
  BASE_SIZE_USD,
  FUNDING_WARNING_CONFIDENCE_OVERRIDE,
  MAX_CONCURRENT_POSITIONS,
  MIN_CONFIDENCE,
  DAILY_LOSS_CAP_USD,
} from './config';
import { computeDissent } from './dissent';
import { advanceRegimeState, classifyRegime, computeActiveSurgeTokens } from './regime';
import { checkRiskCaps, drawdownBand } from './risk';
import { sizePosition } from './sizing';
import type {
  Action,
  DecisionRecord,
  DissentResult,
  MandateRiskLevel,
  MarketSnapshot,
  NarrativeAnalystOutput,
  QuantAnalystOutput,
  RegimeClassifierState,
  RegimeLabel,
} from './types';

export interface AnalystResult<T> {
  parsed: T;
  parseOk: boolean;
}

export type NarrativeAnalyst = (
  snapshot: MarketSnapshot,
) => Promise<AnalystResult<NarrativeAnalystOutput>>;

export type QuantAnalyst = (
  snapshot: MarketSnapshot,
) => Promise<AnalystResult<QuantAnalystOutput>>;

export interface PortfolioState {
  equityUsd: number;
  currentExposureUsd: number;
  openPositions: number;
  drawdownPct: number;
  dailyLossUsd: number;
}

export interface CommitteeInput {
  snapshot: MarketSnapshot;
  regimeState: RegimeClassifierState;
  portfolio: PortfolioState;
  mandate: MandateRiskLevel;
  narrativeAnalyst: NarrativeAnalyst;
  quantAnalyst: QuantAnalyst;
  allowlist?: ReadonlyArray<string>;
  now?: number;
}

export async function runCommittee(input: CommitteeInput): Promise<DecisionRecord> {
  const now = input.now ?? Date.now();
  const allowlist = input.allowlist ?? ALLOWLIST_SYMBOLS;

  const snapshot: MarketSnapshot = {
    ...input.snapshot,
    activeSurgeTokens:
      input.snapshot.activeSurgeTokens > 0
        ? input.snapshot.activeSurgeTokens
        : computeActiveSurgeTokens(input.snapshot),
  };

  const regime = classifyRegime(snapshot, input.regimeState, now);

  // Quiet -> exit early. Always return a hold decision; do NOT call the
  // analysts (saves the EV-gated premium calls).
  if (regime.regime === 'quiet') {
    advanceRegimeState(input.regimeState, regime);
    return buildQuietHold(snapshot, regime, now);
  }

  const [narrativeRes, quantRes] = await Promise.all([
    safeRun(input.narrativeAnalyst, snapshot, defaultNarrative()),
    safeRun(input.quantAnalyst, snapshot, defaultQuant()),
  ]);

  const dissent = computeDissent(narrativeRes.parsed, quantRes.parsed, {
    narrativeOk: narrativeRes.parseOk,
    quantOk: quantRes.parseOk,
  });

  const mustHoldReasons: string[] = [];
  const minConfidence = Math.min(
    narrativeRes.parsed.confidenceLevel,
    meanWeight(quantRes.parsed),
  );

  if (minConfidence < MIN_CONFIDENCE) {
    mustHoldReasons.push(
      `min(confidence) ${minConfidence.toFixed(2)} < ${MIN_CONFIDENCE}`,
    );
  }
  if (dissent.dissentSeverity === 'strong') {
    mustHoldReasons.push('strong dissent');
  }
  if (!quantRes.parsed.liquidityAdequate) {
    mustHoldReasons.push('liquidityAdequate=false');
  }
  if (
    quantRes.parsed.fundingRateWarning &&
    narrativeRes.parsed.confidenceLevel <= FUNDING_WARNING_CONFIDENCE_OVERRIDE
  ) {
    mustHoldReasons.push(
      `fundingRateWarning and narrative confidence ${narrativeRes.parsed.confidenceLevel.toFixed(2)} <= ${FUNDING_WARNING_CONFIDENCE_OVERRIDE}`,
    );
  }

  const candidate = selectCandidate(
    narrativeRes.parsed,
    quantRes.parsed,
    snapshot,
    allowlist,
  );
  if (!candidate) {
    mustHoldReasons.push('no candidate token in allowlist');
  }

  if (regime.regime === 'volatile') {
    if (
      dissent.dissentSeverity !== 'none' ||
      narrativeRes.parsed.confidenceLevel < 0.6 ||
      meanWeight(quantRes.parsed) < 0.6
    ) {
      mustHoldReasons.push(
        'volatile regime requires aligned dissent and confidence >= 0.6',
      );
    }
  }

  const caps = checkRiskCaps(
    {
      openPositions: input.portfolio.openPositions,
      dailyLossUsd: input.portfolio.dailyLossUsd,
    },
    MAX_CONCURRENT_POSITIONS,
    DAILY_LOSS_CAP_USD,
  );
  if (!caps.ok) {
    mustHoldReasons.push(...caps.reasons);
  }

  const sizing = sizePosition({
    baseUsd: BASE_SIZE_USD,
    regime: regime.regime,
    dissent: dissent.dissentSeverity,
    mandate: input.mandate,
    equityUsd: input.portfolio.equityUsd,
    currentExposureUsd: input.portfolio.currentExposureUsd,
    drawdownPct: input.portfolio.drawdownPct,
  });

  const band = drawdownBand(input.portfolio.drawdownPct);
  const action: Action =
    mustHoldReasons.length === 0 && sizing.sizeUsd > 0 && candidate !== null
      ? 'open_long'
      : 'hold';

  advanceRegimeState(input.regimeState, regime);

  return {
    schemaVersion: '0.1.0',
    timestampMs: now,
    regime: regime.regime,
    previousRegime: regime.previousRegime,
    regimeRationale: regime.transitionRationale,
    narrative: narrativeRes.parsed,
    quant: quantRes.parsed,
    dissent,
    action,
    targetToken: action === 'open_long' ? candidate : null,
    sizeUsd: action === 'open_long' ? sizing.sizeUsd : 0,
    sizing,
    riskBand: band,
    mustHoldReasons,
    rationale: buildRationale(
      action,
      regime.regime,
      dissent,
      narrativeRes.parsed,
      quantRes.parsed,
      candidate,
      mustHoldReasons,
    ),
  };
}

function buildQuietHold(
  snapshot: MarketSnapshot,
  regime: ReturnType<typeof classifyRegime>,
  now: number,
): DecisionRecord {
  const narrative = defaultNarrative();
  const quant = defaultQuant();
  const dissent: DissentResult = {
    dissentDetected: false,
    dissentSeverity: 'none',
    narrativeDirection: 'neutral',
    quantDirection: 'neutral',
    positionSizeModifier: 1,
    rationale: 'quiet regime skips analysts',
  };
  return {
    schemaVersion: '0.1.0',
    timestampMs: now,
    regime: 'quiet',
    previousRegime: regime.previousRegime,
    regimeRationale: regime.transitionRationale,
    narrative,
    quant,
    dissent,
    action: 'hold',
    targetToken: null,
    sizeUsd: 0,
    sizing: {
      sizeUsd: 0,
      regimeMult: 0,
      dissentMult: 1,
      mandateMult: 1,
      drawdownMult: 1,
      capped: false,
      reason: 'quiet regime',
    },
    riskBand: drawdownBand(0),
    mustHoldReasons: ['quiet regime'],
    rationale: 'Quiet tape; no trades. F&G ' + snapshot.fearGreedValue,
  };
}

async function safeRun<T>(
  fn: (s: MarketSnapshot) => Promise<AnalystResult<T>>,
  snapshot: MarketSnapshot,
  fallback: T,
): Promise<AnalystResult<T>> {
  try {
    return await fn(snapshot);
  } catch {
    return { parsed: fallback, parseOk: false };
  }
}

function meanWeight(quant: QuantAnalystOutput): number {
  if (quant.features.length === 0) return 0;
  let sum = 0;
  for (const f of quant.features) sum += f.weight;
  const mean = sum / quant.features.length;
  if (!Number.isFinite(mean)) return 0;
  return Math.max(0, Math.min(1, mean));
}

function selectCandidate(
  narrative: NarrativeAnalystOutput,
  quant: QuantAnalystOutput,
  snapshot: MarketSnapshot,
  allowlist: ReadonlyArray<string>,
): string | null {
  const allow = new Set(allowlist);
  const narrativeTokens = new Set<string>([
    ...narrative.kolMentionedTokens,
    ...(narrative.topThesisToken ? [narrative.topThesisToken] : []),
  ]);
  const quantTokens = new Set<string>(
    quant.recommendedToken ? [quant.recommendedToken] : [],
  );

  const kolHot = new Set<string>(
    Object.entries(snapshot.kolActivityByToken)
      .filter(([, e]) => e.velocityPerHour >= 5)
      .map(([sym]) => sym),
  );

  for (const s of kolHot) {
    if (allow.has(s) && narrativeTokens.has(s) && quantTokens.has(s)) return s;
  }
  for (const s of narrativeTokens) {
    if (allow.has(s) && quantTokens.has(s)) return s;
  }
  for (const s of quantTokens) {
    if (allow.has(s)) return s;
  }
  return null;
}

function buildRationale(
  action: Action,
  regime: RegimeLabel,
  dissent: DissentResult,
  narrative: NarrativeAnalystOutput,
  quant: QuantAnalystOutput,
  candidate: string | null,
  mustHold: string[],
): string {
  if (action === 'hold') {
    const why = mustHold[0] ?? 'no signal';
    return `Hold (${regime}): ${why}`;
  }
  return `Open long ${candidate} in ${regime} regime. Narrative ${narrative.direction}@${narrative.confidenceLevel.toFixed(2)}, quant ${quant.dominantDirection}@${meanWeight(quant).toFixed(2)}, dissent ${dissent.dissentSeverity}.`;
}

function defaultNarrative(): NarrativeAnalystOutput {
  return {
    narrativeSummary: '',
    kolMentionedTokens: [],
    sentimentScore: 0,
    confidenceLevel: 0,
    direction: 'neutral',
    flaggedAnomalies: [],
    topThesisToken: null,
  };
}

function defaultQuant(): QuantAnalystOutput {
  return {
    features: [],
    dominantDirection: 'neutral',
    liquidityAdequate: false,
    fundingRateWarning: false,
    recommendedToken: null,
  };
}
