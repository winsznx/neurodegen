export interface PreExecutionCheckResult {
  passed: boolean;
  checks: Array<{
    name: string;
    passed: boolean;
    value: string | number;
    threshold: string | number;
    message: string;
  }>;
}

export type OrderLifecycleState =
  | 'submitted'
  | 'pending'
  | 'filled'
  | 'managed'
  | 'closing'
  | 'closed'
  | 'expired'
  | 'liquidated';

export interface PositionState {
  positionId: string;
  pair: string;
  pairIndex: number;
  isLong: boolean;
  entryPrice: number;
  exitPrice: number | null;
  collateralUsd: number;
  sizeAmount: number;
  leverage: number;
  tpPrice: number | null;
  slPrice: number | null;
  status: OrderLifecycleState;
  orderId: string | null;
  entryTxHash: string | null;
  exitTxHash: string | null;
  exitReason: string | null;
  realizedPnlUsd: number | null;
  reasoningGraphId: string;
  openedAt: string;
  closedAt: string | null;
}
