import type {
  CommitteeSession,
  ExecutionResultRecord,
} from '@/types/cognition';
import { getSupabaseAdmin, getSupabaseClient } from '@/lib/clients/supabase';

interface CommitteeSessionRow {
  session_id: string;
  session_number: number;
  created_at: string;
  regime: string;
  previous_regime: string | null;
  fear_greed_value: number;
  input_metrics: Record<string, unknown>;
  ev_gate_decisions: Record<string, unknown>[];
  x402_spend_usdc: string;
  narrative_call: Record<string, unknown>;
  quant_call: Record<string, unknown>;
  dissent_result: Record<string, unknown>;
  risk_call: Record<string, unknown>;
  final_action: Record<string, unknown>;
  reasoning_hash: string;
  attestation_commit_tx: string | null;
  execution_result: Record<string, unknown> | null;
}

function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

function toRow(session: CommitteeSession): Record<string, unknown> {
  return JSON.parse(
    JSON.stringify(
      {
        session_id: session.sessionId,
        session_number: session.sessionNumber,
        created_at: new Date(session.createdAt).toISOString(),
        regime: session.regime,
        previous_regime: session.previousRegime,
        fear_greed_value: session.fearGreedAtSession,
        input_metrics: session.inputMetrics,
        ev_gate_decisions: session.evGateDecisions,
        x402_spend_usdc: session.x402SpendThisSessionUSDC.toFixed(4),
        narrative_call: session.narrativeCall,
        quant_call: session.quantCall,
        dissent_result: session.dissentResult,
        risk_call: session.riskCall,
        final_action: session.finalAction,
        reasoning_hash: session.reasoningHash,
        attestation_commit_tx: session.attestationCommitTx,
        execution_result: session.executionResult,
      },
      bigintReplacer,
    ),
  );
}

function fromRow(row: CommitteeSessionRow): CommitteeSession {
  return {
    sessionId: row.session_id,
    sessionNumber: row.session_number,
    createdAt: new Date(row.created_at).getTime(),
    regime: row.regime as CommitteeSession['regime'],
    previousRegime: row.previous_regime as CommitteeSession['previousRegime'],
    fearGreedAtSession: row.fear_greed_value,
    inputMetrics: row.input_metrics as unknown as CommitteeSession['inputMetrics'],
    evGateDecisions: row.ev_gate_decisions as unknown as CommitteeSession['evGateDecisions'],
    x402SpendThisSessionUSDC: parseFloat(row.x402_spend_usdc),
    narrativeCall: row.narrative_call as unknown as CommitteeSession['narrativeCall'],
    quantCall: row.quant_call as unknown as CommitteeSession['quantCall'],
    dissentResult: row.dissent_result as unknown as CommitteeSession['dissentResult'],
    riskCall: row.risk_call as unknown as CommitteeSession['riskCall'],
    finalAction: row.final_action as unknown as CommitteeSession['finalAction'],
    reasoningHash: row.reasoning_hash as `0x${string}`,
    attestationCommitTx: row.attestation_commit_tx as `0x${string}` | null,
    executionResult: row.execution_result as ExecutionResultRecord | null,
  };
}

export async function insertCommitteeSession(session: CommitteeSession): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .schema('neurodegen')
    .from('committee_sessions')
    .insert(toRow(session));
  if (error) throw new Error(`insertCommitteeSession failed: ${error.message}`);
}

export async function updateSessionExecutionResult(
  sessionId: string,
  executionResult: ExecutionResultRecord,
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .schema('neurodegen')
    .from('committee_sessions')
    .update({ execution_result: executionResult })
    .eq('session_id', sessionId);
  if (error) throw new Error(`updateSessionExecutionResult failed: ${error.message}`);
}

export async function updateSessionEvGateDecisions(
  sessionId: string,
  evGateDecisions: Record<string, unknown>[],
  x402SpendThisSessionUSDC: number,
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .schema('neurodegen')
    .from('committee_sessions')
    .update({
      ev_gate_decisions: evGateDecisions,
      x402_spend_usdc: x402SpendThisSessionUSDC.toFixed(4),
    })
    .eq('session_id', sessionId);
  if (error) throw new Error(`updateSessionEvGateDecisions failed: ${error.message}`);
}

export async function updateSessionAttestationCommit(
  sessionId: string,
  attestationCommitTx: `0x${string}`,
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .schema('neurodegen')
    .from('committee_sessions')
    .update({ attestation_commit_tx: attestationCommitTx })
    .eq('session_id', sessionId);
  if (error) throw new Error(`updateSessionAttestationCommit failed: ${error.message}`);
}

export async function getSessionById(sessionId: string): Promise<CommitteeSession | null> {
  const { data, error } = await getSupabaseClient()
    .schema('neurodegen')
    .from('committee_sessions')
    .select('*')
    .eq('session_id', sessionId)
    .maybeSingle();
  if (error) throw new Error(`getSessionById failed: ${error.message}`);
  return data ? fromRow(data as CommitteeSessionRow) : null;
}

export async function getRecentSessions(limit: number): Promise<CommitteeSession[]> {
  const { data, error } = await getSupabaseClient()
    .schema('neurodegen')
    .from('committee_sessions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`getRecentSessions failed: ${error.message}`);
  return ((data as CommitteeSessionRow[] | null) ?? []).map(fromRow);
}

export async function getSessionByReasoningHash(
  reasoningHash: `0x${string}`,
): Promise<CommitteeSession | null> {
  const { data, error } = await getSupabaseClient()
    .schema('neurodegen')
    .from('committee_sessions')
    .select('*')
    .eq('reasoning_hash', reasoningHash)
    .maybeSingle();
  if (error) throw new Error(`getSessionByReasoningHash failed: ${error.message}`);
  return data ? fromRow(data as CommitteeSessionRow) : null;
}

export async function getNextSessionNumber(): Promise<number> {
  const { data, error } = await getSupabaseClient()
    .schema('neurodegen')
    .from('committee_sessions')
    .select('session_number')
    .order('session_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getNextSessionNumber failed: ${error.message}`);
  return ((data as { session_number: number } | null)?.session_number ?? 0) + 1;
}
