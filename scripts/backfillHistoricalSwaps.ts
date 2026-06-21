/**
 * Backfill the positions table from a known list of agent on-chain swap tx
 * hashes. Each tx receipt is fetched from the free public BSC RPC
 * (eth_getTransactionReceipt is unauth + unrate-limited; only eth_getLogs
 * needs an archive RPC). Transfer events in the receipt are parsed to
 * identify the swap (one ERC-20 sent FROM the agent + one different ERC-20
 * received TO the agent), and a position row is upserted into the DB.
 *
 * Idempotent — skips rows whose twak_tx_hash is already in the table.
 *
 * Run:
 *   railway run --service neurodegen -- pnpm exec tsx scripts/backfillHistoricalSwaps.ts
 *
 * Add more hashes to KNOWN_TX_HASHES as new probe / committee trades land
 * (or re-discover them from BscScan).
 */

import { createClient } from '@supabase/supabase-js';
import { createPublicClient, http, decodeEventLog, parseAbiItem, getAddress } from 'viem';
import { bsc } from 'viem/chains';

// Public unauthenticated BSC RPC. Unrelated to BSC_RPC_URL env so the script
// works locally without any Railway env setup.
const PUBLIC_RPCS = [
  'https://bsc-dataseed.binance.org',
  'https://bsc-dataseed1.bnbchain.org',
  'https://bsc-dataseed2.bnbchain.org',
];

const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);
const ERC20_ABI = [
  parseAbiItem('function symbol() view returns (string)'),
  parseAbiItem('function decimals() view returns (uint8)'),
] as const;

// Known historical tx hashes from BscScan / worker logs / SUBMISSION.md.
// Add to this list as more trades land. Duplicates safely no-op.
const KNOWN_TX_HASHES: string[] = [
  // Friday 6/26 morning probes
  '0xb37646ec9df...', // placeholder; truncated hashes from screenshots — fill in full when known
  '0x7f24887af70...',
  '0xb9bfcfc1970...',
  // Friday afternoon (real probe forward where CAKE was acquired)
  '0xe0ab85fccaea3ae899c16c3042c73de10b9aa16617a84e82693ea65c4d8aa33b',
  // Saturday 6/27 probes
  '0x9d4b89ad96b6a472f95281ee08661d5fde8807695a3af40d8a00af6128f4c2b0',
  '0x605a3d9c3ad7d1cacc8dbd04e85c53cdd506da7c7b2090d8d5257cbf25450e4d',
  '0xc6917ca745429e52335e828dd7730978ab6c103363b5c8bd974460c3f89a6dab',
];

const AGENT = (
  process.env.TWAK_AGENT_WALLET_ADDRESS ?? '0x1a59eD9BB4890a8ac02746BFC00EDeCBBBe375fF'
) as `0x${string}`;

const STABLE_RE = /^(USDT|USDC|BUSD|DAI|FDUSD|TUSD|FRAX|USDD|USDe|USD1|USDF|USDf)$/i;
const STABLE_USD = (symbol: string): number => (STABLE_RE.test(symbol) ? 1 : 0);

const tokenMetaCache = new Map<string, { symbol: string; decimals: number }>();

async function getMeta(client: ReturnType<typeof createPublicClient>, addr: `0x${string}`) {
  const cached = tokenMetaCache.get(addr.toLowerCase());
  if (cached) return cached;
  try {
    const [symbol, decimals] = await Promise.all([
      client.readContract({ address: addr, abi: ERC20_ABI, functionName: 'symbol' }),
      client.readContract({ address: addr, abi: ERC20_ABI, functionName: 'decimals' }),
    ]);
    const meta = { symbol: String(symbol), decimals: Number(decimals) };
    tokenMetaCache.set(addr.toLowerCase(), meta);
    return meta;
  } catch {
    const fb = { symbol: addr.slice(0, 8), decimals: 18 };
    tokenMetaCache.set(addr.toLowerCase(), fb);
    return fb;
  }
}

interface SwapInfo {
  blockNumber: number;
  timestamp: number;
  sent: { symbol: string; amount: number; contract: `0x${string}` } | null;
  received: { symbol: string; amount: number; contract: `0x${string}` } | null;
}

async function parseSwap(
  client: ReturnType<typeof createPublicClient>,
  txHash: `0x${string}`,
): Promise<SwapInfo | null> {
  const receipt = await client.getTransactionReceipt({ hash: txHash }).catch(() => null);
  if (!receipt) return null;
  if (receipt.status !== 'success') return null;

  const block = await client.getBlock({ blockNumber: receipt.blockNumber }).catch(() => null);
  const timestamp = block ? Number(block.timestamp) * 1000 : 0;
  const lowerAgent = AGENT.toLowerCase();

  let sent: SwapInfo['sent'] = null;
  let received: SwapInfo['received'] = null;

  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: [TRANSFER_EVENT],
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName !== 'Transfer') continue;
      const args = decoded.args as { from: `0x${string}`; to: `0x${string}`; value: bigint };
      const meta = await getMeta(client, log.address);
      const amount = Number(args.value) / 10 ** meta.decimals;
      const fromAgent = args.from.toLowerCase() === lowerAgent;
      const toAgent = args.to.toLowerCase() === lowerAgent;
      if (fromAgent && !toAgent && !sent) {
        sent = { symbol: meta.symbol, amount, contract: log.address };
      } else if (toAgent && !fromAgent && !received) {
        received = { symbol: meta.symbol, amount, contract: log.address };
      }
    } catch {
      /* not a Transfer */
    }
  }

  if (!sent || !received) return null;
  if (sent.contract.toLowerCase() === received.contract.toLowerCase()) return null;

  return { blockNumber: Number(receipt.blockNumber), timestamp, sent, received };
}

