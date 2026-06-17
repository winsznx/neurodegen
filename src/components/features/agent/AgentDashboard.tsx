'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAgentStatus } from '@/hooks/useAgentStatus';
import { useSSE } from '@/hooks/useSSE';
import { PositionExplainerModal } from './PositionExplainerModal';
import { RegimeIndicator } from './RegimeIndicator';
import { DrawdownGauge } from './DrawdownGauge';

interface JournalEntry {
  sessionId: string;
  sessionNumber: number;
  createdAt: number;
  regime: string;
  action: string;
  tokenSymbol: string | null;
  committeeConviction: 'LOW' | 'MEDIUM' | 'HIGH';
  dissentDetected: boolean;
  pnlPct: number | null;
  bscscanUrl: string | null;
}

interface SessionDelta {
  sessionId: string;
  sessionNumber: number;
  regime: string;
  action: string;
  tokenSymbol: string | null;
  dissentDetected: boolean;
  plainLanguageExplanation: string;
  receivedAt: number;
}

export function AgentDashboard() {
  const status = useAgentStatus();
  const [entries, setEntries] = useState<JournalEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liveSessions, setLiveSessions] = useState<SessionDelta[]>([]);
  const [regimeFlash, setRegimeFlash] = useState<{ from: string; to: string } | null>(null);
  const [explainerSessionId, setExplainerSessionId] = useState<string | null>(null);

  // Initial load + light periodic backfill (every 60s in case SSE drops).
  const loadJournal = useCallback(async () => {
    try {
      const res = await fetch('/api/journal?limit=20');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { entries: JournalEntry[] };
      setEntries(json.entries);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void loadJournal();
    const interval = setInterval(loadJournal, 60_000);
    return () => clearInterval(interval);
  }, [loadJournal]);

  // V1 audit + V2 Phase 1 audit M1 fix: subscribe to /api/events/stream
  // instead of 15s polling. Committee + regime + position events update
  // the dashboard live.
  const handlers = useMemo(
    () => ({
      committee_session_complete: (e: MessageEvent) => {
        try {
          const session = JSON.parse(e.data) as {
            sessionId: string;
            sessionNumber: number;
            regime: string;
            dissentResult: { dissentDetected: boolean };
            finalAction: {
              action: string;
              tokenSymbol: string | null;
              plainLanguageExplanation: string;
            };
          };
          setLiveSessions((prev) =>
            [
              {
                sessionId: session.sessionId,
                sessionNumber: session.sessionNumber,
                regime: session.regime,
                action: session.finalAction.action,
                tokenSymbol: session.finalAction.tokenSymbol,
                dissentDetected: session.dissentResult.dissentDetected,
                plainLanguageExplanation: session.finalAction.plainLanguageExplanation,
                receivedAt: Date.now(),
              },
              ...prev,
            ].slice(0, 5),
          );
          void loadJournal();
        } catch {
          // ignore malformed
        }
      },
      regime_change: (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data) as { from: string; to: string };
          setRegimeFlash(data);
          setTimeout(() => setRegimeFlash(null), 6_000);
        } catch {
          // ignore
        }
      },
      position_update: () => {
        void loadJournal();
      },
    }),
    [loadJournal],
  );

  const sse = useSSE('/api/events/stream', handlers);

  const regime = status.data?.regime ?? 'unknown';
  const cycles = status.data?.cycleCount ?? 0;
  const running = status.data?.status === 'running';

  const drawdownPct = (status.data as unknown as { drawdownPct?: number } | null)?.drawdownPct ?? 0;
  const openPositionCount =
    (status.data as unknown as { openPositionCount?: number } | null)?.openPositionCount ?? 0;
  const llmSpend =
    (status.data as unknown as { llmSpendDailyUSD?: number; llmSpendCeilingUSD?: number; llmKilled?: boolean } | null) ?? {
      llmSpendDailyUSD: 0,
      llmSpendCeilingUSD: 5,
      llmKilled: false,
    };
  const cacheHitRatio =
    (status.data as unknown as { llmCacheHitRatio?: number } | null)?.llmCacheHitRatio ?? 0;
  const skippedSame =
    (status.data as unknown as { cyclesSkippedSameMetrics?: number } | null)?.cyclesSkippedSameMetrics ??
    0;

  return (
    <div className="mt-8 space-y-8">
      {/* SSE connection pill */}
      <div className="flex items-center gap-2 font-mono text-[10px] text-text-tertiary">
        <span
          className={`size-1.5 rounded-full ${sse.connected ? 'bg-positive animate-blink' : 'bg-text-tertiary'}`}
        />
        {sse.connected ? 'live · SSE' : sse.error ?? 'connecting'}
        {sse.error ? <span className="text-red-400">· {sse.error}</span> : null}
      </div>

      {regimeFlash ? (
        <div className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 font-mono text-[12px] text-accent-soft">
          regime change: {regimeFlash.from} → {regimeFlash.to}
        </div>
      ) : null}

      {/* Stat grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <RegimeIndicator regime={regime} running={running} />
        <DrawdownGauge drawdownPct={drawdownPct} />
        <StatCard
          label="Cycles"
          value={String(cycles)}
          sub={`${skippedSame} skipped (same metrics)`}
        />
        <StatCard
          label="Open positions"
          value={String(openPositionCount)}
          sub="across allowlist"
        />
      </div>

      {/* LLM spend + cache observability */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="LLM spend today"
          value={`$${(llmSpend.llmSpendDailyUSD ?? 0).toFixed(2)}`}
          sub={`of $${(llmSpend.llmSpendCeilingUSD ?? 5).toFixed(2)} ceiling`}
          warn={llmSpend.llmKilled}
        />
        <StatCard
          label="Prompt cache hit"
          value={`${(cacheHitRatio * 100).toFixed(0)}%`}
          sub="canonical input hash"
        />
        <StatCard
          label="LLM kill switch"
          value={llmSpend.llmKilled ? 'ACTIVE' : 'idle'}
          sub="trips at daily ceiling"
          warn={llmSpend.llmKilled}
        />
      </div>

      {/* Live committee feed */}
      {liveSessions.length > 0 ? (
        <div className="rounded-md border border-accent/40 bg-surface p-4">
          <h2 className="font-display text-lg text-text-primary">Live committee feed</h2>
          <ul className="mt-3 space-y-2">
            {liveSessions.map((s) => {
              const age = Math.floor((Date.now() - s.receivedAt) / 1000);
              return (
                <li key={s.sessionId} className="flex items-start justify-between gap-3">
                  <div className="flex flex-col min-w-0">
                    <Link
                      href={`/session/${s.sessionId}`}
                      className="font-mono text-[12px] text-text-primary hover:text-accent"
                    >
                      #{s.sessionNumber} · {s.action} · {s.tokenSymbol ?? '—'}
                    </Link>
                    <span className="font-mono text-[10px] text-text-tertiary mt-1 line-clamp-2">
                      {s.plainLanguageExplanation}
                    </span>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <button
                      onClick={() => setExplainerSessionId(s.sessionId)}
                      className="font-mono text-[10px] text-accent hover:underline"
                    >
                      Why?
                    </button>
                    <span className="font-mono text-[9px] text-text-tertiary">{age}s ago</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div>
        <h2 className="font-display text-lg text-text-primary">Recent sessions</h2>
        {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
        {!entries ? (
          <p className="mt-4 font-mono text-[12px] text-text-tertiary">loading…</p>
        ) : entries.length === 0 ? (
          <div className="mt-4 rounded-md border border-border bg-surface p-6 text-center">
            <p className="font-mono text-[12px] text-text-tertiary">
              No sessions yet. Once the agent runs its first non-quiet cycle, every committee
              deliberation lands here.
            </p>
          </div>
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
                  <button
                    onClick={() => setExplainerSessionId(e.sessionId)}
                    className="text-accent hover:underline"
                  >
                    Why?
                  </button>
                  {e.bscscanUrl ? (
                    <a
                      href={e.bscscanUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:underline"
                    >
                      BscScan↗
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {explainerSessionId ? (
        <PositionExplainerModal
          sessionId={explainerSessionId}
          onClose={() => setExplainerSessionId(null)}
        />
      ) : null}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  warn,
}: {
  label: string;
  value: string;
  sub: string;
  warn?: boolean;
}) {
  return (
    <div
      className={`rounded-md border p-4 ${
        warn ? 'border-red-400/40 bg-red-400/10' : 'border-border bg-surface'
      }`}
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-tertiary">{label}</p>
      <p
        className={`mt-1 font-display text-2xl ${warn ? 'text-red-400' : 'text-text-primary'}`}
      >
        {value}
      </p>
      <p className="mt-1 font-mono text-[10px] text-text-tertiary">{sub}</p>
    </div>
  );
}
