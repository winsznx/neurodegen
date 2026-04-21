import type {
  LaunchEvent,
  PurchaseEvent,
  GraduationEvent,
  MarketSnapshot,
  PriceUpdate,
} from '@/types/perception';

interface BitqueryArgument {
  Name: string;
  Value: {
    string?: string;
    address?: string;
    integer?: string;
  };
}

interface BitqueryRawEvent {
  Block?: { Time?: string; Number?: number };
  Transaction?: { Hash?: string; From?: string };
  Arguments?: BitqueryArgument[];
}

function getArg(args: BitqueryArgument[], name: string): string | undefined {
  const arg = args.find((a) => a.Name === name);
  if (!arg) return undefined;
  return arg.Value.string ?? arg.Value.address ?? arg.Value.integer;
}

function requireArg(args: BitqueryArgument[], name: string, eventType: string): string {
  const value = getArg(args, name);
  if (value === undefined) {
    throw new Error(`Missing required field '${name}' in ${eventType} event`);
  }
  return value;
}

export function normalizeFourMemeEvent(
  rawEvent: unknown,
  eventType: string
): LaunchEvent | PurchaseEvent | GraduationEvent {
  const raw = rawEvent as BitqueryRawEvent;
  const args = raw.Arguments ?? [];
  const timestamp = raw.Block?.Time ? new Date(raw.Block.Time).getTime() : Date.now();
  const blockNumber = raw.Block?.Number ?? null;
  const rawHash = raw.Transaction?.Hash ?? null;

  if (eventType === 'TokenCreate') {
    return {
      eventId: crypto.randomUUID(),
      source: 'fourmeme',
      eventType: 'token_create',
      timestamp,
      blockNumber,
      rawHash,
      tokenAddress: requireArg(args, 'token', eventType),
      creatorAddress: requireArg(args, 'creator', eventType),
      tokenName: requireArg(args, 'name', eventType),
      tokenSymbol: requireArg(args, 'symbol', eventType),
      initialSupplyOnCurve: BigInt(
        getArg(args, 'initialSupply') ?? '800000000000000000000000000'
      ),
    };
  }

  if (eventType === 'TokenPurchase') {
    return {
      eventId: crypto.randomUUID(),
      source: 'fourmeme',
      eventType: 'token_purchase',
      timestamp,
      blockNumber,
      rawHash,
      tokenAddress: requireArg(args, 'token', eventType),
      buyerAddress: raw.Transaction?.From ?? requireArg(args, 'buyer', eventType),
      bnbAmount: BigInt(requireArg(args, 'bnbAmount', eventType)),
      tokenAmount: BigInt(requireArg(args, 'tokenAmount', eventType)),
      currentCurveBalance: BigInt(
        getArg(args, 'curveBalance') ?? '0'
      ),
    };
  }

  const graduationTypes = ['LiquidityAdded', 'PairCreated', 'PoolCreated'];
  if (graduationTypes.includes(eventType)) {
    const eventTypeMap: Record<string, 'liquidity_added' | 'pair_created' | 'pool_created'> = {
      LiquidityAdded: 'liquidity_added',
      PairCreated: 'pair_created',
      PoolCreated: 'pool_created',
    };

    return {
      eventId: crypto.randomUUID(),
      source: 'fourmeme',
      eventType: eventTypeMap[eventType],
      timestamp,
      blockNumber,
      rawHash,
      tokenAddress: requireArg(args, 'token', eventType),
      bnbAccumulated: BigInt(getArg(args, 'bnbAmount') ?? '0'),
      lpTokensBurned: getArg(args, 'lpBurned') === 'true',
    };
  }

  throw new Error(`Unknown Four.meme event type: ${eventType}`);
}

export function normalizeMarketSnapshot(
  rawData: unknown,
  ticker: string
): MarketSnapshot {
  const data = rawData as Record<string, unknown>;

  const parseNum = (v: unknown, fallback = 0): number => {
    if (v === null || v === undefined || v === '') return fallback;
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    return Number.isFinite(n) ? n : fallback;
  };
  const parseNullableNum = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    return Number.isFinite(n) ? n : null;
  };

  const contractIndex = typeof data.contract_index === 'number' ? data.contract_index : 0;

  return {
    eventId: crypto.randomUUID(),
    source: 'myx',
    eventType: 'market_snapshot',
    timestamp: Date.now(),
    blockNumber: null,
    rawHash: null,
    contractIndex,
    pair: ticker.replace('_', '/'),
    poolId: null,
    lastPrice: parseNum(data.last_price),
    indexPrice: parseNum(data.index_price),
    fundingRate: parseNullableNum(data.funding_rate),
    openInterest: parseNum(data.open_interest),
    openInterestUsd: parseNum(data.open_interest_in_usd),
    baseVolume: parseNum(data.base_volume),
    quoteVolume: parseNum(data.target_volume),
  };
}

export function normalizePriceUpdate(
  rawData: unknown,
  feedId: string,
  pair: string
): PriceUpdate {
  const data = rawData as {
    price?: string | number;
    confidence?: string | number;
    exponent?: number;
    publishTime?: number;
  };

  return {
    eventId: crypto.randomUUID(),
    source: 'pyth',
    eventType: 'price_update',
    timestamp: Date.now(),
    blockNumber: null,
    rawHash: null,
    feedId,
    pair,
    price: BigInt(data.price ?? 0),
    confidence: BigInt(data.confidence ?? 0),
    exponent: data.exponent ?? 0,
    publishTime: data.publishTime ?? Math.floor(Date.now() / 1000),
  };
}
