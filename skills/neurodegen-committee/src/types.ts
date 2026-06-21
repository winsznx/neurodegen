/**
 * Self-contained types for the NeuroDegen Committee Skill.
 *
 * This module intentionally has no imports outside the Skill directory so the
 * Skill compiles standalone, separate from the V2 agent codebase.
 */

export type RegimeLabel = 'quiet' | 'active' | 'momentum' | 'volatile';

export type DirectionalLabel = 'bullish' | 'bearish' | 'neutral';

export type DissentSeverity = 'none' | 'mild' | 'strong';

export type MandateRiskLevel = 'conservative' | 'moderate' | 'aggressive';

export type Action =
  | 'open_long'
  | 'close_position'
  | 'adjust_parameters'
  | 'hold';

export interface FundingPair {
  rateAnnualized: number;
  openInterestUsd: number;
}

export interface KolEntry {
  mentionCount: number;
  velocityPerHour: number;
  sentimentDirection: DirectionalLabel;
}

export interface TopMover {
  symbol: string;
  price: number;
  percentChange1h: number;
  volume24hUsd: number;
}

export interface NarrativeTag {
  label: string;
  momentum: number;
}

export interface NewsHeadline {
  title: string;
  sentiment: DirectionalLabel;
}

export interface LiquiditySample {
  symbol: string;
  liquidityUsd: number;
  priceImpactPctFor1000Usd: number;
}

/**
 * The aggregated snapshot the regime classifier + both analysts read.
 * Built by the snapshot step from the seven CMC tools.
 */
export interface MarketSnapshot {
  timestampMs: number;
  fearGreedValue: number;
  fearGreedLabel: string;
  topMoversByVolume: TopMover[];
  fundingRatesByPair: Record<string, FundingPair>;
  kolActivityByToken: Record<string, KolEntry>;
  trendingNarratives: NarrativeTag[];
  newsHeadlines: NewsHeadline[];
  liquiditySamples: LiquiditySample[];
  /** Convenience: count of allowlist tokens with |percentChange1h| >= 5. */
  activeSurgeTokens: number;
  /** 0-100, optional. Used by the quant analyst prompt only. */
  marketLiquidityScore: number;
}

export interface NarrativeAnalystOutput {
  narrativeSummary: string;
  kolMentionedTokens: string[];
  sentimentScore: number;
  confidenceLevel: number;
  direction: DirectionalLabel;
  flaggedAnomalies: string[];
  topThesisToken: string | null;
}

export interface QuantFeature {
  name: string;
  value: number | string;
  direction: DirectionalLabel;
  weight: number;
}

export interface QuantAnalystOutput {
  features: QuantFeature[];
  dominantDirection: DirectionalLabel;
  liquidityAdequate: boolean;
  fundingRateWarning: boolean;
  recommendedToken: string | null;
}

export interface DissentResult {
  dissentDetected: boolean;
  dissentSeverity: DissentSeverity;
  narrativeDirection: DirectionalLabel;
  quantDirection: DirectionalLabel;
  positionSizeModifier: number;
  rationale: string;
}

export interface RegimeParameters {
  /** Multiplier applied to the base size. */
  sizeMult: number;
  /** Take-profit percent (positive). */
  tpPct: number;
  /** Stop-loss percent (positive). */
  slPct: number;
}

export interface RegimeClassification {
  regime: RegimeLabel;
  previousRegime: RegimeLabel | null;
  parameters: RegimeParameters;
  transitionedAt: number;
  transitionRationale: string;
}

export interface RegimeClassifierState {
  lastRegime: RegimeLabel | null;
  /** Timestamp of the first non-volatile metrics snapshot after entering volatile. */
  lastVolatileExitCandidateAt: number | null;
}

export interface SizingInput {
  baseUsd: number;
  regime: RegimeLabel;
  dissent: DissentSeverity;
  mandate: MandateRiskLevel;
  equityUsd: number;
  currentExposureUsd: number;
  drawdownPct: number;
}

export interface SizingResult {
  sizeUsd: number;
  regimeMult: number;
  dissentMult: number;
  mandateMult: number;
  drawdownMult: number;
  capped: boolean;
  reason?: string;
}

export interface RiskBand {
  label: 'normal' | 'alert' | 'defensive' | 'halt' | 'disqualified';
  /** Multiplier applied AFTER the sizing math (clamp toward zero). */
  sizeMult: number;
  /** If true, no new positions allowed regardless of size. */
  newEntriesBlocked: boolean;
  /** If true, the agent must stop entirely. */
  stop: boolean;
}

export interface DecisionRecord {
  schemaVersion: '0.1.0';
  timestampMs: number;
  regime: RegimeLabel;
  previousRegime: RegimeLabel | null;
  regimeRationale: string;
  narrative: NarrativeAnalystOutput;
  quant: QuantAnalystOutput;
  dissent: DissentResult;
  action: Action;
  targetToken: string | null;
  sizeUsd: number;
  sizing: SizingResult;
  riskBand: RiskBand;
  mustHoldReasons: string[];
  rationale: string;
}
