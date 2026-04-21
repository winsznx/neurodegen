import { getSupabaseAdmin } from '@/lib/clients/supabase';
import type { UserPosition } from '@/types/users';

interface UserPositionRow {
  user_position_id: string;
  user_id: string;
  source_position_id: string;
  pair: string;
  pair_index: number;
  is_long: boolean;
  entry_price: number;
  exit_price: number | null;
  collateral_usd: number;
  size_amount: number;
  leverage: number;
  tp_price: number | null;
  sl_price: number | null;
  status: string;
  order_id: string | null;
  entry_tx_hash: string | null;
  exit_tx_hash: string | null;
  exit_reason: string | null;
  realized_pnl_usd: number | null;
  skip_reason: string | null;
  opened_at: string;
  closed_at: string | null;
}

function fromRow(row: UserPositionRow): UserPosition {
  return {
    userPositionId: row.user_position_id,
    userId: row.user_id,
    sourcePositionId: row.source_position_id,
    pair: row.pair,
    pairIndex: row.pair_index,
    isLong: row.is_long,
    entryPrice: Number(row.entry_price),
    exitPrice: row.exit_price !== null ? Number(row.exit_price) : null,
    collateralUsd: Number(row.collateral_usd),
    sizeAmount: Number(row.size_amount),
    leverage: Number(row.leverage),
    tpPrice: row.tp_price !== null ? Number(row.tp_price) : null,
    slPrice: row.sl_price !== null ? Number(row.sl_price) : null,
    status: row.status as UserPosition['status'],
    orderId: row.order_id,
    entryTxHash: row.entry_tx_hash,
    exitTxHash: row.exit_tx_hash,
    exitReason: row.exit_reason,
    realizedPnlUsd: row.realized_pnl_usd !== null ? Number(row.realized_pnl_usd) : null,
    skipReason: row.skip_reason,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
  };
}

function toRow(p: UserPosition): Record<string, unknown> {
  return {
    user_position_id: p.userPositionId,
    user_id: p.userId,
    source_position_id: p.sourcePositionId,
    pair: p.pair,
    pair_index: p.pairIndex,
    is_long: p.isLong,
    entry_price: p.entryPrice,
    exit_price: p.exitPrice,
    collateral_usd: p.collateralUsd,
    size_amount: p.sizeAmount,
    leverage: p.leverage,
    tp_price: p.tpPrice,
    sl_price: p.slPrice,
    status: p.status,
    order_id: p.orderId,
    entry_tx_hash: p.entryTxHash,
    exit_tx_hash: p.exitTxHash,
    exit_reason: p.exitReason,
    realized_pnl_usd: p.realizedPnlUsd,
    skip_reason: p.skipReason,
    opened_at: p.openedAt,
    closed_at: p.closedAt,
  };
}

export async function insertUserPosition(position: UserPosition): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .schema('neurodegen')
    .from('user_positions')
    .insert(toRow(position));

  if (error) throw new Error(`Failed to insert user position: ${error.message}`);
}

export async function updateUserPositionStatus(
  userPositionId: string,
  updates: Partial<UserPosition>
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (updates.status !== undefined) patch.status = updates.status;
  if (updates.exitPrice !== undefined) patch.exit_price = updates.exitPrice;
  if (updates.exitTxHash !== undefined) patch.exit_tx_hash = updates.exitTxHash;
  if (updates.exitReason !== undefined) patch.exit_reason = updates.exitReason;
  if (updates.realizedPnlUsd !== undefined) patch.realized_pnl_usd = updates.realizedPnlUsd;
  if (updates.closedAt !== undefined) patch.closed_at = updates.closedAt;
  if (updates.orderId !== undefined) patch.order_id = updates.orderId;
  if (updates.entryTxHash !== undefined) patch.entry_tx_hash = updates.entryTxHash;

  const { error } = await getSupabaseAdmin()
    .schema('neurodegen')
    .from('user_positions')
    .update(patch)
    .eq('user_position_id', userPositionId);

  if (error) throw new Error(`Failed to update user position: ${error.message}`);
}

export async function getUserPositions(userId: string, limit = 50): Promise<UserPosition[]> {
  const { data, error } = await getSupabaseAdmin()
    .schema('neurodegen')
    .from('user_positions')
    .select('*')
    .eq('user_id', userId)
    .order('opened_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to fetch user positions: ${error.message}`);
  return (data ?? []).map((row) => fromRow(row as UserPositionRow));
}

export async function getOpenUserPositionsForSource(sourcePositionId: string): Promise<UserPosition[]> {
  const { data, error } = await getSupabaseAdmin()
    .schema('neurodegen')
    .from('user_positions')
    .select('*')
    .eq('source_position_id', sourcePositionId)
    .in('status', ['submitted', 'pending', 'filled', 'managed']);

  if (error) throw new Error(`Failed to fetch user positions for source: ${error.message}`);
  return (data ?? []).map((row) => fromRow(row as UserPositionRow));
}
