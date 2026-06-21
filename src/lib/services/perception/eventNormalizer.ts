import { z } from 'zod';
import type {
  CMCFearGreedEvent,
  CMCFundingEvent,
  CMCLiquidityEvent,
  CMCNewsEvent,
  CMCQuoteEvent,
  CMCSecurityEvent,
  CMCSocialEvent,
  CMCTrendingNarrativeEvent,
  PythDivergenceEvent,
} from '@/types/perception';
import type { PythPriceFetch } from '@/lib/clients/pyth';

const HEX_ADDR = /^0x[a-fA-F0-9]{40}$/;

function asHexAddress(v: unknown, fallback: `0x${string}`): `0x${string}` {
  if (typeof v === 'string' && HEX_ADDR.test(v)) return v as `0x${string}`;
  return fallback;
}

const Quote = z
  .object({
    USD: z
      .object({
        price: z.number(),
        volume_24h: z.number(),
        percent_change_1h: z.number(),
        percent_change_24h: z.number(),
        market_cap: z.number().optional(),
      })
      .passthrough(),
  })
  .passthrough();

const QuoteListEntry = z
  .object({
    id: z.union([z.number(), z.string()]).optional(),
    name: z.string().optional(),
    symbol: z.string(),
    cmc_rank: z.number().optional(),
    platform: z
      .object({
        token_address: z.string().optional(),
        symbol: z.string().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
    quote: Quote,
  })
  .passthrough();

// CMC MCP `get_crypto_quotes_latest` returns a FLAT array where each entry has
// price/volume_24h/percent_change_* directly on the row instead of nested
// under `quote.USD`. Schema captures only the fields we use downstream.
const FlatQuoteEntry = z
  .object({
    id: z.union([z.number(), z.string()]).optional(),
    name: z.string().optional(),
    symbol: z.string(),
    rank: z.number().optional(),
    price: z.union([z.number(), z.string()]),
    volume_24h: z.union([z.number(), z.string()]).optional(),
    percent_change_1h: z.union([z.number(), z.string()]).optional(),
    percent_change_24h: z.union([z.number(), z.string()]).optional(),
    market_cap: z.union([z.number(), z.string()]).optional(),
  })
  .passthrough();

function flatToNested(entry: z.infer<typeof FlatQuoteEntry>): z.infer<typeof QuoteListEntry> {
  const toNum = (v: number | string | undefined): number => {
    if (v === undefined) return 0;
    if (typeof v === 'number') return v;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    id: entry.id,
    name: entry.name,
    symbol: entry.symbol,
    cmc_rank: entry.rank,
    quote: {
      USD: {
        price: toNum(entry.price),
        volume_24h: toNum(entry.volume_24h),
        percent_change_1h: toNum(entry.percent_change_1h),
        percent_change_24h: toNum(entry.percent_change_24h),
        market_cap: toNum(entry.market_cap),
      },
    },
  };
}

/**
 * Accepts either the v1 dict-of-symbols shape or the v2 list shape and normalizes
 * to an array of `CMCQuoteEvent` objects.
 */
export function normalizeCmcQuotes(
  rawData: unknown,
  fallbackAddressBySymbol: Record<string, `0x${string}`>,
  now: number = Date.now(),
): CMCQuoteEvent[] {
  const entries = collectQuoteEntries(rawData);
  const events: CMCQuoteEvent[] = [];
  for (const entry of entries) {
    const symbol = entry.symbol.toUpperCase();
    const usd = entry.quote.USD;
    const fallbackAddr =
      fallbackAddressBySymbol[symbol] ??
      ('0x0000000000000000000000000000000000000000' as `0x${string}`);
    const tokenAddress = asHexAddress(entry.platform?.token_address, fallbackAddr);
    events.push({
      eventId: crypto.randomUUID(),
      source: 'cmc_hub',
      eventType: 'quote_update',
      timestamp: now,
      tokenSymbol: symbol,
      tokenAddress,
      priceUSD: usd.price,
      volume24hUSD: usd.volume_24h,
      percentChange1h: usd.percent_change_1h,
      percentChange24h: usd.percent_change_24h,
      marketCapUSD: usd.market_cap ?? 0,
      cmcRank: entry.cmc_rank ?? 0,
    });
  }
  return events;
}

function collectQuoteEntries(rawData: unknown): z.infer<typeof QuoteListEntry>[] {
  if (Array.isArray(rawData)) {
    const out: z.infer<typeof QuoteListEntry>[] = [];
    for (const item of rawData) {
      // Try the nested {quote: {USD: ...}} shape first (legacy CMC v1/v2 REST).
      const nested = QuoteListEntry.safeParse(item);
      if (nested.success) {
        out.push(nested.data);
        continue;
      }
      // Fall back to the flat shape returned by CMC MCP tools/call.
      const flat = FlatQuoteEntry.safeParse(item);
      if (flat.success) out.push(flatToNested(flat.data));
    }
    return out;
  }
  if (rawData && typeof rawData === 'object') {
    const candidate = (rawData as Record<string, unknown>).data ?? rawData;
    if (Array.isArray(candidate)) {
      return collectQuoteEntries(candidate);
    }
    const dict = candidate as Record<string, unknown>;
    const out: z.infer<typeof QuoteListEntry>[] = [];
    for (const [_sym, value] of Object.entries(dict)) {
      const nested = QuoteListEntry.safeParse(value);
      if (nested.success) {
        out.push(nested.data);
        continue;
      }
      const flat = FlatQuoteEntry.safeParse(value);
      if (flat.success) out.push(flatToNested(flat.data));
    }
    return out;
  }
  return [];
}

const FearGreedSchema = z
  .object({
    value: z.number().int().min(0).max(100),
    value_classification: z.string().optional(),
  })
  .passthrough();

const GlobalMetricsResponse = z
  .object({
    data: z
      .object({
        fear_and_greed: FearGreedSchema.optional(),
        fear_greed: FearGreedSchema.optional(),
        fear_and_greed_index: FearGreedSchema.optional(),
      })
      .passthrough(),
  })
  .passthrough();

function fearGreedLabel(
  raw: string | undefined,
  value: number,
): CMCFearGreedEvent['label'] {
  if (raw) {
    const normalized = raw.toLowerCase().replace(/\s+/g, '_');
    if (
      normalized === 'extreme_fear' ||
      normalized === 'fear' ||
      normalized === 'neutral' ||
      normalized === 'greed' ||
      normalized === 'extreme_greed'
    ) {
      return normalized;
    }
  }
  if (value < 25) return 'extreme_fear';
  if (value < 45) return 'fear';
  if (value <= 55) return 'neutral';
  if (value < 75) return 'greed';
  return 'extreme_greed';
}

export function normalizeFearGreed(
  rawData: unknown,
  now: number = Date.now(),
): CMCFearGreedEvent | null {
  const parsed = GlobalMetricsResponse.safeParse(rawData);
  if (!parsed.success) return null;
  const fg =
    parsed.data.data.fear_and_greed ??
    parsed.data.data.fear_greed ??
    parsed.data.data.fear_and_greed_index;
  if (!fg) return null;
  return {
    eventId: crypto.randomUUID(),
    source: 'cmc_hub',
    eventType: 'fear_greed_update',
    timestamp: now,
    value: fg.value,
    label: fearGreedLabel(fg.value_classification, fg.value),
  };
}

const TrendingEntry = z
  .object({
    label: z.string(),
    name: z.string().optional(),
    tokens: z.array(z.string()).optional(),
    top_tokens: z.array(z.string()).optional(),
    momentum: z.number().optional(),
    momentum_score: z.number().optional(),
  })
  .passthrough();

export function normalizeTrendingNarratives(
  rawData: unknown,
  now: number = Date.now(),
): CMCTrendingNarrativeEvent[] {
  if (!rawData || typeof rawData !== 'object') return [];
  const list = (rawData as { data?: unknown[]; results?: unknown[] }).data
    ?? (rawData as { results?: unknown[] }).results
    ?? rawData;
  if (!Array.isArray(list)) return [];
  const out: CMCTrendingNarrativeEvent[] = [];
  for (const raw of list) {
    const parsed = TrendingEntry.safeParse(raw);
    if (!parsed.success) continue;
    const e = parsed.data;
    out.push({
      eventId: crypto.randomUUID(),
      source: 'cmc_hub',
      eventType: 'trending_narrative',
      timestamp: now,
      narrativeLabel: e.label || e.name || 'unknown',
      topTokens: e.top_tokens ?? e.tokens ?? [],
      momentumScore: e.momentum_score ?? e.momentum ?? 0,
    });
  }
  return out;
}

const NewsEntry = z
  .object({
    title: z.string(),
    summary: z.string().optional(),
    url: z.string(),
    published_at: z
      .union([z.string(), z.number()])
      .transform((v) => (typeof v === 'string' ? new Date(v).getTime() : v))
      .optional(),
    sentiment: z.string().optional(),
  })
  .passthrough();

export function normalizeNews(
  rawData: unknown,
  now: number = Date.now(),
): CMCNewsEvent[] {
  if (!rawData || typeof rawData !== 'object') return [];
  const list = (rawData as { data?: unknown[]; results?: unknown[] }).data
    ?? (rawData as { results?: unknown[] }).results
    ?? rawData;
  if (!Array.isArray(list)) return [];
  const out: CMCNewsEvent[] = [];
  for (const raw of list) {
    const parsed = NewsEntry.safeParse(raw);
    if (!parsed.success) continue;
    const e = parsed.data;
    const sentiment = (e.sentiment ?? 'neutral').toLowerCase();
    const sentimentDirection: CMCNewsEvent['sentimentDirection'] =
      sentiment === 'positive' || sentiment === 'bullish'
        ? 'positive'
        : sentiment === 'negative' || sentiment === 'bearish'
          ? 'negative'
          : 'neutral';
    out.push({
      eventId: crypto.randomUUID(),
      source: 'cmc_hub',
      eventType: 'news_headline',
      timestamp: now,
      headline: e.title,
      summary: e.summary ?? '',
      url: e.url,
      publishedAt: e.published_at ?? now,
      sentimentDirection,
    });
  }
  return out;
}

const DerivativesPairEntry = z
  .object({
    pair: z.string().optional(),
    symbol: z.string().optional(),
    funding_rate_8h: z.number().optional(),
    funding_rate_annualized: z.number().optional(),
    funding_rate: z.number().optional(),
  })
  .passthrough();

export function normalizeDerivatives(
  rawData: unknown,
  now: number = Date.now(),
): CMCFundingEvent[] {
  if (!rawData || typeof rawData !== 'object') return [];
  const list = (rawData as { data?: unknown[]; pairs?: unknown[] }).data
    ?? (rawData as { pairs?: unknown[] }).pairs
    ?? rawData;
  if (!Array.isArray(list)) return [];
  const out: CMCFundingEvent[] = [];
  for (const raw of list) {
    const parsed = DerivativesPairEntry.safeParse(raw);
    if (!parsed.success) continue;
    const e = parsed.data;
    const pair = e.pair ?? e.symbol;
    if (!pair) continue;
    const rate8h = e.funding_rate_8h ?? e.funding_rate ?? 0;
    const rateAnnualized = e.funding_rate_annualized ?? rate8h * (365 * 3);
    out.push({
      eventId: crypto.randomUUID(),
      source: 'cmc_hub',
      eventType: 'funding_rate_update',
      timestamp: now,
      pair,
      fundingRateAnnualized: rateAnnualized,
      direction: rateAnnualized > 0.001 ? 'rising' : rateAnnualized < -0.001 ? 'falling' : 'stable',
    });
  }
  return out;
}

const SocialEntry = z
  .object({
    symbol: z.string(),
    kol_mention_count: z.number().optional(),
    velocity_per_hour: z.number().optional(),
    sentiment_direction: z.string().optional(),
  })
  .passthrough();

export function normalizeSocial(
  rawData: unknown,
  now: number = Date.now(),
): CMCSocialEvent[] {
  if (!rawData || typeof rawData !== 'object') return [];
  const list = (rawData as { data?: unknown[]; results?: unknown[] }).data
    ?? (rawData as { results?: unknown[] }).results
    ?? rawData;
  if (!Array.isArray(list)) return [];
  const out: CMCSocialEvent[] = [];
  for (const raw of list) {
    const parsed = SocialEntry.safeParse(raw);
    if (!parsed.success) continue;
    const e = parsed.data;
    const direction = (e.sentiment_direction ?? 'neutral').toLowerCase();
    const sentimentDirection: CMCSocialEvent['sentimentDirection'] =
      direction === 'positive' || direction === 'bullish'
        ? 'positive'
        : direction === 'negative' || direction === 'bearish'
          ? 'negative'
          : 'neutral';
    out.push({
      eventId: crypto.randomUUID(),
      source: 'cmc_hub',
      eventType: 'social_signal',
      timestamp: now,
      tokenSymbol: e.symbol.toUpperCase(),
      kolMentionCount: e.kol_mention_count ?? 0,
      velocityPerHour: e.velocity_per_hour ?? 0,
      sentimentDirection,
    });
  }
  return out;
}

const LiquidityEntry = z
  .object({
    symbol: z.string(),
    pair_address: z.string().optional(),
    liquidity_usd: z.number().optional(),
    volume_24h_usd: z.number().optional(),
    price_impact_1k_usd: z.number().optional(),
  })
  .passthrough();

export function normalizeDexLiquidity(
  rawData: unknown,
  fallbackAddressBySymbol: Record<string, `0x${string}`> = {},
  now: number = Date.now(),
): CMCLiquidityEvent[] {
  if (!rawData || typeof rawData !== 'object') return [];
  const list = (rawData as { data?: unknown[]; results?: unknown[] }).data
    ?? (rawData as { results?: unknown[] }).results
    ?? rawData;
  if (!Array.isArray(list)) return [];
  const out: CMCLiquidityEvent[] = [];
  for (const raw of list) {
    const parsed = LiquidityEntry.safeParse(raw);
    if (!parsed.success) continue;
    const e = parsed.data;
    out.push({
      eventId: crypto.randomUUID(),
      source: 'cmc_hub',
      eventType: 'dex_liquidity_snapshot',
      timestamp: now,
      tokenSymbol: e.symbol.toUpperCase(),
      pairAddress: asHexAddress(
        e.pair_address,
        fallbackAddressBySymbol[e.symbol.toUpperCase()] ??
          ('0x0000000000000000000000000000000000000000' as `0x${string}`),
      ),
      liquidityUSD: e.liquidity_usd ?? 0,
      volume24hUSD: e.volume_24h_usd ?? 0,
      priceImpact1kUSD: e.price_impact_1k_usd ?? 0,
    });
  }
  return out;
}

const SecurityEntry = z
  .object({
    token_address: z.string(),
    is_honeypot: z.boolean().optional(),
    owner_can_mint: z.boolean().optional(),
    risk_score: z.number().optional(),
    flags: z.array(z.string()).optional(),
  })
  .passthrough();

export function normalizeSecurity(
  rawData: unknown,
  now: number = Date.now(),
): CMCSecurityEvent | null {
  const candidate = rawData && typeof rawData === 'object'
    ? ((rawData as { data?: unknown }).data ?? rawData)
    : null;
  const parsed = SecurityEntry.safeParse(candidate);
  if (!parsed.success) return null;
  const e = parsed.data;
  return {
    eventId: crypto.randomUUID(),
    source: 'cmc_hub',
    eventType: 'security_check',
    timestamp: now,
    tokenAddress: asHexAddress(e.token_address, '0x0000000000000000000000000000000000000000'),
    isHoneypot: e.is_honeypot === true,
    ownerCanMint: e.owner_can_mint === true,
    riskScore: e.risk_score ?? 0,
    flags: e.flags ?? [],
  };
}

export function normalizePythDivergence(
  pythPrice: PythPriceFetch,
  cmcPriceUSD: number,
  tokenSymbol: string,
  now: number = Date.now(),
): PythDivergenceEvent {
  const divergencePercent =
    pythPrice.priceUSD > 0
      ? Math.abs(cmcPriceUSD - pythPrice.priceUSD) / pythPrice.priceUSD
      : 0;
  return {
    eventId: crypto.randomUUID(),
    source: 'pyth',
    eventType: 'divergence_check',
    timestamp: now,
    tokenSymbol: tokenSymbol.toUpperCase(),
    cmcPriceUSD,
    pythPriceUSD: pythPrice.priceUSD,
    divergencePercent,
  };
}
