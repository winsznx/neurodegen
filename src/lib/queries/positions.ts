import { getSupabaseAdmin, getSupabaseClient } from '@/lib/clients/supabase';
import type { PositionState } from '@/types/execution';

interface PositionRow {
  position_id: string;
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
  reasoning_graph_id: string;
  opened_at: string;
  closed_at: string | null;
}

function toRow(position: PositionState): Record<string, unknown> {
  return {
    position_id: position.positionId,
    pair: position.pair,
    pair_index: position.pairIndex,
    is_long: position.isLong,
    entry_price: position.entryPrice,
    exit_price: position.exitPrice,
    collateral_usd: position.collateralUsd,
    size_amount: position.sizeAmount,
    leverage: position.leverage,
    tp_price: position.tpPrice,
    sl_price: position.slPrice,
    status: position.status,
    order_id: position.orderId,
    entry_tx_hash: position.entryTxHash,
    exit_tx_hash: position.exitTxHash,
    exit_reason: position.exitReason,
    realized_pnl_usd: position.realizedPnlUsd,
    reasoning_graph_id: position.reasoningGraphId,
    opened_at: position.openedAt,
    closed_at: position.closedAt,
  };
}

function fromRow(row: PositionRow): PositionState {
  return {
    positionId: row.position_id,
    pair: row.pair,
    pairIndex: row.pair_index,
    isLong: row.is_long,
    entryPrice: row.entry_price,
    exitPrice: row.exit_price,
    collateralUsd: row.collateral_usd,
    sizeAmount: row.size_amount,
    leverage: row.leverage,
    tpPrice: row.tp_price,
    slPrice: row.sl_price,
    status: row.status as PositionState['status'],
    orderId: row.order_id,
    entryTxHash: row.entry_tx_hash,
    exitTxHash: row.exit_tx_hash,
    exitReason: row.exit_reason,
    realizedPnlUsd: row.realized_pnl_usd,
    reasoningGraphId: row.reasoning_graph_id,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
  };
}

export async function insertPosition(position: PositionState): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .schema('neurodegen')
    .from('positions')
    .insert(toRow(position));

  if (error) throw new Error(`Failed to insert position: ${error.message}`);
}

export async function updatePositionStatus(
  positionId: string,
  updates: Partial<PositionState>
): Promise<void> {
  const mapped: Record<string, unknown> = {};
  if (updates.status !== undefined) mapped.status = updates.status;
  if (updates.exitPrice !== undefined) mapped.exit_price = updates.exitPrice;
  if (updates.exitTxHash !== undefined) mapped.exit_tx_hash = updates.exitTxHash;
  if (updates.exitReason !== undefined) mapped.exit_reason = updates.exitReason;
  if (updates.realizedPnlUsd !== undefined) mapped.realized_pnl_usd = updates.realizedPnlUsd;
  if (updates.closedAt !== undefined) mapped.closed_at = updates.closedAt;
  if (updates.orderId !== undefined) mapped.order_id = updates.orderId;
  if (updates.entryTxHash !== undefined) mapped.entry_tx_hash = updates.entryTxHash;

  const { error } = await getSupabaseAdmin()
    .schema('neurodegen')
    .from('positions')
    .update(mapped)
    .eq('position_id', positionId);

  if (error) throw new Error(`Failed to update position: ${error.message}`);
}

export async function getOpenPositions(): Promise<PositionState[]> {
  const { data, error } = await getSupabaseClient()
    .schema('neurodegen')
    .from('positions')
    .select('*')
    .in('status', ['submitted', 'pending', 'filled', 'managed'])
    .order('opened_at', { ascending: false });

  if (error) throw new Error(`Failed to fetch open positions: ${error.message}`);
  return (data ?? []).map((row: PositionRow) => fromRow(row));
}

export async function getPositionHistory(limit: number): Promise<PositionState[]> {
  const { data, error } = await getSupabaseClient()
    .schema('neurodegen')
    .from('positions')
    .select('*')
    .order('opened_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to fetch position history: ${error.message}`);
  return (data ?? []).map((row: PositionRow) => fromRow(row));
}

export async function getPositionByEntryTxHash(
  txHash: string
): Promise<PositionState | null> {
  const { data, error } = await getSupabaseClient()
    .schema('neurodegen')
    .from('positions')
    .select('*')
    .eq('entry_tx_hash', txHash.toLowerCase())
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch position by entry tx: ${error.message}`);
  return data ? fromRow(data as PositionRow) : null;
}

export async function getDailyRealizedLoss(): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { data, error } = await getSupabaseClient()
    .schema('neurodegen')
    .from('positions')
    .select('realized_pnl_usd')
    .eq('status', 'closed')
    .gte('closed_at', startOfDay.toISOString())
    .lt('realized_pnl_usd', 0);
  if (error) throw new Error(`Failed to fetch daily realized loss: ${error.message}`);
  return (data ?? []).reduce((sum: number, row: { realized_pnl_usd: number | null }) =>
    sum + Math.abs(row.realized_pnl_usd ?? 0), 0);
}

export async function getPositionById(positionId: string): Promise<PositionState | null> {
  const { data, error } = await getSupabaseClient()
    .schema('neurodegen')
    .from('positions')
    .select('*')
    .eq('position_id', positionId)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch position by id: ${error.message}`);
  return data ? fromRow(data as PositionRow) : null;
}
