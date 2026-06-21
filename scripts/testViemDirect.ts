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

  // Known good tx block 0x65beb6f = 106893167
  const knownBlock = 0x65beb6fn;
  const fromBlock = knownBlock - 100n;
  const toBlock = knownBlock + 100n;
  console.warn('test range:', fromBlock, '-', toBlock, '(200 blocks around known activity)');

  console.warn('\n=== viem with args.from ===');
  try {
    const logs = await client.getLogs({
      event: TRANSFER_EVENT,
      args: { from: AGENT },
      fromBlock,
      toBlock,
    });
    console.warn('count:', logs.length);
    for (const l of logs.slice(0, 3)) {
      console.warn(`  tx=${l.transactionHash} block=${l.blockNumber}`);
    }
  } catch (e) {
    console.error('viem args.from threw:', e instanceof Error ? e.message : String(e));
  }

  console.warn('\n=== viem with explicit topics (no args) ===');
  try {
    const topic1 = ('0x' + AGENT.slice(2).toLowerCase().padStart(64, '0')) as `0x${string}`;
    const logs = await client.getLogs({
      event: TRANSFER_EVENT,
      fromBlock,
      toBlock,
    });
    console.warn('count (no topic filter):', logs.length);
    const filtered = logs.filter((l) => (l.topics[1] ?? '').toLowerCase() === topic1.toLowerCase());
    console.warn('filtered count (manual):', filtered.length);
    for (const l of filtered.slice(0, 3)) {
      console.warn(`  tx=${l.transactionHash} from=${l.topics[1]}`);
    }
  } catch (e) {
    console.error('viem getLogs threw:', e instanceof Error ? e.message : String(e));
  }

  console.warn('\n=== raw RPC: same range with explicit padded topic1 ===');
  const padded = '0x' + AGENT.slice(2).toLowerCase().padStart(64, '0');
  const body = {
    jsonrpc: '2.0',
    method: 'eth_getLogs',
    params: [
      {
        fromBlock: '0x' + fromBlock.toString(16),
        toBlock: '0x' + toBlock.toString(16),
        topics: [
          '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
          padded,
        ],
      },
    ],
    id: 1,
  };
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { result?: unknown[]; error?: { message: string } };
  console.warn('raw count:', json.result?.length ?? 0);
  console.warn('raw error:', json.error?.message ?? 'none');
  console.warn('first result:', JSON.stringify(json.result?.[0], null, 2)?.slice(0, 400));
}

main().catch((e) => console.error('FATAL:', e));
