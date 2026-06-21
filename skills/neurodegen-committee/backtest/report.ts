import type { BacktestRun, Trade } from './harness';

export interface BacktestReport {
  totalReturnPct: number;
  netReturnPct: number;
  sharpe: number;
  maxDrawdownPct: number;
  winRate: number;
  avgWinUsd: number;
  avgLossUsd: number;
  avgHoldMinutes: number;
  tradesByRegime: Record<string, number>;
  holdRateByRegime: Record<string, number>;
  totalTrades: number;
}

const BARS_PER_YEAR_5MIN = 12 * 24 * 365; // 105_120

export function summarize(run: BacktestRun): BacktestReport {
  const initial = run.config.initialEquityUsd;
  const totalReturnPct = ((run.finalEquityUsd - initial) / initial) * 100;

  const wins = run.trades.filter((t) => t.pnlUsd > 0);
  const losses = run.trades.filter((t) => t.pnlUsd < 0);
  const winRate = run.trades.length === 0 ? 0 : wins.length / run.trades.length;
  const avgWin = avg(wins.map((t) => t.pnlUsd));
  const avgLoss = avg(losses.map((t) => t.pnlUsd));
  const avgHoldMs = avg(run.trades.map((t) => t.closedAt - t.openedAt));

  const tradesByRegime = countBy(run.trades, (t) => t.regimeAtOpen);
  const holdRateByRegime = computeHoldRate(run);

  const sharpe = computeSharpe(run);

  return {
    totalReturnPct: round2(totalReturnPct),
    netReturnPct: round2(totalReturnPct), // fees+slippage already in pnl
    sharpe: round4(sharpe),
    maxDrawdownPct: round2(run.maxDrawdownPct),
    winRate: round4(winRate),
    avgWinUsd: round2(avgWin),
    avgLossUsd: round2(avgLoss),
    avgHoldMinutes: round2(avgHoldMs / 60000),
    tradesByRegime,
    holdRateByRegime,
    totalTrades: run.trades.length,
  };
}

function computeHoldRate(run: BacktestRun): Record<string, number> {
  const totalsByRegime: Record<string, number> = {};
  const holdsByRegime: Record<string, number> = {};
  for (const d of run.decisions) {
    totalsByRegime[d.regime] = (totalsByRegime[d.regime] ?? 0) + 1;
    if (d.action === 'hold') {
      holdsByRegime[d.regime] = (holdsByRegime[d.regime] ?? 0) + 1;
    }
  }
  const out: Record<string, number> = {};
  for (const regime of Object.keys(totalsByRegime)) {
    out[regime] = round4(
      (holdsByRegime[regime] ?? 0) / totalsByRegime[regime],
    );
  }
  return out;
}

function computeSharpe(run: BacktestRun): number {
  // Per-bar returns derived from the equity curve. Without a curve snapshot
  // per bar, approximate from per-trade returns annualized to 5-min bars.
  if (run.trades.length < 2) return 0;
  const returns = run.trades.map((t: Trade) => t.returnPct / 100);
  const mean = avg(returns);
  const variance =
    avg(returns.map((r) => (r - mean) * (r - mean))) || 0;
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  return (mean / std) * Math.sqrt(BARS_PER_YEAR_5MIN / run.decisions.length);
}

function avg(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

function countBy<T>(xs: T[], key: (t: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const x of xs) {
    const k = key(x);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function renderReport(report: BacktestReport): string {
  return [
    `Total return: ${report.totalReturnPct}%`,
    `Net return:   ${report.netReturnPct}%`,
    `Sharpe:       ${report.sharpe}`,
    `Max drawdown: ${report.maxDrawdownPct}%`,
    `Win rate:     ${(report.winRate * 100).toFixed(2)}%`,
    `Avg win:      $${report.avgWinUsd}`,
    `Avg loss:     $${report.avgLossUsd}`,
    `Avg hold:     ${report.avgHoldMinutes} min`,
    `Trades:       ${report.totalTrades}`,
    `By regime:    ${JSON.stringify(report.tradesByRegime)}`,
    `Hold rate:    ${JSON.stringify(report.holdRateByRegime)}`,
  ].join('\n');
}
