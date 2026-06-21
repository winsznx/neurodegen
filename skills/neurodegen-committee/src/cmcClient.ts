import type {
  FundingPair,
  KolEntry,
  LiquiditySample,
  MarketSnapshot,
  NarrativeTag,
  NewsHeadline,
  TopMover,
} from './types';
import { ALLOWLIST_SYMBOLS, SURGE_PCT_CHANGE_1H_MIN } from './config';

/**
 * Thin wrapper around the seven CMC MCP tools the Skill depends on. The
 * caller provides a `fetchTool(name, args) -> json` function so the Skill is
 * runtime-agnostic: in Claude Code that function dispatches to the MCP tool
 * invocation; in the backtest harness it reads from a fixtures file.
 */
export type CmcToolName =
  | 'get_crypto_quotes_latest'
  | 'get_global_metrics_latest'
  | 'get_global_crypto_derivatives_metrics'
  | 'trending_crypto_narratives'
  | 'get_crypto_latest_news'
  | 'get_crypto_metrics'
  | 'search_crypto_info';

export type FetchToolFn = (
  name: CmcToolName,
  args: Record<string, unknown>,
) => Promise<unknown>;

export interface SnapshotOptions {
  symbols?: ReadonlyArray<string>;
  /** When true, skip the two premium calls. */
  skipPremium?: boolean;
}

export async function buildSnapshot(
  fetchTool: FetchToolFn,
  options: SnapshotOptions = {},
): Promise<MarketSnapshot> {
  const symbols = options.symbols ?? ALLOWLIST_SYMBOLS;

  const [quotes, global, derivatives, narratives, news, kol, liquidity] =
    await Promise.all([
      fetchTool('get_crypto_quotes_latest', { symbols }),
      fetchTool('get_global_metrics_latest', {}),
      fetchTool('get_global_crypto_derivatives_metrics', {}),
      fetchTool('trending_crypto_narratives', {}),
      fetchTool('get_crypto_latest_news', {}),
      options.skipPremium
        ? Promise.resolve(null)
        : fetchTool('get_crypto_metrics', { symbols }),
      options.skipPremium
        ? Promise.resolve(null)
        : fetchTool('search_crypto_info', { symbols }),
    ]);

  const topMovers = parseQuotes(quotes);
  const { fearGreedValue, fearGreedLabel, marketLiquidityScore } =
    parseGlobal(global);
  const fundingRatesByPair = parseFunding(derivatives);
  const trendingNarratives = parseNarratives(narratives);
  const newsHeadlines = parseNews(news);
  const kolActivityByToken = parseKol(kol);
  const liquiditySamples = parseLiquidity(liquidity);

  const activeSurgeTokens = countSurge(topMovers);

  return {
    timestampMs: Date.now(),
    fearGreedValue,
    fearGreedLabel,
    topMoversByVolume: topMovers,
    fundingRatesByPair,
    kolActivityByToken,
    trendingNarratives,
    newsHeadlines,
    liquiditySamples,
    activeSurgeTokens,
    marketLiquidityScore,
  };
}

function countSurge(movers: TopMover[]): number {
  const allow = new Set<string>(ALLOWLIST_SYMBOLS as ReadonlyArray<string>);
  let n = 0;
  for (const m of movers) {
    if (allow.has(m.symbol) && Math.abs(m.percentChange1h) >= SURGE_PCT_CHANGE_1H_MIN) {
      n += 1;
    }
  }
  return n;
}

function parseQuotes(raw: unknown): TopMover[] {
  if (!raw || typeof raw !== 'object') return [];
  const arr = readArray(raw, 'data') ?? readArray(raw, 'quotes') ?? [];
  return arr
    .map((row): TopMover => {
      const r = row as Record<string, unknown>;
      return {
        symbol: String(r.symbol ?? ''),
        price: numberOr(r.price, 0),
        percentChange1h: numberOr(r.percentChange1h ?? r.percent_change_1h, 0),
        volume24hUsd: numberOr(r.volume24hUSD ?? r.volume24h ?? r.volume_24h, 0),
      };
    })
    .filter((m) => m.symbol.length > 0)
    .sort((a, b) => b.volume24hUsd - a.volume24hUsd);
}

