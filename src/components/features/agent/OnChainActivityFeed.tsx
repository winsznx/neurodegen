import Link from 'next/link';
import { fmtRel, bscScanTx, bscScanAddr } from '@/lib/format';
import { getPositionHistory } from '@/lib/queries/positions';

interface OnChainActivityFeedProps {
  agentAddress: `0x${string}`;
  limit?: number;
  /** Optional title override; defaults to 'on-chain activity · positions ledger'. */
  title?: string;
}

/**
 * Reusable on-chain activity table. Reads from the positions table (DB) so
 * we don't depend on a third-party RPC's getLogs (BscScan v1 dead, v2
 * paid for BSC; free public RPCs require API key for archive queries).
 *
 * Positions schema covers ALL agent trades:
 *  - sessionId UUID → committee-driven open (from sessionGraphBuilder)
 *  - sessionId null → probe-trade scheduler (Q.1 fix)
 * Both have a `twak_tx_hash` we link to BscScan.
 */
export async function OnChainActivityFeed({
  agentAddress,
  limit = 25,
  title,
}: OnChainActivityFeedProps): Promise<React.ReactElement> {
  const positions = await getPositionHistory(Math.max(limit * 2, 50)).catch(() => []);
  // Newest first.
  const sorted = [...positions].sort((a, b) => {
    return new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime();
  });
  const rows = sorted.slice(0, limit);

  return (
    <div>
      <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-text-tertiary">
        {title ?? 'on-chain activity · positions ledger'}
      </h2>
      {rows.length === 0 ? (
        <div className="mt-3 rounded-md border border-border bg-surface p-4">
          <p className="font-mono text-[12px] text-text-tertiary">
            No positions recorded yet for{' '}
            <a
              href={bscScanAddr(agentAddress)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              {agentAddress.slice(0, 8)}…{agentAddress.slice(-6)}
            </a>
            . Daily probe fires at 00:00 UTC; full activity on BscScan.
          </p>
        </div>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-180 border-separate border-spacing-0 text-left font-mono text-[12px]">
            <thead className="text-text-tertiary">
              <tr>
                <th className="border-b border-border py-2 pr-4">When</th>
                <th className="border-b border-border py-2 pr-4">Source</th>
                <th className="border-b border-border py-2 pr-4">Token</th>
                <th className="border-b border-border py-2 pr-4">Size</th>
                <th className="border-b border-border py-2 pr-4">Entry</th>
                <th className="border-b border-border py-2 pr-4">Status</th>
                <th className="border-b border-border py-2 pr-4">PnL</th>
                <th className="border-b border-border py-2 pr-4">Tx</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const isProbe = p.sessionId === null || p.exitReason === 'probe_trade_unwind';
                const isClosed = p.status === 'CLOSED';
                const pnlClass =
                  p.pnlPct == null
                    ? 'text-text-tertiary'
                    : p.pnlPct >= 0
                      ? 'text-positive'
                      : 'text-red-400';
                return (
                  <tr key={p.positionId}>
                    <td className="border-b border-border/40 py-2 pr-4 text-text-secondary">
                      {fmtRel(p.openedAt)}
                    </td>
                    <td className="border-b border-border/40 py-2 pr-4">
                      <span
                        className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] ${
                          isProbe
                            ? 'bg-border text-text-tertiary'
                            : 'bg-accent/15 text-accent'
                        }`}
                      >
                        {isProbe ? 'probe' : 'committee'}
                      </span>
                    </td>
                    <td className="border-b border-border/40 py-2 pr-4 text-text-primary">
                      {p.tokenSymbol}
                    </td>
                    <td className="border-b border-border/40 py-2 pr-4">
                      ${p.sizeUSD.toFixed(2)}
                    </td>
                    <td className="border-b border-border/40 py-2 pr-4 text-text-tertiary">
                      ${p.entryPriceUSD.toFixed(p.entryPriceUSD < 1 ? 4 : 2)}
                    </td>
                    <td className="border-b border-border/40 py-2 pr-4">
                      <span
                        className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] ${
                          isClosed ? 'bg-positive/15 text-positive' : 'bg-accent/15 text-accent'
                        }`}
                      >
                        {p.status.toLowerCase()}
                      </span>
                    </td>
                    <td className={`border-b border-border/40 py-2 pr-4 ${pnlClass}`}>
                      {p.pnlPct == null
                        ? '—'
                        : `${p.pnlPct >= 0 ? '+' : ''}${(p.pnlPct * 100).toFixed(2)}%`}
                    </td>
                    <td className="border-b border-border/40 py-2 pr-4">
                      {p.twakTxHash ? (
                        <a
                          href={bscScanTx(p.twakTxHash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent hover:underline"
                        >
                          {p.twakTxHash.slice(0, 10)}…
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 font-mono text-[10px] text-text-tertiary">
            Showing {rows.length} of {positions.length} recent positions. Full activity at{' '}
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
