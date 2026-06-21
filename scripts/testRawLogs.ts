import { parseAbiItem } from 'viem';
import { logsPublicClient } from '../src/lib/clients/chain';

const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);

async function main(): Promise<void> {
  const agent = '0x1a59eD9BB4890a8ac02746BFC00EDeCBBBe375fF' as `0x${string}`;

  const latest = await logsPublicClient.getBlockNumber();
  console.warn('latest block:', latest);

  const fromBlock = latest - 1200n;

  console.warn('\n=== getLogs with args.from = agent ===');
  const out = await logsPublicClient
    .getLogs({
      event: TRANSFER_EVENT,
      args: { from: agent },
      fromBlock,
      toBlock: latest,
    })
    .catch((err) => {
      console.error('out error:', err.message);
      return [];
    });
  console.warn(`out logs: ${out.length}`);
  if (out.length > 0) {
    console.warn('first 2:', out.slice(0, 2));
  }

  console.warn('\n=== getLogs with args.to = agent ===');
  const inn = await logsPublicClient
    .getLogs({
      event: TRANSFER_EVENT,
      args: { to: agent },
      fromBlock,
      toBlock: latest,
    })
    .catch((err) => {
      console.error('in error:', err.message);
      return [];
    });
  console.warn(`in logs: ${inn.length}`);
  if (inn.length > 0) {
    console.warn('first 2:', inn.slice(0, 2));
  }
}

void main().catch((err) => {
  console.error('fatal:', err.stack);
  process.exit(1);
});
