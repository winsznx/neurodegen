import { parseAbiItem, getAddress } from 'viem';
import { logsPublicClient } from '@/lib/clients/chain';
import { ATTESTATION_CONTRACT_ADDRESS, ATTESTATION_DEPLOY_BLOCK } from '@/config/chains';

const CHUNK_SIZE = 10_000n;
const MAX_SCAN_WINDOW = 500_000n;
const CACHE_TTL_MS = 60_000;

const POSITION_OPENED = parseAbiItem(
  'event PositionOpened(bytes32 indexed reasoningGraphId, uint256 pairIndex, bool isLong, uint256 sizeAmount, uint256 timestamp)'
);
const POSITION_CLOSED = parseAbiItem(
  'event PositionClosed(bytes32 indexed reasoningGraphId, uint256 pairIndex, bool isLong, int256 realizedPnl, uint256 timestamp)'
);

export interface AttestationPositionEvent {
  kind: 'opened' | 'closed';
  reasoningGraphId: `0x${string}`;
  pairIndex: number;
  isLong: boolean;
  amount: bigint;
  timestamp: number;
  blockNumber: bigint;
  txHash: `0x${string}`;
}

export interface AttestationHistory {
  contractAddress: `0x${string}` | null;
  fromBlock: bigint;
  toBlock: bigint;
  indexedAt: number;
  opens: AttestationPositionEvent[];
  closes: AttestationPositionEvent[];
}

const EMPTY_HISTORY: AttestationHistory = {
  contractAddress: null,
  fromBlock: 0n,
  toBlock: 0n,
  indexedAt: 0,
  opens: [],
  closes: [],
};

let cache: { expires: number; data: AttestationHistory } | null = null;

function getContractAddress(): `0x${string}` | null {
  if (!ATTESTATION_CONTRACT_ADDRESS) return null;
  try {
    return getAddress(ATTESTATION_CONTRACT_ADDRESS) as `0x${string}`;
  } catch {
    return null;
  }
}

export async function getAttestationHistory(): Promise<AttestationHistory> {
  if (cache && cache.expires > Date.now()) return cache.data;

  const address = getContractAddress();
  if (!address) return EMPTY_HISTORY;

  const head = await logsPublicClient.getBlockNumber();
  const deployBlock = ATTESTATION_DEPLOY_BLOCK;
  const earliestScan = head > MAX_SCAN_WINDOW ? head - MAX_SCAN_WINDOW : 0n;
  const fromBlock = deployBlock > earliestScan ? deployBlock : earliestScan;

  const opens: AttestationPositionEvent[] = [];
  const closes: AttestationPositionEvent[] = [];

  for (let start = fromBlock; start <= head; start += CHUNK_SIZE) {
    const end = start + CHUNK_SIZE - 1n > head ? head : start + CHUNK_SIZE - 1n;
    try {
      const [openLogs, closeLogs] = await Promise.all([
        logsPublicClient.getLogs({ address, event: POSITION_OPENED, fromBlock: start, toBlock: end }),
        logsPublicClient.getLogs({ address, event: POSITION_CLOSED, fromBlock: start, toBlock: end }),
      ]);

      for (const log of openLogs) {
        const args = log.args;
        if (
          !args.reasoningGraphId ||
          args.pairIndex === undefined ||
          args.isLong === undefined ||
          args.sizeAmount === undefined ||
          args.timestamp === undefined
        ) continue;
        opens.push({
          kind: 'opened',
          reasoningGraphId: args.reasoningGraphId,
          pairIndex: Number(args.pairIndex),
          isLong: args.isLong,
          amount: args.sizeAmount,
          timestamp: Number(args.timestamp) * 1000,
          blockNumber: log.blockNumber ?? 0n,
          txHash: log.transactionHash ?? '0x',
        });
      }

      for (const log of closeLogs) {
        const args = log.args;
        if (
          !args.reasoningGraphId ||
          args.pairIndex === undefined ||
          args.isLong === undefined ||
          args.realizedPnl === undefined ||
          args.timestamp === undefined
        ) continue;
        closes.push({
          kind: 'closed',
          reasoningGraphId: args.reasoningGraphId,
          pairIndex: Number(args.pairIndex),
          isLong: args.isLong,
          amount: args.realizedPnl,
          timestamp: Number(args.timestamp) * 1000,
          blockNumber: log.blockNumber ?? 0n,
          txHash: log.transactionHash ?? '0x',
        });
      }
    } catch (err) {
      console.error(
        `[attestation-history] getLogs failed for range ${start}-${end}:`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  opens.sort((a, b) => Number(b.blockNumber - a.blockNumber));
  closes.sort((a, b) => Number(b.blockNumber - a.blockNumber));

  const history: AttestationHistory = {
    contractAddress: address,
    fromBlock,
    toBlock: head,
    indexedAt: Date.now(),
    opens,
    closes,
  };

  cache = { expires: Date.now() + CACHE_TTL_MS, data: history };
  return history;
}
