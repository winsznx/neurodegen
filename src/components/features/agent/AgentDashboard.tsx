'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAgentStatus } from '@/hooks/useAgentStatus';

interface JournalEntry {
  sessionId: string;
  sessionNumber: number;
  createdAt: number;
  regime: string;
  action: string;
  tokenSymbol: string | null;
  committeeConviction: string;
  dissentDetected: boolean;
  pnlPct: number | null;
  bscscanUrl: string | null;
}

export function AgentDashboard() {
  const status = useAgentStatus();
  const [entries, setEntries] = useState<JournalEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/journal?limit=20');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { entries: JournalEntry[] };
        if (!cancelled) {
          setEntries(json.entries);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    }
    void load();
    const interval = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const regime = status.data?.regime ?? 'unknown';
  const cycles = status.data?.cycleCount ?? 0;
  const running = status.data?.status === 'running';

  const drawdownPct = useMemo(() => {
    const d = (status.data as unknown as { drawdownPct?: number } | null)?.drawdownPct ?? 0;
    return `${(d * 100).toFixed(2)}%`;
  }, [status.data]);

  return (
    <div className="mt-8 space-y-8">
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Regime" value={regime} sub={running ? 'live' : 'idle'} />
        <StatCard label="Cycles" value={String(cycles)} sub="committee runs" />
        <StatCard label="Drawdown" value={drawdownPct} sub="from peak equity" />
        <StatCard
          label="Open positions"
          value={String((status.data as unknown as { openPositionCount?: number } | null)?.openPositionCount ?? 0)}
          sub="across allowlist"
        />
      </div>
      <div>
        <h2 className="font-display text-lg text-text-primary">Recent sessions</h2>
        {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
        {!entries ? (
          <p className="mt-4 font-mono text-[12px] text-text-tertiary">loading…</p>
        ) : entries.length === 0 ? (
          <p className="mt-4 font-mono text-[12px] text-text-tertiary">no sessions yet</p>
        ) : (
          <ul className="mt-4 divide-y divide-border rounded-md border border-border">
            {entries.map((e) => (
              <li key={e.sessionId} className="flex items-center justify-between px-4 py-3">
                <div className="flex flex-col">
                  <Link
                    href={`/session/${e.sessionId}`}
                    className="font-mono text-[12px] text-text-primary hover:text-accent"
                  >
                    #{e.sessionNumber} · {e.action} · {e.tokenSymbol ?? '—'}
                  </Link>
                  <span className="font-mono text-[10px] text-text-tertiary">
                    regime {e.regime} · {e.committeeConviction} conviction
                    {e.dissentDetected ? ' · dissent' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-4 font-mono text-[12px] text-text-secondary">
                  <span>{e.pnlPct === null ? '—' : `${(e.pnlPct * 100).toFixed(2)}%`}</span>
                  {e.bscscanUrl ? (
                    <a
                      href={e.bscscanUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:underline"
                    >
                      BscScan
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-md border border-border bg-surface p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-tertiary">{label}</p>
      <p className="mt-1 font-display text-2xl text-text-primary">{value}</p>
      <p className="mt-1 font-mono text-[10px] text-text-tertiary">{sub}</p>
    </div>
  );
}
