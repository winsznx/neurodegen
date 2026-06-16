export interface JournalEntry {
  sessionId: string;
  sessionNumber: number;
  createdAt: number;
  regime: string;
  fearGreedAtSession: number;
  action: string;
  tokenSymbol: string | null;
  committeeConviction: 'LOW' | 'MEDIUM' | 'HIGH';
  dissentDetected: boolean;
  pnlPct: number | null;
  pnlUSD: number | null;
  holdDurationMinutes: number | null;
  exitReason: string | null;
  bscscanUrl: string | null;
}

export type X402Network = 'bsc' | 'base';

export interface X402Challenge {
  status: 402;
  network: X402Network;
  asset: `0x${string}`;
  amountAtomic: string;
  recipient: `0x${string}`;
  description: string;
}

export interface X402VerifiedPayment {
  valid: boolean;
  reason: string;
  txHash?: `0x${string}`;
  amountAtomic?: bigint;
  payer?: `0x${string}`;
}

export interface ConsumedX402Proof {
  txHash: `0x${string}`;
  payer: `0x${string}`;
  amountAtomic: string;
  consumedAt: number;
  endpoint: string;
}
