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

export async function isProofConsumed(txHash: `0x${string}`): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .schema('neurodegen')
    .from('consumed_x402_proofs')
    .select('tx_hash')
    .eq('tx_hash', txHash.toLowerCase())
    .maybeSingle();
  if (error) throw new Error(`isProofConsumed failed: ${error.message}`);
  return data !== null;
}

export async function recordProof(proof: Omit<ConsumedX402Proof, 'consumedAt'>): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .schema('neurodegen')
    .from('consumed_x402_proofs')
    .insert({
      tx_hash: proof.txHash.toLowerCase(),
      payer: proof.payer.toLowerCase(),
      amount_atomic: proof.amountAtomic,
      endpoint: proof.endpoint,
    });
  if (error) throw new Error(`recordProof failed: ${error.message}`);
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
