import Link from 'next/link';
import { Shell } from '@/components/layout/Shell';
import { getRecentSessions } from '@/lib/queries/sessions';
import { getPositionHistory } from '@/lib/queries/positions';
import { fmtRel, fmtPct, bscScanTx } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const revalidate = 30;

interface FetchResult {
  ok: boolean;
  sessions: Awaited<ReturnType<typeof getRecentSessions>>;
  positions: Awaited<ReturnType<typeof getPositionHistory>>;
  errorMessage: string | null;
}

async function fetchJournal(): Promise<FetchResult> {
  try {
    const [sessions, positions] = await Promise.all([
      getRecentSessions(50),
      getPositionHistory(100),
    ]);
    return { ok: true, sessions, positions, errorMessage: null };
  } catch (err) {
    return {
      ok: false,
      sessions: [],
      positions: [],
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }
}

export default async function JournalPage() {
  const result = await fetchJournal();
  const positionBySession = new Map(result.positions.map((p) => [p.sessionId, p]));

  return (
    <Shell>
      <section className="mx-auto max-w-6xl px-6 py-10">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-tertiary">
          journal
        </p>
        <h1 className="mt-2 font-display text-3xl text-text-primary">Every session, every trade.</h1>
        <p className="mt-3 max-w-2xl text-text-secondary">
          Public ledger of all committee sessions. PnL is computed against the
          actual TWAK swap tx hash recorded in BSC.
        </p>

        {!result.ok ? (
          <div className="mt-10 rounded-md border border-red-500/30 bg-red-500/5 p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-red-400">
              load failed
            </p>
            <p className="mt-2 text-text-primary">
              We&apos;re having trouble loading the session log. Try again in a few seconds.
            </p>
            {result.errorMessage ? (
              <p className="mt-2 font-mono text-[10px] text-text-tertiary">{result.errorMessage}</p>
            ) : null}
          </div>
        ) : result.sessions.length === 0 ? (
          <div className="mt-10 rounded-md border border-border bg-surface p-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-tertiary">
              empty
            </p>
            <p className="mt-2 text-text-primary">
              No sessions recorded yet. Once the agent starts, every committee
              deliberation lands here within seconds.
            </p>
            <Link
              href="/agent"
              className="mt-4 inline-flex items-center rounded-md bg-accent px-3 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
            >
              Watch the live committee
            </Link>
          </div>
        ) : (
          <div className="mt-10 overflow-x-auto">
            <table className="w-full min-w-180 border-separate border-spacing-0 text-left font-mono text-[12px]">
              <thead className="text-text-tertiary">
                <tr>
                  <th className="border-b border-border py-2 pr-4">#</th>
                  <th className="border-b border-border py-2 pr-4">When</th>
                  <th className="border-b border-border py-2 pr-4">Regime</th>
                  <th className="border-b border-border py-2 pr-4">Action</th>
                  <th className="border-b border-border py-2 pr-4">Token</th>
                  <th className="border-b border-border py-2 pr-4">Dissent</th>
                  <th className="border-b border-border py-2 pr-4">PnL</th>
                  <th className="border-b border-border py-2 pr-4">Tx</th>
                </tr>
              </thead>
              <tbody>
                {result.sessions.map((s) => {
                  const p = positionBySession.get(s.sessionId);
                  return (
                    <tr key={s.sessionId}>
                      <td className="border-b border-border/40 py-2 pr-4">
                        <Link href={`/session/${s.sessionId}`} className="text-accent hover:underline">
                          #{s.sessionNumber}
                        </Link>
                      </td>
                      <td className="border-b border-border/40 py-2 pr-4 text-text-secondary">
                        {fmtRel(s.createdAt)}
                      </td>
                      <td className="border-b border-border/40 py-2 pr-4">{s.regime}</td>
                      <td className="border-b border-border/40 py-2 pr-4">{s.finalAction.action}</td>
                      <td className="border-b border-border/40 py-2 pr-4">{s.finalAction.tokenSymbol ?? '-'}</td>
                      <td className="border-b border-border/40 py-2 pr-4">
                        {s.dissentResult.dissentDetected ? 'yes' : '-'}
                      </td>
                      <td className={`border-b border-border/40 py-2 pr-4 ${p?.pnlPct == null ? '' : p.pnlPct >= 0 ? 'text-positive' : 'text-red-400'}`}>
                        {p?.pnlPct == null ? '-' : fmtPct(p.pnlPct, { signed: true })}
                      </td>
                      <td className="border-b border-border/40 py-2 pr-4">
                        {p?.twakTxHash ? (
                          <a
                            href={bscScanTx(p.twakTxHash)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-accent hover:underline"
                          >
                            BscScan
                          </a>
                        ) : (
                          '-'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </Shell>
  );
}
