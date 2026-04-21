import { parseAbiItem, getAddress, bytesToString, toBytes } from 'viem';
import { logsPublicClient } from '@/lib/clients/chain';
import { ATTESTATION_CONTRACT_ADDRESS } from '@/config/chains';

const DEFAULT_LOOKUP_WINDOW = 200n;

const COMMIT_EVENT = parseAbiItem(
  'event ReasoningCommitted(bytes32 indexed reasoningHash, bytes32 actionIntent, uint256 timestamp)'
);
const REVEAL_EVENT = parseAbiItem(
  'event ExecutionRevealed(bytes32 indexed reasoningHash, bytes32 myxTxHash, bytes32 orderId, uint256 timestamp)'
);

export interface CommitRecord {
  reasoningHash: `0x${string}`;
  actionIntent: `0x${string}`;
  actionIntentDecoded: string;
  timestamp: bigint;
  blockNumber: bigint;
  txHash: `0x${string}`;
}

export interface RevealRecord {
  reasoningHash: `0x${string}`;
  myxTxHash: `0x${string}`;
  orderId: `0x${string}`;
  timestamp: bigint;
  blockNumber: bigint;
  txHash: `0x${string}`;
}

function decodeActionIntent(raw: `0x${string}`): string {
  try {
    const bytes = toBytes(raw);
    const trimmed = bytes.slice(0, bytes.findIndex((b) => b === 0) === -1 ? bytes.length : bytes.findIndex((b) => b === 0));
    return bytesToString(trimmed);
  } catch {
    return '';
  }
}

function attestationAddress(): `0x${string}` | null {
  if (!ATTESTATION_CONTRACT_ADDRESS) return null;
  return getAddress(ATTESTATION_CONTRACT_ADDRESS) as `0x${string}`;
}

function rangeAround(block: bigint, window: bigint): { fromBlock: bigint; toBlock: bigint } {
  const from = block > window ? block - window : 0n;
  return { fromBlock: from, toBlock: block + window };
}

export async function getCommitForReasoning(
  reasoningHash: `0x${string}`,
  referenceBlock: bigint,
  windowBlocks: bigint = DEFAULT_LOOKUP_WINDOW
): Promise<CommitRecord | null> {
  const address = attestationAddress();
  if (!address) return null;

  const { fromBlock, toBlock } = rangeAround(referenceBlock, windowBlocks);
  const logs = await logsPublicClient.getLogs({
    address,
    event: COMMIT_EVENT,
    args: { reasoningHash },
    fromBlock,
    toBlock,
  });

  if (logs.length === 0) return null;
  const log = logs[0];
  return {
    reasoningHash: log.args.reasoningHash as `0x${string}`,
    actionIntent: log.args.actionIntent as `0x${string}`,
    actionIntentDecoded: decodeActionIntent(log.args.actionIntent as `0x${string}`),
    timestamp: log.args.timestamp as bigint,
    blockNumber: log.blockNumber,
    txHash: log.transactionHash,
  };
}

export async function getRevealForReasoning(
  reasoningHash: `0x${string}`,
  referenceBlock: bigint,
  windowBlocks: bigint = DEFAULT_LOOKUP_WINDOW
): Promise<RevealRecord | null> {
  const address = attestationAddress();
  if (!address) return null;

  const { fromBlock, toBlock } = rangeAround(referenceBlock, windowBlocks);
  const logs = await logsPublicClient.getLogs({
    address,
    event: REVEAL_EVENT,
    args: { reasoningHash },
    fromBlock,
    toBlock,
  });

  if (logs.length === 0) return null;
  const log = logs[0];
  return {
    reasoningHash: log.args.reasoningHash as `0x${string}`,
    myxTxHash: log.args.myxTxHash as `0x${string}`,
    orderId: log.args.orderId as `0x${string}`,
    timestamp: log.args.timestamp as bigint,
    blockNumber: log.blockNumber,
    txHash: log.transactionHash,
  };
}