async function main(): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing — run via `railway run`.');
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  const validHashes = KNOWN_TX_HASHES.filter(
    (h) => /^0x[a-fA-F0-9]{64}$/.test(h),
  ) as `0x${string}`[];
  console.warn(`[backfill] candidate hashes: ${KNOWN_TX_HASHES.length}, valid: ${validHashes.length}`);
  if (validHashes.length < KNOWN_TX_HASHES.length) {
    const skipped = KNOWN_TX_HASHES.filter((h) => !/^0x[a-fA-F0-9]{64}$/.test(h));
    console.warn(`[backfill] skipping malformed (truncated): ${skipped.join(', ')}`);
  }

  const rpcUrl = PUBLIC_RPCS[0]!;
  const client = createPublicClient({ chain: bsc, transport: http(rpcUrl) });
  console.warn(`[backfill] using RPC: ${rpcUrl}`);

  let inserted = 0;
  let skippedExisting = 0;
  let skippedNotSwap = 0;
  let skippedNoReceipt = 0;

  for (const hash of validHashes) {
    // Skip if a row already references this tx.
    const { data: existing } = await supabase
      .schema('neurodegen')
      .from('positions')
      .select('position_id')
      .eq('twak_tx_hash', hash.toLowerCase())
      .maybeSingle();
    if (existing) {
      console.warn(`[backfill] skip ${hash.slice(0, 14)} — already in DB`);
      skippedExisting++;
      continue;
    }

    const swap = await parseSwap(client, hash);
    if (!swap) {
      console.warn(`[backfill] skip ${hash.slice(0, 14)} — not a swap (no receipt or no Transfer pair)`);
      if (!swap) skippedNotSwap++;
      else skippedNoReceipt++;
      continue;
    }

    // Insert as MANAGED if `received` is a non-stable, CLOSED if it's a stable
    // (round-trip back to USDT/USDC implies the position was already closed).
    const isClosed = STABLE_RE.test(swap.received.symbol);
    const sentUSD = STABLE_USD(swap.sent.symbol) * swap.sent.amount; // 0 for non-stable inputs
    const receivedUSD = STABLE_USD(swap.received.symbol) * swap.received.amount;
    const sizeUSD = sentUSD > 0 ? sentUSD : receivedUSD > 0 ? receivedUSD : 0;
    const entryPrice =
      swap.received.amount > 0 && sizeUSD > 0 ? sizeUSD / swap.received.amount : 0;

    const row = {
      position_id: crypto.randomUUID(),
      session_id: null, // probe / external
      token_symbol: swap.received.symbol,
      token_address: getAddress(swap.received.contract),
      direction: 'spot',
      size_usd: sizeUSD,
      leverage: 1,
      entry_price_usd: entryPrice,
      tp_price_usd: null,
      sl_price_usd: null,
      twak_tx_hash: hash.toLowerCase(),
      attestation_commit_tx: null,
      attestation_reveal_tx: null,
      status: isClosed ? 'CLOSED' : 'MANAGED',
      exit_price_usd: isClosed ? entryPrice : null,
      pnl_usd: isClosed ? 0 : null,
      pnl_pct: isClosed ? 0 : null,
      exit_reason: isClosed ? 'probe_trade_unwind' : null,
      opened_at: new Date(swap.timestamp).toISOString(),
      closed_at: isClosed ? new Date(swap.timestamp).toISOString() : null,
    };

    const { error: insertErr } = await supabase
      .schema('neurodegen')
      .from('positions')
      .insert(row);
    if (insertErr) {
      console.error(`[backfill] insert FAILED for ${hash.slice(0, 14)}: ${insertErr.message}`);
      continue;
    }
    console.warn(
      `[backfill] inserted ${hash.slice(0, 14)} | ${swap.sent.amount.toFixed(4)} ${swap.sent.symbol} -> ${swap.received.amount.toFixed(4)} ${swap.received.symbol} | block ${swap.blockNumber} | ${isClosed ? 'CLOSED' : 'MANAGED'}`,
    );
    inserted++;
  }

  console.warn(
    `[backfill] DONE. inserted=${inserted} skipped_existing=${skippedExisting} skipped_not_swap=${skippedNotSwap} skipped_no_receipt=${skippedNoReceipt}`,
  );
}

void main().catch((err) => {
  console.error('[backfill] fatal:', err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
