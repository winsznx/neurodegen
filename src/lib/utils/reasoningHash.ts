import { keccak256, stringToBytes, toHex, pad } from 'viem';
import type { ReasoningGraph, ActionRecommendation } from '@/types/cognition';

export interface ReasoningCommitment {
  reasoningHash: `0x${string}`;
  actionIntent: `0x${string}`;
}

function replacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  return value;
}

function sortObject<T>(obj: T): T {
  if (Array.isArray(obj)) return obj.map((item) => sortObject(item)) as unknown as T;
  if (obj !== null && typeof obj === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
      sorted[key] = sortObject((obj as Record<string, unknown>)[key]);
    }
    return sorted as T;
  }
  return obj;
}

export function canonicalizeReasoningGraph(graph: ReasoningGraph): string {
  return JSON.stringify(sortObject(graph), replacer);
}

function encodeActionIntent(action: ActionRecommendation): `0x${string}` {
  const raw = `${action.action}:${action.pair}`;
  const slice = stringToBytes(raw).slice(0, 32);
  const padded = new Uint8Array(32);
  padded.set(slice);
  return pad(toHex(padded), { size: 32 });
}

export function computeReasoningCommitment(graph: ReasoningGraph): ReasoningCommitment {
  const canonical = canonicalizeReasoningGraph(graph);
  const reasoningHash = keccak256(stringToBytes(canonical));
  const actionIntent = encodeActionIntent(graph.finalAction);
  return { reasoningHash, actionIntent };
}
