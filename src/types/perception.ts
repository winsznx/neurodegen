export type RegimeLabel = 'quiet' | 'active' | 'momentum' | 'volatile';

export interface BaseEvent {
  eventId: string;
  source: 'cmc_hub' | 'pyth' | 'twak';
  timestamp: number;
}

export interface CMCQuoteEvent extends BaseEvent {
  source: 'cmc_hub';
  eventType: 'quote_update';
  tokenSymbol: string;
  tokenAddress: `0x${string}`;
  priceUSD: number;
  volume24hUSD: number;
  percentChange1h: number;
  percentChange24h: number;
  marketCapUSD: number;
  cmcRank: number;
}

export interface CMCFearGreedEvent extends BaseEvent {
  source: 'cmc_hub';
  eventType: 'fear_greed_update';
  value: number;
  label: 'extreme_fear' | 'fear' | 'neutral' | 'greed' | 'extreme_greed';
}

export interface CMCSocialEvent extends BaseEvent {
  source: 'cmc_hub';
  eventType: 'social_signal';
  tokenSymbol: string;
  kolMentionCount: number;
  velocityPerHour: number;
  sentimentDirection: 'positive' | 'negative' | 'neutral';
}

export interface CMCFundingEvent extends BaseEvent {
  source: 'cmc_hub';
  eventType: 'funding_rate_update';
  pair: string;
  fundingRateAnnualized: number;
  direction: 'rising' | 'falling' | 'stable';
}

export interface CMCLiquidityEvent extends BaseEvent {
  source: 'cmc_hub';
  eventType: 'dex_liquidity_snapshot';
  tokenSymbol: string;
  pairAddress: `0x${string}`;
  liquidityUSD: number;
  volume24hUSD: number;
  priceImpact1kUSD: number;
}

export interface CMCSecurityEvent extends BaseEvent {
  source: 'cmc_hub';
  eventType: 'security_check';
  tokenAddress: `0x${string}`;
  isHoneypot: boolean;
  ownerCanMint: boolean;
  riskScore: number;
  flags: string[];
}

export interface CMCNewsEvent extends BaseEvent {
  source: 'cmc_hub';
  eventType: 'news_headline';
  headline: string;
  summary: string;
  url: string;
  publishedAt: number;
  sentimentDirection: 'positive' | 'negative' | 'neutral';
}

export interface CMCTrendingNarrativeEvent extends BaseEvent {
  source: 'cmc_hub';
  eventType: 'trending_narrative';
  narrativeLabel: string;
  topTokens: string[];
  momentumScore: number;
}

export interface PythDivergenceEvent extends BaseEvent {
  source: 'pyth';
  eventType: 'divergence_check';
  tokenSymbol: string;
  cmcPriceUSD: number;
  pythPriceUSD: number;
  divergencePercent: number;
}

export type PerceptionEvent =
  | CMCQuoteEvent
  | CMCFearGreedEvent
  | CMCSocialEvent
  | CMCFundingEvent
  | CMCLiquidityEvent
  | CMCSecurityEvent
  | CMCNewsEvent
  | CMCTrendingNarrativeEvent
  | PythDivergenceEvent;

export interface AggregateMetrics {
  computedAt: number;
  regime: RegimeLabel;
  fearGreedValue: number;
  fearGreedLabel: string;
  topMoversByVolume: Array<{
    symbol: string;
    address: `0x${string}`;
    percentChange1h: number;
    volume24hUSD: number;
  }>;
  kolActivityByToken: Record<
    string,
    {
      mentionCount: number;
      velocityPerHour: number;
      sentimentDirection: 'positive' | 'negative' | 'neutral';
    }
  >;
  fundingRatesByPair: Record<
    string,
    {
      rateAnnualized: number;
      direction: 'rising' | 'falling' | 'stable';
    }
  >;
  marketLiquidityScore: number;
  activeSurgeTokens: number;
  x402SpendSessionUSDC: number;
  x402SpendDailyUSDC: number;
}
