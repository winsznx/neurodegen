import Link from 'next/link';
import { Shell } from '@/components/layout/Shell';
import { getRecentSessions } from '@/lib/queries/sessions';
import { getPositionHistory } from '@/lib/queries/positions';

export const dynamic = 'force-dynamic';
export const revalidate = 30;

export default async function JournalPage() {
  const [sessions, positions] = await Promise.all([
    getRecentSessions(50).catch(() => []),
    getPositionHistory(100).catch(() => []),
  ]);
  const positionBySession = new Map(positions.map((p) => [p.sessionId, p]));

  return (
    <Shell>
      <section className="mx-auto max-w-6xl px-6 py-10">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-tertiary">
          journal
        </p>
        <h1 className="mt-2 font-display text-3xl text-text-primary">Every session, every trade.</h1>
        <p className="mt-3 max-w-2xl text-text-secondary">
          Public ledger of all committee sessions. PnL is computed against the
          actual TWAK swap tx hash recorded in BSC. Filter by clicking a column
          header (coming in V2.1).
        </p>
        {sessions.length === 0 ? (
          <p className="mt-10 font-mono text-[12px] text-text-tertiary">
            No sessions recorded yet. Once the agent starts, every committee
            deliberation lands here.
          </p>
        ) : (
          <table className="mt-10 w-full border-separate border-spacing-0 text-left font-mono text-[12px]">
            <thead className="text-text-tertiary">
              <tr>
                <th className="border-b border-border py-2 pr-4">#</th>
                <th className="border-b border-border py-2 pr-4">When</th>
                <th className="border-b border-border py-2 pr-4">Regime</th>
                <th className="border-b border-border py-2 pr-4">Action</th>
                <th className="border-b border-border py-2 pr-4">Token</th>
                <th className="border-b border-border py-2 pr-4">Dissent</th>
                <th className="border-b border-border py-2 pr-4">PnL%</th>
                <th className="border-b border-border py-2 pr-4">Tx</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => {
                const p = positionBySession.get(s.sessionId);
                const dt = new Date(s.createdAt);
                return (
                  <tr key={s.sessionId}>
                    <td className="border-b border-border/40 py-2 pr-4">
                      <Link href={`/session/${s.sessionId}`} className="text-accent hover:underline">
                        #{s.sessionNumber}
                      </Link>
                    </td>
                    <td className="border-b border-border/40 py-2 pr-4 text-text-secondary">
                      {dt.toISOString().slice(0, 16).replace('T', ' ')}
                    </td>
                    <td className="border-b border-border/40 py-2 pr-4">{s.regime}</td>
                    <td className="border-b border-border/40 py-2 pr-4">{s.finalAction.action}</td>
                    <td className="border-b border-border/40 py-2 pr-4">{s.finalAction.tokenSymbol ?? '—'}</td>
                    <td className="border-b border-border/40 py-2 pr-4">{s.dissentResult.dissentDetected ? 'yes' : '—'}</td>
                    <td className="border-b border-border/40 py-2 pr-4">{p?.pnlPct == null ? '—' : `${(p.pnlPct * 100).toFixed(2)}%`}</td>
                    <td className="border-b border-border/40 py-2 pr-4">
                      {p?.twakTxHash ? (
                        <a
                          href={`https://bscscan.com/tx/${p.twakTxHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent hover:underline"
                        >
                          BscScan
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
        )}
      </section>
    </Shell>
  );
}
