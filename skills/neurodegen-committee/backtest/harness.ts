import {
  emptyRegimeState,
  computeActiveSurgeTokens,
} from '../src/regime';
import {
  runCommittee,
  type NarrativeAnalyst,
  type PortfolioState,
  type QuantAnalyst,
} from '../src/committee';
import { REGIME_PARAMS } from '../src/config';
import type {
  DecisionRecord,
  MandateRiskLevel,
  MarketSnapshot,
  NarrativeAnalystOutput,
  QuantAnalystOutput,
} from '../src/types';

/**
 * Each fixture bar is a complete snapshot plus a 5-min forward return per
 * tradable symbol (close[t+1] / close[t] - 1, fraction). The backtester uses
 * the forward return to mark positions to market and trigger TP/SL.
 */
export interface FixtureBar {
  timestampMs: number;
  snapshot: MarketSnapshot;
  forwardReturnPctBySymbol: Record<string, number>;
}

export interface Fixture {
  startedAt: string;
  endedAt: string;
  barIntervalMs: number;
  bars: FixtureBar[];
}

export interface LlmCacheEntry {
  narrative: NarrativeAnalystOutput;
  quant: QuantAnalystOutput;
}

export type LlmCache = Record<string, LlmCacheEntry>;

export interface BacktestConfig {
  initialEquityUsd: number;
  mandate: MandateRiskLevel;
  feeBps: number;
  slippageBps: number;
  maxHoldMs: number;
}

export interface Trade {
  openedAt: number;
  closedAt: number;
  symbol: string;
  entryUsd: number;
  exitUsd: number;
  pnlUsd: number;
  returnPct: number;
  closeReason: 'tp' | 'sl' | 'maxHold' | 'regimeFlip' | 'final';
  regimeAtOpen: string;
}

export interface BacktestRun {
  config: BacktestConfig;
  decisions: DecisionRecord[];
  trades: Trade[];
  finalEquityUsd: number;
  peakEquityUsd: number;
  maxDrawdownPct: number;
}

export const DEFAULT_BACKTEST_CONFIG: BacktestConfig = {
  initialEquityUsd: 1000,
  mandate: 'moderate',
  feeBps: 10,
  slippageBps: 50,
  maxHoldMs: 4 * 60 * 60 * 1000,
};

interface OpenPosition {
  openedAt: number;
  symbol: string;
  entryUsd: number;
  remainingMs: number;
  tpPct: number;
  slPct: number;
  regimeAtOpen: string;
}

/**
 * Run a deterministic replay of the Skill against a fixtures file. The two
 * analyst calls come from the LLM cache: for each bar timestamp we look up a
 * pre-recorded narrative + quant output. Missing entries fall back to a
 * neutral synthetic, simulating a parse failure.
 */
