export interface BaseEvent {
  eventId: string;
  source: 'fourmeme' | 'myx' | 'pyth';
  timestamp: number;
  blockNumber: number | null;
  rawHash: string | null;
}

export interface LaunchEvent extends BaseEvent {
  source: 'fourmeme';
  eventType: 'token_create';
  tokenAddress: string;
  creatorAddress: string;
  tokenName: string;
  tokenSymbol: string;
  initialSupplyOnCurve: bigint;
}

export interface PurchaseEvent extends BaseEvent {
  source: 'fourmeme';
  eventType: 'token_purchase';
  tokenAddress: string;
  buyerAddress: string;
  bnbAmount: bigint;
  tokenAmount: bigint;
  currentCurveBalance: bigint;
}

export interface GraduationEvent extends BaseEvent {
  source: 'fourmeme';
  eventType: 'liquidity_added' | 'pair_created' | 'pool_created';
  tokenAddress: string;
  bnbAccumulated: bigint;
  lpTokensBurned: boolean;
}

export interface MarketSnapshot extends BaseEvent {
  source: 'myx';
  eventType: 'market_snapshot';
  contractIndex: number;
  pair: string;
  poolId: string | null;
  lastPrice: number;
  indexPrice: number;
  fundingRate: number | null;
  openInterest: number;
  openInterestUsd: number;
  baseVolume: number;
  quoteVolume: number;
}

export interface PriceUpdate extends BaseEvent {
  source: 'pyth';
  eventType: 'price_update';
  feedId: string;
  pair: string;
  price: bigint;
  confidence: bigint;
  exponent: number;
  publishTime: number;
}

export type PerceptionEvent =
  | LaunchEvent
  | PurchaseEvent
  | GraduationEvent
  | MarketSnapshot
  | PriceUpdate;

export interface AggregateMetrics {
  computedAt: number;
  launchVelocityPerHour: number;
  capitalInflowBNBPerHour: number;
  graduationVelocityPerHour: number;
  activeLaunches: number;
  topTokensByInflow: Array<{
    tokenAddress: string;
    bnbInflow: bigint;
    curveProgress: number;
  }>;
  myxMetrics: Record<
    string,
    {
      crowdScore: number;
      fundingRateCurrent: number | null;
      fundingTrendDirection: 'rising' | 'falling' | 'stable';
      openInterestUsd: number;
    }
  >;
}
