export type PositionStatus =
  | 'SUBMITTED'
  | 'PENDING'
  | 'FILLED'
  | 'MANAGED'
  | 'CLOSED'
  | 'EXPIRED'
  | 'LIQUIDATED';

export type PositionDirection = 'long' | 'short' | 'spot';

export type ExitReason =
  | 'tp_hit'
  | 'sl_hit'
  | 'time_exit'
  | 'regime_exit'
  | 'manual'
  | 'admin'
  | 'signal_exit'
  | 'external_close'
  | 'agent_close'
  | 'liquidated'
  | 'probe_trade_unwind';

export interface PositionState {
  positionId: string;
  /**
   * UUID of the committee_sessions row that produced this position. Nullable
   * for positions created outside the committee flow (e.g. probe-trade
   * scheduler). The DB column is `UUID REFERENCES committee_sessions ON DELETE
   * SET NULL`, so an orphan FK cannot satisfy the constraint — use null.
   */
  sessionId: string | null;
  tokenSymbol: string;
  tokenAddress: `0x${string}`;
  direction: PositionDirection;
  sizeUSD: number;
  leverage: number;
  entryPriceUSD: number;
  tpPriceUSD: number | null;
  slPriceUSD: number | null;
  twakTxHash: `0x${string}`;
  attestationCommitTx: `0x${string}` | null;
  attestationRevealTx: `0x${string}` | null;
  status: PositionStatus;
  exitPriceUSD: number | null;
  pnlUSD: number | null;
  pnlPct: number | null;
  exitReason: ExitReason | null;
  openedAt: string;
  closedAt: string | null;
}

export interface PreExecutionCheckEntry {
  name: string;
  passed: boolean;
  value: string | number;
  threshold: string | number;
  message: string;
}

export interface PreExecutionCheckResult {
  passed: boolean;
  adjustedPositionSizeUSD: number;
  checks: PreExecutionCheckEntry[];
}

export interface RiskManagerState {
  currentDrawdownFromPeak: number;
  consecutiveLosses: number;
  /** @deprecated derived live from openPositions in canAct(); do not read elsewhere */
  positionsOpenCount: number;
  /** @deprecated derived live from openPositions in canAct(); do not read elsewhere */
  totalExposureUSD: number;
  dailyPnLUSD: number;
  dailyTradeCount: number;
  lastProbeTradeAt: number | null;
  peakPortfolioValueUSD: number;
}

export interface RiskManagerVerdict {
  approved: boolean;
  rejectionReason: string | null;
  adjustedPositionSizeUSD: number | null;
}

export interface TWAKPortfolioSnapshot {
  totalValueUSD: number;
  positions: Array<{
    tokenSymbol: string;
    tokenAddress: `0x${string}`;
    balanceTokens: string;
    valueUSD: number;
  }>;
  drawdownFromPeak: number;
  availableCapitalUSD: number;
  snapshotAt: number;
}

export interface TWAKSwapResult {
  txHash: `0x${string}`;
  fromAmountTokens: string;
  toAmountTokens: string;
  explorer: string;
  provider: string;
  executedPriceUSD: number;
}

export interface TWAKSwapQuote {
  inputTokens: string;
  outputTokens: string;
  minReceivedTokens: string;
  provider: string;
  priceImpactPct: number;
  networkFeeUSD: number;
}
