export interface UserRecord {
  userId: string;
  privyId: string;
  walletAddress: `0x${string}`;
  walletId: string | null;
  email: string | null;
  displayName: string | null;
  createdAt: string;
  lastSeenAt: string;
}

export interface Subscription {
  subscriptionId: string;
  userId: string;
  active: boolean;
  sessionSignerGranted: boolean;
  leverageMultiplier: number;
  maxPositionUsd: number;
  minConfidence: number;
  pausedUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserPosition {
  userPositionId: string;
  userId: string;
  sourcePositionId: string;
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
  status: 'submitted' | 'pending' | 'filled' | 'managed' | 'closed' | 'expired' | 'liquidated' | 'skipped';
  orderId: string | null;
  entryTxHash: string | null;
  exitTxHash: string | null;
  exitReason: string | null;
  realizedPnlUsd: number | null;
  skipReason: string | null;
  openedAt: string;
  closedAt: string | null;
}

export interface SessionContext {
  userId: string;
  privyId: string;
  walletAddress: `0x${string}`;
}
