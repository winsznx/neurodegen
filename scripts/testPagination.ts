import { createPublicClient, http, parseAbiItem } from 'viem';
import { bsc } from 'viem/chains';

const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);
const RPC = 'https://bsc-mainnet.nodereal.io/v1/64a9df0874fb4a93b9d0a3849de012d3';
const AGENT = '0x1a59eD9BB4890a8ac02746BFC00EDeCBBBe375fF' as `0x${string}`;

async function main() {
  const client = createPublicClient({ chain: bsc, transport: http(RPC) });
  const latest = await client.getBlockNumber();
  console.warn('latest:', latest);
  const lookback = 28800n;
  const fromBlock = latest - lookback;
  console.warn('from:', fromBlock, 'to:', latest, '(28800 blocks)');

  const chunkSize = 10000n;
  const chunks: { from: bigint; to: bigint }[] = [];
  for (let from = fromBlock; from <= latest; from += chunkSize + 1n) {
    const to = from + chunkSize > latest ? latest : from + chunkSize;
    chunks.push({ from, to });
  }
  console.warn(`built ${chunks.length} chunks`);
  for (const c of chunks) console.warn(`  [${c.from}, ${c.to}] = ${c.to - c.from + 1n} blocks`);

  console.warn('\n--- sequential test ---');
  for (const c of chunks) {
    const t0 = Date.now();
    try {
      const logs = await client.getLogs({
        event: TRANSFER_EVENT,
        args: { from: AGENT },
        fromBlock: c.from,
        toBlock: c.to,
      });
      console.warn(`  chunk [${c.from},${c.to}]: ${logs.length} logs (${Date.now() - t0}ms)`);
      for (const l of logs.slice(0, 2)) {
        console.warn(`    tx=${l.transactionHash.slice(0, 14)} block=${l.blockNumber}`);
      }
    } catch (e) {
      console.error(`  chunk [${c.from},${c.to}] ERROR:`, e instanceof Error ? e.message.slice(0, 150) : String(e));
    }
  }

  console.warn('\n--- parallel (6 concurrent calls) ---');
  const t0 = Date.now();
  const all = await Promise.all(
    chunks.flatMap((c) => [
      client.getLogs({ event: TRANSFER_EVENT, args: { from: AGENT }, fromBlock: c.from, toBlock: c.to })
        .then((r) => ({ kind: 'from', chunk: c, count: r.length }))
        .catch((e) => ({ kind: 'from', chunk: c, error: String(e).slice(0, 120) })),
      client.getLogs({ event: TRANSFER_EVENT, args: { to: AGENT }, fromBlock: c.from, toBlock: c.to })
        .then((r) => ({ kind: 'to', chunk: c, count: r.length }))
        .catch((e) => ({ kind: 'to', chunk: c, error: String(e).slice(0, 120) })),
    ]),
  );
  console.warn(`parallel done in ${Date.now() - t0}ms`);
  for (const r of all) console.warn(`  ${JSON.stringify(r).slice(0, 200)}`);
}

main().catch((e) => console.error('FATAL:', e));
