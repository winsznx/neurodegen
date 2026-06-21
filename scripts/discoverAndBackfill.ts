/**
 * Discover ALL historical agent swap tx hashes via NodeReal RPC (10k-block
 * chunked getLogs), then backfill them into the positions table.
 *
 * Run:
 *   railway run --service neurodegen -- pnpm exec tsx scripts/discoverAndBackfill.ts
 */
import { createClient } from '@supabase/supabase-js';
import { createPublicClient, http, parseAbiItem, getAddress } from 'viem';
import { bsc } from 'viem/chains';

const NODEREAL = 'https://bsc-mainnet.nodereal.io/v1/64a9df0874fb4a93b9d0a3849de012d3';
const PUBLIC_RECEIPT_RPC = 'https://bsc-dataseed.binance.org';

const AGENT = ((process.env.TWAK_AGENT_WALLET_ADDRESS ??
  '0x1a59eD9BB4890a8ac02746BFC00EDeCBBBe375fF') as string).toLowerCase() as `0x${string}`;

const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);
const ERC20_ABI = [
  parseAbiItem('function symbol() view returns (string)'),
  parseAbiItem('function decimals() view returns (uint8)'),
] as const;

const STABLE_RE = /^(USDT|USDC|BUSD|DAI|FDUSD|TUSD|FRAX|USDD|USDe|USD1|USDF|USDf)$/i;
const STABLE_USD = (s: string) => (STABLE_RE.test(s) ? 1 : 0);

async function main(): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing.');
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, supabaseKey);
  const noderealClient = createPublicClient({ chain: bsc, transport: http(NODEREAL) });
  const receiptClient = createPublicClient({ chain: bsc, transport: http(PUBLIC_RECEIPT_RPC) });

  const latest = await noderealClient.getBlockNumber();
  // Look back ~7 days (302400 blocks at 2s blocks). Comp started 6/22.
  const fromBlock = latest - 302400n;
  console.warn(`[discover] scanning blocks [${fromBlock}, ${latest}] (~7d)`);

  // Chunk in 10k-block windows (NodeReal-safe).
  const chunkSize = 10000n;
  const chunks: { from: bigint; to: bigint }[] = [];
  for (let from = fromBlock; from <= latest; from += chunkSize + 1n) {
    chunks.push({ from, to: from + chunkSize > latest ? latest : from + chunkSize });
  }
  console.warn(`[discover] ${chunks.length} chunks`);

  // For each chunk × {from, to} fetch logs in parallel.
  const allLogs = (
    await Promise.all(
      chunks.flatMap((c) => [
        noderealClient
          .getLogs({
            event: TRANSFER_EVENT,
            args: { from: AGENT },
            fromBlock: c.from,
            toBlock: c.to,
          })
          .catch(() => []),
        noderealClient
          .getLogs({
            event: TRANSFER_EVENT,
            args: { to: AGENT },
            fromBlock: c.from,
            toBlock: c.to,
          })
          .catch(() => []),
      ]),
    )
  ).flat();
  console.warn(`[discover] raw logs: ${allLogs.length}`);

  // Unique tx hashes that involved the agent.
  const txHashes = new Set<`0x${string}`>();
  for (const log of allLogs) txHashes.add(log.transactionHash as `0x${string}`);
  console.warn(`[discover] unique txs involving agent: ${txHashes.size}`);

  // For each tx hash: fetch receipt, parse Transfer events, find swap pair.
  const metaCache = new Map<string, { symbol: string; decimals: number }>();
  async function getMeta(addr: `0x${string}`) {
    const cached = metaCache.get(addr.toLowerCase());
    if (cached) return cached;
    try {
      const [symbol, decimals] = await Promise.all([
        receiptClient.readContract({ address: addr, abi: ERC20_ABI, functionName: 'symbol' }),
        receiptClient.readContract({ address: addr, abi: ERC20_ABI, functionName: 'decimals' }),
      ]);
      const meta = { symbol: String(symbol), decimals: Number(decimals) };
      metaCache.set(addr.toLowerCase(), meta);
      return meta;
    } catch {
      return { symbol: addr.slice(0, 8), decimals: 18 };
    }
  }

  let inserted = 0;
  let skippedExisting = 0;
  let skippedNotSwap = 0;
  let failures = 0;

  for (const hash of txHashes) {
    // Idempotency check.
    const { data: existing } = await supabase
      .schema('neurodegen')
      .from('positions')
      .select('position_id')
      .eq('twak_tx_hash', hash.toLowerCase())
      .maybeSingle();
    if (existing) {
      skippedExisting++;
      continue;
    }

    const receipt = await receiptClient.getTransactionReceipt({ hash }).catch(() => null);
    if (!receipt || receipt.status !== 'success') {
      skippedNotSwap++;
      continue;
    }
    const block = await receiptClient.getBlock({ blockNumber: receipt.blockNumber }).catch(() => null);
    const timestamp = block ? Number(block.timestamp) * 1000 : 0;

    let sent: { symbol: string; amount: number; contract: `0x${string}` } | null = null;
    let received: { symbol: string; amount: number; contract: `0x${string}` } | null = null;
    for (const log of receipt.logs) {
      try {
        if (log.topics[0] !== '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef') continue;
        if (!log.topics[1] || !log.topics[2]) continue;
        const from = ('0x' + log.topics[1].slice(26)).toLowerCase();
        const to = ('0x' + log.topics[2].slice(26)).toLowerCase();
        const meta = await getMeta(log.address);
        const value = BigInt(log.data);
        const amount = Number(value) / 10 ** meta.decimals;
        if (from === AGENT && to !== AGENT && !sent) {
          sent = { symbol: meta.symbol, amount, contract: log.address };
        } else if (to === AGENT && from !== AGENT && !received) {
          received = { symbol: meta.symbol, amount, contract: log.address };
        }
      } catch {
        /* skip */
      }
    }

    if (!sent || !received || sent.contract.toLowerCase() === received.contract.toLowerCase()) {
      skippedNotSwap++;
      continue;
    }

    const isClosed = STABLE_RE.test(received.symbol);
    const sentUSD = STABLE_USD(sent.symbol) * sent.amount;
    const recvUSD = STABLE_USD(received.symbol) * received.amount;
    const sizeUSD = sentUSD > 0 ? sentUSD : recvUSD > 0 ? recvUSD : 0;
    const entryPrice = received.amount > 0 && sizeUSD > 0 ? sizeUSD / received.amount : 0;

    const { error: insertErr } = await supabase.schema('neurodegen').from('positions').insert({
      position_id: crypto.randomUUID(),
      session_id: null,
      token_symbol: received.symbol,
      token_address: getAddress(received.contract),
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
      opened_at: new Date(timestamp).toISOString(),
      closed_at: isClosed ? new Date(timestamp).toISOString() : null,
    });
    if (insertErr) {
      console.error(`[discover] insert FAILED for ${hash.slice(0, 14)}: ${insertErr.message}`);
      failures++;
      continue;
    }
    console.warn(
      `[discover] inserted ${hash.slice(0, 14)} | ${sent.amount.toFixed(4)} ${sent.symbol} -> ${received.amount.toFixed(4)} ${received.symbol} | block ${receipt.blockNumber}`,
    );
    inserted++;
  }

  console.warn(
    `[discover] DONE. inserted=${inserted} skipped_existing=${skippedExisting} skipped_not_swap=${skippedNotSwap} failures=${failures}`,
  );
}

void main().catch((err) => {
  console.error('[discover] fatal:', err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