function parseGlobal(raw: unknown): {
  fearGreedValue: number;
  fearGreedLabel: string;
  marketLiquidityScore: number;
} {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    fearGreedValue: numberOr(r.fearGreedValue ?? r.fear_greed_value, 50),
    fearGreedLabel: String(r.fearGreedLabel ?? r.fear_greed_label ?? 'neutral'),
    marketLiquidityScore: numberOr(
      r.marketLiquidityScore ?? r.market_liquidity_score,
      50,
    ),
  };
}

function parseFunding(raw: unknown): Record<string, FundingPair> {
  const out: Record<string, FundingPair> = {};
  if (!raw || typeof raw !== 'object') return out;
  const pairs = readArray(raw, 'pairs') ?? readArray(raw, 'data') ?? [];
  for (const row of pairs) {
    const r = row as Record<string, unknown>;
    const pair = String(r.pair ?? r.symbol ?? '');
    if (!pair) continue;
    out[pair] = {
      rateAnnualized: numberOr(r.fundingRateAnnualized ?? r.fundingRate, 0),
      openInterestUsd: numberOr(r.openInterestUsd ?? r.openInterest, 0),
    };
  }
  return out;
}

function parseNarratives(raw: unknown): NarrativeTag[] {
  if (!raw || typeof raw !== 'object') return [];
  const arr = readArray(raw, 'narratives') ?? readArray(raw, 'data') ?? [];
  return arr.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      label: String(r.label ?? r.name ?? ''),
      momentum: numberOr(r.momentum ?? r.strength, 0),
    };
  });
}

function parseNews(raw: unknown): NewsHeadline[] {
  if (!raw || typeof raw !== 'object') return [];
  const arr = readArray(raw, 'headlines') ?? readArray(raw, 'data') ?? [];
  return arr.map((row) => {
    const r = row as Record<string, unknown>;
    const s = String(r.sentiment ?? 'neutral');
    const sentiment =
      s === 'bullish' || s === 'bearish' || s === 'neutral' ? s : 'neutral';
    return { title: String(r.title ?? ''), sentiment };
  });
}

function parseKol(raw: unknown): Record<string, KolEntry> {
  const out: Record<string, KolEntry> = {};
  if (!raw || typeof raw !== 'object') return out;
  const arr = readArray(raw, 'tokens') ?? readArray(raw, 'data') ?? [];
  for (const row of arr) {
    const r = row as Record<string, unknown>;
    const symbol = String(r.symbol ?? '');
    if (!symbol) continue;
    const dir = String(r.sentimentDirection ?? 'neutral');
    const sentimentDirection =
      dir === 'bullish' || dir === 'bearish' || dir === 'neutral'
        ? dir
        : 'neutral';
    out[symbol] = {
      mentionCount: numberOr(r.mentionCount, 0),
      velocityPerHour: numberOr(r.velocityPerHour, 0),
      sentimentDirection,
    };
  }
  return out;
}

function parseLiquidity(raw: unknown): LiquiditySample[] {
  if (!raw || typeof raw !== 'object') return [];
  const arr = readArray(raw, 'tokens') ?? readArray(raw, 'data') ?? [];
  return arr.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      symbol: String(r.symbol ?? ''),
      liquidityUsd: numberOr(r.liquidityUsd, 0),
      priceImpactPctFor1000Usd: numberOr(r.priceImpactPctFor1000Usd, 0),
    };
  });
}

function readArray(raw: unknown, key: string): unknown[] | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = (raw as Record<string, unknown>)[key];
  return Array.isArray(v) ? v : null;
}

function numberOr(v: unknown, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim().length > 0) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}
