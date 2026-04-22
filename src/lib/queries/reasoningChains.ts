import { getSupabaseAdmin, getSupabaseClient } from '@/lib/clients/supabase';
import type { ReasoningGraph } from '@/types/cognition';

interface ReasoningChainRow {
  graph_id: string;
  created_at: string;
  regime: string;
  input_metrics: Record<string, unknown>;
  model_calls: Record<string, unknown>[];
  aggregation_logic: string;
  final_action: Record<string, unknown>;
  execution_result: Record<string, unknown> | null;
}

function serializeBigInt(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

function toRow(graph: ReasoningGraph): Record<string, unknown> {
  return JSON.parse(JSON.stringify({
    graph_id: graph.graphId,
    regime: graph.regime,
    input_metrics: graph.inputMetrics,
    model_calls: graph.modelCalls,
    aggregation_logic: graph.aggregationLogic,
    final_action: graph.finalAction,
    execution_result: graph.executionResult,
  }, serializeBigInt));
}

function fromRow(row: ReasoningChainRow): ReasoningGraph {
  return {
    graphId: row.graph_id,
    createdAt: new Date(row.created_at).getTime(),
    regime: row.regime as ReasoningGraph['regime'],
    inputMetrics: row.input_metrics as unknown as ReasoningGraph['inputMetrics'],
    modelCalls: row.model_calls as unknown as ReasoningGraph['modelCalls'],
    aggregationLogic: row.aggregation_logic,
    finalAction: row.final_action as unknown as ReasoningGraph['finalAction'],
    executionResult: row.execution_result as unknown as ReasoningGraph['executionResult'],
  };
}

export async function insertReasoningChain(graph: ReasoningGraph): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .schema('neurodegen')
    .from('reasoning_chains')
    .insert(toRow(graph));

  if (error) throw new Error(`Failed to insert reasoning chain: ${error.message}`);
}

export async function updateReasoningExecutionResult(
  graphId: string,
  executionResult: NonNullable<ReasoningGraph['executionResult']>
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .schema('neurodegen')
    .from('reasoning_chains')
    .update({ execution_result: executionResult })
    .eq('graph_id', graphId);

  if (error) throw new Error(`Failed to update reasoning execution result: ${error.message}`);
}

export async function getReasoningChainById(graphId: string): Promise<ReasoningGraph | null> {
  const { data, error } = await getSupabaseClient()
    .schema('neurodegen')
    .from('reasoning_chains')
    .select('*')
    .eq('graph_id', graphId)
    .single();

  if (error && error.code === 'PGRST116') return null;
  if (error) throw new Error(`Failed to fetch reasoning chain: ${error.message}`);
  return fromRow(data as ReasoningChainRow);
}

export async function getRecentReasoningChains(limit: number): Promise<ReasoningGraph[]> {
  const { data, error } = await getSupabaseClient()
    .schema('neurodegen')
    .from('reasoning_chains')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to fetch reasoning chains: ${error.message}`);
  return (data ?? []).map((row: ReasoningChainRow) => fromRow(row));
}
