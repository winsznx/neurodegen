import { NextResponse } from 'next/server';
import { fetchAgentSwaps } from '@/lib/clients/bscScanActivity';
import { logsPublicClient } from '@/lib/clients/chain';

export const dynamic = 'force-dynamic';

const AGENT = (process.env.TWAK_AGENT_WALLET_ADDRESS ??
  '0x1a59eD9BB4890a8ac02746BFC00EDeCBBBe375fF') as `0x${string}`;

/**
 * Debug-only endpoint. Surfaces:
 * - Which RPC URL the logs client is currently bound to (sanitized)
 * - Whether eth_blockNumber works against it
 * - What fetchAgentSwaps returns (count + first 3 entries) + any error
 *
 * Remove once /journal is confirmed stable.
 */
export async function GET(): Promise<Response> {
  const result: Record<string, unknown> = { agent: AGENT };

  try {
    const transport = (logsPublicClient.transport as unknown as { url?: string }).url;
    result.rpcUrl = transport ? sanitize(transport) : 'unknown';
  } catch {
    result.rpcUrl = 'introspection-failed';
  }

  try {
    const block = await logsPublicClient.getBlockNumber();
    result.eth_blockNumber = block.toString();
  } catch (err) {
    result.eth_blockNumber_error = err instanceof Error ? err.message : String(err);
  }

  for (const lookback of [10000, 28800, 86400] as const) {
    try {
      const swaps = await fetchAgentSwaps(AGENT, { limit: 5, lookbackBlocks: lookback });
      result[`lookback_${lookback}`] = {
        count: swaps.length,
        first: swaps.slice(0, 2),
      };
    } catch (err) {
      result[`lookback_${lookback}_error`] = err instanceof Error ? err.message : String(err);
    }
  }

  return NextResponse.json(result);
}

function sanitize(url: string): string {
  // Truncate API keys from URL path
  return url.replace(/\/[a-f0-9]{32,}/g, '/<key>');
}