export async function runBacktest(
  fixture: Fixture,
  cache: LlmCache,
  config: BacktestConfig = DEFAULT_BACKTEST_CONFIG,
): Promise<BacktestRun> {
  const regimeState = emptyRegimeState();
  const decisions: DecisionRecord[] = [];
  const trades: Trade[] = [];
  const openPositions: OpenPosition[] = [];

  let equity = config.initialEquityUsd;
  let peakEquity = equity;
  let maxDrawdownPct = 0;

  for (const bar of fixture.bars) {
    bar.snapshot.activeSurgeTokens = computeActiveSurgeTokens(bar.snapshot);

    const narrativeAnalyst: NarrativeAnalyst = async () => {
      const hit = cache[`${bar.timestampMs}:narrative`];
      return hit
        ? { parsed: hit.narrative, parseOk: true }
        : { parsed: neutralNarrative(), parseOk: false };
    };
    const quantAnalyst: QuantAnalyst = async () => {
      const hit = cache[`${bar.timestampMs}:quant`];
      return hit
        ? { parsed: hit.quant, parseOk: true }
        : { parsed: neutralQuant(), parseOk: false };
    };

    const portfolio: PortfolioState = {
      equityUsd: equity,
      currentExposureUsd: sumExposure(openPositions),
      openPositions: openPositions.length,
      drawdownPct: peakEquity === 0 ? 0 : ((peakEquity - equity) / peakEquity) * 100,
      dailyLossUsd: 0,
    };

    const decision = await runCommittee({
      snapshot: bar.snapshot,
      regimeState,
      portfolio,
      mandate: config.mandate,
      narrativeAnalyst,
      quantAnalyst,
      now: bar.timestampMs,
    });
    decisions.push(decision);

    const fwd = bar.forwardReturnPctBySymbol;

    for (let i = openPositions.length - 1; i >= 0; i--) {
      const pos = openPositions[i];
      const ret = fwd[pos.symbol] ?? 0;
      pos.remainingMs -= fixture.barIntervalMs;

      let closeReason: Trade['closeReason'] | null = null;
      const unrealizedPct = ret * 100;

      if (unrealizedPct >= pos.tpPct) closeReason = 'tp';
      else if (unrealizedPct <= -pos.slPct) closeReason = 'sl';
      else if (pos.remainingMs <= 0) closeReason = 'maxHold';
      else if (decision.regime === 'quiet' || decision.regime === 'volatile') {
        closeReason = 'regimeFlip';
      }

      const exitNotional = pos.entryUsd * (1 + ret);
      const fees = (pos.entryUsd + exitNotional) * (config.feeBps / 10000);
      const slippage = exitNotional * (config.slippageBps / 10000);
      const pnl = exitNotional - pos.entryUsd - fees - slippage;

      if (closeReason) {
        trades.push({
          openedAt: pos.openedAt,
          closedAt: bar.timestampMs,
          symbol: pos.symbol,
          entryUsd: pos.entryUsd,
          exitUsd: round2(exitNotional),
          pnlUsd: round2(pnl),
          returnPct: round4(ret * 100),
          closeReason,
          regimeAtOpen: pos.regimeAtOpen,
        });
        equity += pnl;
        openPositions.splice(i, 1);
      } else {
        equity += pos.entryUsd * ret;
        pos.entryUsd = exitNotional;
      }
    }

    if (
      decision.action === 'open_long' &&
      decision.targetToken &&
      decision.sizeUsd > 0
    ) {
      const params = REGIME_PARAMS[decision.regime];
      openPositions.push({
        openedAt: bar.timestampMs,
        symbol: decision.targetToken,
        entryUsd: decision.sizeUsd,
        remainingMs: config.maxHoldMs,
        tpPct: params.tpPct,
        slPct: params.slPct,
        regimeAtOpen: decision.regime,
      });
      equity -= decision.sizeUsd * (config.feeBps / 10000);
    }

    peakEquity = Math.max(peakEquity, equity);
    const dd = peakEquity === 0 ? 0 : ((peakEquity - equity) / peakEquity) * 100;
    if (dd > maxDrawdownPct) maxDrawdownPct = dd;
  }

  for (const pos of openPositions) {
    trades.push({
      openedAt: pos.openedAt,
      closedAt: fixture.bars[fixture.bars.length - 1].timestampMs,
      symbol: pos.symbol,
      entryUsd: pos.entryUsd,
      exitUsd: pos.entryUsd,
      pnlUsd: 0,
      returnPct: 0,
      closeReason: 'final',
      regimeAtOpen: pos.regimeAtOpen,
    });
  }

  return {
    config,
    decisions,
    trades,
    finalEquityUsd: round2(equity),
    peakEquityUsd: round2(peakEquity),
    maxDrawdownPct: round4(maxDrawdownPct),
  };
}

function sumExposure(positions: OpenPosition[]): number {
  let s = 0;
  for (const p of positions) s += p.entryUsd;
  return s;
}

function neutralNarrative(): NarrativeAnalystOutput {
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

function neutralQuant(): QuantAnalystOutput {
  return {
    features: [],
    dominantDirection: 'neutral',
    liquidityAdequate: false,
    fundingRateWarning: false,
    recommendedToken: null,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
