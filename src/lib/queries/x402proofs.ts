import type { ConsumedX402Proof } from '@/types/monetization';
import { getSupabaseAdmin } from '@/lib/clients/supabase';

interface ProofRow {
  tx_hash: string;
  payer: string;
  amount_atomic: string;
  consumed_at: string;
  endpoint: string;
}

function fromRow(row: ProofRow): ConsumedX402Proof {
  return {
    txHash: row.tx_hash as `0x${string}`,
    payer: row.payer as `0x${string}`,
    amountAtomic: row.amount_atomic,
    consumedAt: new Date(row.consumed_at).getTime(),
    endpoint: row.endpoint,
  };
}

/**
 * Atomically record a consumed x402 proof. Returns `{recorded: false, replay: true}`
 * if the proof was already consumed (race-safe via the PRIMARY KEY constraint).
 * Returns `{recorded: true}` on first insert.
 *
 * V2 Phase 2 audit fix: previous implementation had TOCTOU race between
 * `isProofConsumed` and `recordProof` where two concurrent requests both
 * passed the check then both attempted insert. Now the insert IS the check.
 */
export async function recordProof(
  proof: Omit<ConsumedX402Proof, 'consumedAt'>,
): Promise<{ recorded: boolean; replay: boolean }> {
  const { error } = await getSupabaseAdmin()
    .schema('neurodegen')
    .from('consumed_x402_proofs')
    .insert({
      tx_hash: proof.txHash.toLowerCase(),
      payer: proof.payer.toLowerCase(),
      amount_atomic: proof.amountAtomic,
      endpoint: proof.endpoint,
    });
  if (!error) return { recorded: true, replay: false };
  // Supabase/Postgres unique violation surfaces as code '23505' OR the
  // message contains 'duplicate key'. Either form means replay.
  const code = (error as { code?: string }).code ?? '';
  const message = error.message ?? '';
  if (code === '23505' || /duplicate key|already exists/i.test(message)) {
    return { recorded: false, replay: true };
  }
  throw new Error(`recordProof failed: ${error.message}`);
}

export async function getProof(txHash: `0x${string}`): Promise<ConsumedX402Proof | null> {
  const { data, error } = await getSupabaseAdmin()
    .schema('neurodegen')
    .from('consumed_x402_proofs')
    .select('*')
    .eq('tx_hash', txHash.toLowerCase())
    .maybeSingle();
  if (error) throw new Error(`getProof failed: ${error.message}`);
  return data ? fromRow(data as ProofRow) : null;
}
