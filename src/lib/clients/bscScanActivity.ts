/**
 * Recent on-chain swap history for the agent wallet, read directly from BSC
 * RPC via viem `getLogs`. No third-party API key required — same RPC we use
 * for every other on-chain read.
 *
 * Previous implementation used the BscScan v1 REST endpoint which Etherscan
 * deprecated on 2026-06-26; v2 requires a paid plan for BSC. Reading
 * Transfer logs directly via the BSC RPC sidesteps both.
 *
 * Scans `BSCSCAN_LOOKBACK_BLOCKS` (default ~28800 = ~24h at 3s blocks) of
 * Transfer events for the agent wallet (as `from` OR `to`), groups by tx
 * hash, identifies swaps (sent one token + received another), and
 * classifies each as forward / reverse / oneway.
 */

import { parseAbiItem } from 'viem';
import { logsPublicClient } from './chain';

const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);

// Default: ~28800 blocks at 3s blocks = ~24h. Operator can widen via env.
const DEFAULT_LOOKBACK_BLOCKS = Number(process.env.BSCSCAN_LOOKBACK_BLOCKS ?? '28800');

interface TokenMeta {
  symbol: string;
  decimals: number;
}
const META_CACHE = new Map<string, TokenMeta>();

const STABLE_RE = /^(USDT|USDC|BUSD|DAI|FDUSD|TUSD|FRAX|USDD|USDE|USD1|USDF|USDf)$/i;

const ERC20_ABI = [
  parseAbiItem('function symbol() view returns (string)'),
  parseAbiItem('function decimals() view returns (uint8)'),
] as const;

async function getTokenMeta(contract: `0x${string}`): Promise<TokenMeta> {
  const cached = META_CACHE.get(contract.toLowerCase());
  if (cached) return cached;
  try {
    const [symbol, decimals] = await Promise.all([
      logsPublicClient.readContract({ address: contract, abi: ERC20_ABI, functionName: 'symbol' }),
      logsPublicClient.readContract({
        address: contract,
        abi: ERC20_ABI,
        functionName: 'decimals',
      }),
    ]);
    const meta: TokenMeta = { symbol: String(symbol), decimals: Number(decimals) };
    META_CACHE.set(contract.toLowerCase(), meta);
    return meta;
  } catch {
    const fallback: TokenMeta = { symbol: contract.slice(0, 8), decimals: 18 };
    META_CACHE.set(contract.toLowerCase(), fallback);
    return fallback;
  }
}

export interface OnChainSwap {
  hash: `0x${string}`;
  blockNumber: number;
  timestamp: number;
  sent: { symbol: string; amount: number; contract: `0x${string}` } | null;
  received: { symbol: string; amount: number; contract: `0x${string}` } | null;
  probable: 'forward' | 'reverse' | 'oneway';
}

interface TransferLog {
  blockNumber: bigint;
  transactionHash: `0x${string}`;
  address: `0x${string}`;
  args: { from: `0x${string}`; to: `0x${string}`; value: bigint };
}

export async function fetchAgentSwaps(
  agentAddress: `0x${string}`,
  options: { limit?: number; lookbackBlocks?: number } = {},
): Promise<OnChainSwap[]> {
  const limit = options.limit ?? 25;
  const lookback = BigInt(options.lookbackBlocks ?? DEFAULT_LOOKBACK_BLOCKS);
  const latest = await logsPublicClient.getBlockNumber().catch(() => null);
  if (latest === null) return [];
  const fromBlock = latest > lookback ? latest - lookback : 0n;

  const [outLogs, inLogs] = await Promise.all([
    logsPublicClient
      .getLogs({
        event: TRANSFER_EVENT,
        args: { from: agentAddress },
        fromBlock,
        toBlock: latest,
      })
      .catch(() => []),
    logsPublicClient
      .getLogs({
        event: TRANSFER_EVENT,
        args: { to: agentAddress },
        fromBlock,
        toBlock: latest,
      })
      .catch(() => []),
  ]);

  const allLogs = [...outLogs, ...inLogs] as unknown as TransferLog[];
  if (allLogs.length === 0) return [];

  const byTx = new Map<string, TransferLog[]>();
  for (const log of allLogs) {
    const list = byTx.get(log.transactionHash) ?? [];
    list.push(log);
    byTx.set(log.transactionHash, list);
  }

  const blockNumbers = new Set<bigint>();
  for (const log of allLogs) blockNumbers.add(log.blockNumber);
  const blockTimestamps = new Map<string, number>();
  await Promise.all(
    [...blockNumbers].map(async (bn) => {
      try {
        const b = await logsPublicClient.getBlock({ blockNumber: bn });
        blockTimestamps.set(bn.toString(), Number(b.timestamp) * 1000);
      } catch {
        blockTimestamps.set(bn.toString(), 0);
      }
    }),
  );

  const lowerAgent = agentAddress.toLowerCase();
  const swaps: OnChainSwap[] = [];

  for (const [hash, transfers] of byTx) {
    let sent: OnChainSwap['sent'] = null;
    let received: OnChainSwap['received'] = null;
    let blockNumber = 0;
    let timestamp = 0;

    for (const t of transfers) {
      blockNumber = Number(t.blockNumber);
      timestamp = blockTimestamps.get(t.blockNumber.toString()) ?? 0;
      const meta = await getTokenMeta(t.address);
      const amount = Number(t.args.value) / 10 ** meta.decimals;
      const fromAgent = t.args.from.toLowerCase() === lowerAgent;
      const toAgent = t.args.to.toLowerCase() === lowerAgent;
      if (fromAgent && !toAgent) {
        sent = { symbol: meta.symbol, amount, contract: t.address };
      } else if (toAgent && !fromAgent) {
        received = { symbol: meta.symbol, amount, contract: t.address };
      }
    }

    if (!sent || !received || sent.contract.toLowerCase() === received.contract.toLowerCase()) {
      continue;
    }

    const sentStable = STABLE_RE.test(sent.symbol);
    const recvStable = STABLE_RE.test(received.symbol);
    let probable: OnChainSwap['probable'] = 'oneway';
    if (sentStable && !recvStable) probable = 'forward';
    else if (!sentStable && recvStable) probable = 'reverse';
    else if (sentStable && recvStable) probable = 'oneway';

    swaps.push({
      hash: hash as `0x${string}`,
      blockNumber,
      timestamp,
      sent,
      received,
      probable,
    });
  }

  swaps.sort((a, b) => b.timestamp - a.timestamp);
  return swaps.slice(0, limit);
}
