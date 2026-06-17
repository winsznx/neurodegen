import { publicClient } from '@/lib/clients/chain';
import { attestationEmitterAbi } from '@/lib/abis/attestationEmitter';
import { ATTESTATION_CONTRACT_ADDRESS, ATTESTATION_DEPLOY_BLOCK } from '@/config/chains';

export interface CommitEventInfo {
  txHash: `0x${string}`;
  blockNumber: bigint;
  timestamp: bigint;
  actionIntent: `0x${string}`;
}

export interface RevealEventInfo {
  txHash: `0x${string}`;
  blockNumber: bigint;
  timestamp: bigint;
  myxTxHash: `0x${string}`;
  orderId: `0x${string}`;
}

/**
 * Read the AttestationEmitter contract for the ReasoningCommitted event
 * matching a given reasoning hash. Returns null if not found.
 *
 * Used by /proof/[txHash] to verify the on-chain commit chronology.
 */
export async function findCommitEvent(
  reasoningHash: `0x${string}`,
): Promise<CommitEventInfo | null> {
  if (!ATTESTATION_CONTRACT_ADDRESS) return null;
  const logs = await publicClient
    .getContractEvents({
      address: ATTESTATION_CONTRACT_ADDRESS,
      abi: attestationEmitterAbi,
      eventName: 'ReasoningCommitted',
      args: { reasoningHash },
      fromBlock: ATTESTATION_DEPLOY_BLOCK,
      toBlock: 'latest',
    })
    .catch(() => []);
  const first = logs[0];
  if (!first) return null;
  return {
    txHash: first.transactionHash,
    blockNumber: first.blockNumber,
    timestamp: BigInt((first.args as { timestamp: bigint }).timestamp),
    actionIntent: (first.args as { actionIntent: `0x${string}` }).actionIntent,
  };
}

/**
 * Read the AttestationEmitter contract for the ExecutionRevealed event
 * matching a given reasoning hash.
 */
export async function findRevealEvent(
  reasoningHash: `0x${string}`,
): Promise<RevealEventInfo | null> {
  if (!ATTESTATION_CONTRACT_ADDRESS) return null;
  const logs = await publicClient
    .getContractEvents({
      address: ATTESTATION_CONTRACT_ADDRESS,
      abi: attestationEmitterAbi,
      eventName: 'ExecutionRevealed',
      args: { reasoningHash },
      fromBlock: ATTESTATION_DEPLOY_BLOCK,
      toBlock: 'latest',
    })
    .catch(() => []);
  const first = logs[0];
  if (!first) return null;
  return {
    txHash: first.transactionHash,
    blockNumber: first.blockNumber,
    timestamp: BigInt((first.args as { timestamp: bigint }).timestamp),
    myxTxHash: (first.args as { myxTxHash: `0x${string}` }).myxTxHash,
    orderId: (first.args as { orderId: `0x${string}` }).orderId,
  };
}

export interface ProofChainState {
  commit: CommitEventInfo | null;
  reveal: RevealEventInfo | null;
  /** seconds between commit and reveal (commit confirmed first); null if either missing */
  commitToRevealSeconds: number | null;
  /** true if commit block < reveal block */
  chronologyHolds: boolean;
  /** true if the on-chain ExecutionRevealed.myxTxHash matches the DB-stored swap tx */
  myxTxMatches: boolean;
}

export async function loadProofChain(
  reasoningHash: `0x${string}`,
  expectedSwapTxHash: `0x${string}`,
): Promise<ProofChainState> {
  const [commit, reveal] = await Promise.all([
    findCommitEvent(reasoningHash),
    findRevealEvent(reasoningHash),
  ]);
  const commitToRevealSeconds =
    commit && reveal ? Number(reveal.timestamp - commit.timestamp) : null;
  const chronologyHolds = !!commit && !!reveal && commit.blockNumber < reveal.blockNumber;
  const myxTxMatches =
    !!reveal && reveal.myxTxHash.toLowerCase() === expectedSwapTxHash.toLowerCase();
  return { commit, reveal, commitToRevealSeconds, chronologyHolds, myxTxMatches };
}
