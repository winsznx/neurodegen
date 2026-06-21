import Link from 'next/link';
import { fmtRel, bscScanTx, bscScanAddr } from '@/lib/format';
import { fetchAgentSwaps, type OnChainSwap } from '@/lib/clients/bscScanActivity';

interface OnChainActivityFeedProps {
  agentAddress: `0x${string}`;
  limit?: number;
  title?: string;
}

/**
 * Reusable on-chain activity table. Reads recent ERC-20 swap history for the
 * agent wallet DIRECTLY from BSC RPC via viem getLogs — no database join, no
 * BscScan API key needed. Source of truth is the chain itself.
 *
 * The fetcher (src/lib/clients/bscScanActivity.ts) paginates over ~24h of
 * blocks using NodeReal's public-demo BSC endpoint (verified Workflow probe
 * on 2026-06-27). Soft-fails to an empty state on RPC errors.
 */
export async function OnChainActivityFeed({
  agentAddress,
  limit = 25,
  title,
}: OnChainActivityFeedProps): Promise<React.ReactElement> {
  let swaps: OnChainSwap[] = [];
  try {
    swaps = await fetchAgentSwaps(agentAddress, { limit });
  } catch {
    /* render empty state */
  }

  return (
    <div>
      <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-text-tertiary">
        {title ?? 'on-chain activity · live via BSC RPC'}
      </h2>
      {swaps.length === 0 ? (
        <div className="mt-3 rounded-md border border-border bg-surface p-4">
          <p className="font-mono text-[12px] text-text-tertiary">
            No swaps in the last ~24h for{' '}
            <a
              href={bscScanAddr(agentAddress)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              {agentAddress.slice(0, 8)}…{agentAddress.slice(-6)}
            </a>
            . Daily probe fires at 00:00 UTC; full lifetime activity on BscScan.
          </p>
        </div>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-180 border-separate border-spacing-0 text-left font-mono text-[12px]">
            <thead className="text-text-tertiary">
              <tr>
                <th className="border-b border-border py-2 pr-4">When</th>
                <th className="border-b border-border py-2 pr-4">Type</th>
                <th className="border-b border-border py-2 pr-4">Sent</th>
                <th className="border-b border-border py-2 pr-4">Received</th>
                <th className="border-b border-border py-2 pr-4">Block</th>
                <th className="border-b border-border py-2 pr-4">Tx</th>
              </tr>
            </thead>
            <tbody>
              {swaps.map((s) => (
                <tr key={s.hash}>
                  <td className="border-b border-border/40 py-2 pr-4 text-text-secondary">
                    {fmtRel(s.timestamp)}
                  </td>
                  <td className="border-b border-border/40 py-2 pr-4">
                    <span
                      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] ${
                        s.probable === 'forward'
                          ? 'bg-accent/15 text-accent'
                          : s.probable === 'reverse'
                            ? 'bg-positive/15 text-positive'
                            : 'bg-border text-text-tertiary'
                      }`}
                    >
                      {s.probable}
                    </span>
                  </td>
                  <td className="border-b border-border/40 py-2 pr-4">
                    {s.sent ? `${s.sent.amount.toFixed(4)} ${s.sent.symbol}` : '—'}
                  </td>
                  <td className="border-b border-border/40 py-2 pr-4 text-text-primary">
                    {s.received ? `${s.received.amount.toFixed(4)} ${s.received.symbol}` : '—'}
                  </td>
                  <td className="border-b border-border/40 py-2 pr-4 text-text-tertiary">
                    {s.blockNumber.toLocaleString()}
                  </td>
                  <td className="border-b border-border/40 py-2 pr-4">
                    <a
                      href={bscScanTx(s.hash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:underline"
                    >
                      {s.hash.slice(0, 10)}…
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 font-mono text-[10px] text-text-tertiary">
            Showing {swaps.length} recent swap{swaps.length === 1 ? '' : 's'}. Full lifetime
            history on{' '}
            <a
              href={bscScanAddr(agentAddress)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              BscScan
            </a>
            .{' '}
            <Link href="/journal" className="text-accent hover:underline">
              Open full journal
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
