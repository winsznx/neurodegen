import type { PositionState } from '@/types/execution';
import { getSupabaseAdmin, getSupabaseClient } from '@/lib/clients/supabase';

interface PositionRow {
  position_id: string;
  session_id: string | null;
  token_symbol: string;
  token_address: string;
  direction: string;
  size_usd: number;
  leverage: number;
  entry_price_usd: number;
  tp_price_usd: number | null;
  sl_price_usd: number | null;
  twak_tx_hash: string;
  attestation_commit_tx: string | null;
  attestation_reveal_tx: string | null;
  status: string;
  exit_price_usd: number | null;
  pnl_usd: number | null;
  pnl_pct: number | null;
  exit_reason: string | null;
  opened_at: string;
  closed_at: string | null;
}

function toRow(p: PositionState): Record<string, unknown> {
  return {
    position_id: p.positionId,
    session_id: p.sessionId,
    token_symbol: p.tokenSymbol,
    token_address: p.tokenAddress,
    direction: p.direction,
    size_usd: p.sizeUSD,
    leverage: p.leverage,
    entry_price_usd: p.entryPriceUSD,
    tp_price_usd: p.tpPriceUSD,
    sl_price_usd: p.slPriceUSD,
    twak_tx_hash: p.twakTxHash,
    attestation_commit_tx: p.attestationCommitTx,
    attestation_reveal_tx: p.attestationRevealTx,
    status: p.status,
    exit_price_usd: p.exitPriceUSD,
    pnl_usd: p.pnlUSD,
    pnl_pct: p.pnlPct,
    exit_reason: p.exitReason,
    opened_at: p.openedAt,
    closed_at: p.closedAt,
  };
}

function fromRow(row: PositionRow): PositionState {
  return {
    positionId: row.position_id,
    sessionId: row.session_id,
    tokenSymbol: row.token_symbol,
    tokenAddress: row.token_address as `0x${string}`,
    direction: row.direction as PositionState['direction'],
    sizeUSD: row.size_usd,
    leverage: row.leverage,
    entryPriceUSD: row.entry_price_usd,
    tpPriceUSD: row.tp_price_usd,
    slPriceUSD: row.sl_price_usd,
    twakTxHash: row.twak_tx_hash as `0x${string}`,
    attestationCommitTx: row.attestation_commit_tx as `0x${string}` | null,
    attestationRevealTx: row.attestation_reveal_tx as `0x${string}` | null,
    status: row.status as PositionState['status'],
    exitPriceUSD: row.exit_price_usd,
    pnlUSD: row.pnl_usd,
    pnlPct: row.pnl_pct,
    exitReason: row.exit_reason as PositionState['exitReason'],
    openedAt: row.opened_at,
    closedAt: row.closed_at,
  };
}

export async function insertPosition(p: PositionState): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .schema('neurodegen')
    .from('positions')
    .insert(toRow(p));
  if (error) throw new Error(`insertPosition failed: ${error.message}`);
}

export async function updatePositionStatus(
  positionId: string,
  updates: Partial<PositionState>,
): Promise<void> {
  const mapped: Record<string, unknown> = {};
  if (updates.status !== undefined) mapped.status = updates.status;
  if (updates.exitPriceUSD !== undefined) mapped.exit_price_usd = updates.exitPriceUSD;
  if (updates.pnlUSD !== undefined) mapped.pnl_usd = updates.pnlUSD;
  if (updates.pnlPct !== undefined) mapped.pnl_pct = updates.pnlPct;
  if (updates.exitReason !== undefined) mapped.exit_reason = updates.exitReason;
  if (updates.closedAt !== undefined) mapped.closed_at = updates.closedAt;
  if (updates.attestationRevealTx !== undefined) mapped.attestation_reveal_tx = updates.attestationRevealTx;
  const { error } = await getSupabaseAdmin()
    .schema('neurodegen')
    .from('positions')
    .update(mapped)
    .eq('position_id', positionId);
  if (error) throw new Error(`updatePositionStatus failed: ${error.message}`);
}

export async function getOpenPositions(): Promise<PositionState[]> {
  const { data, error } = await getSupabaseClient()
    .schema('neurodegen')
    .from('positions')
    .select('*')
    .in('status', ['SUBMITTED', 'PENDING', 'FILLED', 'MANAGED'])
    .order('opened_at', { ascending: false });
  if (error) throw new Error(`getOpenPositions failed: ${error.message}`);
  return ((data as PositionRow[] | null) ?? []).map(fromRow);
}

export async function getPositionHistory(limit: number): Promise<PositionState[]> {
  const { data, error } = await getSupabaseClient()
    .schema('neurodegen')
    .from('positions')
    .select('*')
    .order('opened_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`getPositionHistory failed: ${error.message}`);
  return ((data as PositionRow[] | null) ?? []).map(fromRow);
}

export async function getPositionByTxHash(txHash: string): Promise<PositionState | null> {
  const { data, error } = await getSupabaseClient()
    .schema('neurodegen')
    .from('positions')
    .select('*')
    .eq('twak_tx_hash', txHash.toLowerCase())
    .maybeSingle();
  if (error) throw new Error(`getPositionByTxHash failed: ${error.message}`);
  return data ? fromRow(data as PositionRow) : null;
}

export async function getPositionById(positionId: string): Promise<PositionState | null> {
  const { data, error } = await getSupabaseClient()
    .schema('neurodegen')
    .from('positions')
    .select('*')
    .eq('position_id', positionId)
    .maybeSingle();
  if (error) throw new Error(`getPositionById failed: ${error.message}`);
  return data ? fromRow(data as PositionRow) : null;
}

export async function getDailyRealizedLoss(): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { data, error } = await getSupabaseClient()
    .schema('neurodegen')
    .from('positions')
    .select('pnl_usd')
    .eq('status', 'CLOSED')
    .gte('closed_at', startOfDay.toISOString())
    .lt('pnl_usd', 0);
  if (error) throw new Error(`getDailyRealizedLoss failed: ${error.message}`);
  return ((data as Array<{ pnl_usd: number | null }> | null) ?? []).reduce(
    (sum, row) => sum + Math.abs(row.pnl_usd ?? 0),
    0,
  );
}

export async function getDailyTradeCount(): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { count, error } = await getSupabaseClient()
    .schema('neurodegen')
    .from('positions')
    .select('position_id', { count: 'exact', head: true })
    .gte('opened_at', startOfDay.toISOString());
  if (error) throw new Error(`getDailyTradeCount failed: ${error.message}`);
  return count ?? 0;
}
