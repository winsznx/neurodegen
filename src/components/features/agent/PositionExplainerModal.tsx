'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { CommitteeSession } from '@/types/cognition';

interface Props {
  sessionId: string;
  onClose: () => void;
}

/**
 * Position Explainer modal PRD §8.5. Triggered from the dashboard
 * "Why?" button. Loads the session and renders the plain-language
 * explanation, dissent flag, and a link to the full session detail.
 */
export function PositionExplainerModal({ sessionId, onClose }: Props) {
  const [session, setSession] = useState<CommitteeSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/session/${sessionId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { session: CommitteeSession };
        if (!cancelled) setSession(json.session);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border border-border bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 font-mono text-[12px] text-text-tertiary hover:text-text-primary"
          aria-label="Close"
        >
          ✕
        </button>

        {error ? (
          <div>
            <h2 className="font-display text-xl text-red-400">Couldn&apos;t load session</h2>
            <p className="mt-2 font-mono text-[11px] text-text-secondary">{error}</p>
          </div>
        ) : !session ? (
          <p className="font-mono text-[12px] text-text-tertiary">loading…</p>
        ) : (
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-tertiary">
              session #{session.sessionNumber} · {session.regime} · F&amp;G {session.fearGreedAtSession}
            </p>
            <h2 className="mt-2 font-display text-2xl text-text-primary">
              {session.finalAction.action.toUpperCase()} ·{' '}
              {session.finalAction.tokenSymbol ?? '-'}
            </h2>

            <p className="mt-4 text-text-secondary">
              {session.finalAction.plainLanguageExplanation}
            </p>

            <div className="mt-4 grid gap-2 font-mono text-[11px]">
              <Row
                label="confidence"
                value={`${(session.finalAction.confidence * 100).toFixed(0)}%`}
              />
              {session.finalAction.positionSizeUSD !== null ? (
                <Row
                  label="size"
                  value={`$${session.finalAction.positionSizeUSD.toFixed(2)}`}
                />
              ) : null}
              <Row
                label="dissent"
                value={
                  session.dissentResult.dissentDetected
                    ? `${session.dissentResult.dissentSeverity} (modifier ×${session.dissentResult.positionSizeModifier.toFixed(2)})`
                    : 'none. Committee aligned.'
                }
              />
              <Row
                label="narrative"
                value={`${session.dissentResult.narrativeDirection}`}
              />
              <Row label="quant" value={`${session.dissentResult.quantDirection}`} />
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <Link
                href={`/session/${session.sessionId}`}
                className="rounded-md bg-accent px-3 py-2 font-mono text-[11px] text-black hover:bg-accent/90"
              >
                Open full session →
              </Link>
              {session.executionResult?.bscscanUrl ? (
                <a
                  href={session.executionResult.bscscanUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md border border-border px-3 py-2 font-mono text-[11px] text-text-secondary hover:border-accent hover:text-text-primary"
                >
                  BscScan↗
                </a>
              ) : null}
              {session.executionResult?.twakTxHash ? (
                <Link
                  href={`/proof/${session.executionResult.twakTxHash}`}
                  className="rounded-md border border-border px-3 py-2 font-mono text-[11px] text-text-secondary hover:border-accent hover:text-text-primary"
                >
                  Verify on-chain →
                </Link>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[100px_1fr] gap-2">
      <span className="text-text-tertiary uppercase tracking-[0.12em] text-[9px]">{label}</span>
      <span className="text-text-primary">{value}</span>
    </div>
  );
}
