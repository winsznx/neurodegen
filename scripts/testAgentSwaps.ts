import { fetchAgentSwaps } from '../src/lib/clients/bscScanActivity';

async function main(): Promise<void> {
  console.warn('=== testing fetchAgentSwaps ===');
  console.warn('BSC_LOGS_RPC_URL set?', Boolean(process.env.BSC_LOGS_RPC_URL));
  console.warn('BSC_RPC_URL set?', Boolean(process.env.BSC_RPC_URL));

  const agent = '0x1a59eD9BB4890a8ac02746BFC00EDeCBBBe375fF' as `0x${string}`;
  console.warn('agent:', agent);

  console.warn('\n--- 48h lookback (86400 blocks) ---');
  const swaps24 = await fetchAgentSwaps(agent, { limit: 10, lookbackBlocks: 86400 });
  console.warn(`got ${swaps24.length} swaps`);
  for (const s of swaps24.slice(0, 5)) {
    console.warn(
      `  ${new Date(s.timestamp).toISOString()} | ${s.probable.padEnd(7)} | ${s.sent?.amount.toFixed(4)} ${s.sent?.symbol} -> ${s.received?.amount.toFixed(4)} ${s.received?.symbol} | ${s.hash.slice(0, 14)}`,
    );
  }

  console.warn('\n--- 1h lookback ---');
  const swaps1 = await fetchAgentSwaps(agent, { limit: 10, lookbackBlocks: 1200 });
  console.warn(`got ${swaps1.length} swaps`);
  for (const s of swaps1.slice(0, 5)) {
    console.warn(
      `  ${new Date(s.timestamp).toISOString()} | ${s.probable.padEnd(7)} | ${s.sent?.amount.toFixed(4)} ${s.sent?.symbol} -> ${s.received?.amount.toFixed(4)} ${s.received?.symbol} | ${s.hash.slice(0, 14)}`,
    );
  }
}

void main().catch((err) => {
  console.error('[test] fatal:', err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
