import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Shell } from '@/components/layout/Shell';
import { getSessionById } from '@/lib/queries/sessions';
import {
  ClassificationView,
  DissentBadge,
  FeaturesView,
  SentimentView,
} from '@/components/features/cognition';
import { MIN_CONFIDENCE_TO_ACT } from '@/config/cognition';
import type {
  NarrativeAnalystOutput,
  QuantAnalystOutput,
  RiskClassifierOutput,
} from '@/types/cognition';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const session = await getSessionById(id).catch(() => null);
  if (!session) return { title: 'Session not found' };
  return {
    title: `Session #${session.sessionNumber} · ${session.finalAction.action} · ${session.finalAction.tokenSymbol ?? '—'}`,
    description: session.finalAction.plainLanguageExplanation,
    openGraph: {
      images: [`/api/og/session/${id}`],
    },
  };
}

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSessionById(id);
  if (!session) notFound();

  const narrative = session.narrativeCall.parsedOutput as unknown as NarrativeAnalystOutput;
  const quant = session.quantCall.parsedOutput as unknown as QuantAnalystOutput;
  const risk = session.riskCall.parsedOutput as unknown as RiskClassifierOutput;
  const evDecisions = session.evGateDecisions ?? [];

  return (
    <Shell>
      <section className="mx-auto max-w-6xl px-6 py-10">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-tertiary">
          session #{session.sessionNumber} · {session.regime} · F&amp;G {session.fearGreedAtSession}
        </p>
        <h1 className="mt-2 font-display text-3xl text-text-primary">
          {session.finalAction.action.toUpperCase()} · {session.finalAction.tokenSymbol ?? '—'}
        </h1>
        <p className="mt-3 max-w-3xl text-text-secondary">
          {session.finalAction.plainLanguageExplanation}
        </p>

        <div className="mt-6">
          <DissentBadge result={session.dissentResult} />
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <SentimentView output={narrative} />
          <FeaturesView output={quant} />
          <ClassificationView output={risk} minConfidenceToAct={MIN_CONFIDENCE_TO_ACT} />
        </div>

        {evDecisions.length > 0 ? (
          <div className="mt-8 rounded-md border border-border bg-surface p-4">
            <h3 className="font-display text-lg text-text-primary">EV gate decisions</h3>
            <p className="mt-1 font-mono text-[11px] text-text-tertiary">
              Each x402 data purchase decision is logged here. PRD §4.3.
            </p>
            <ul className="mt-3 space-y-2">
              {evDecisions.map((d, i) => {
                const decision = d as unknown as {
                  shouldFetchPremium: boolean;
                  projectedAlphaUSD: number;
                  evRatio: number;
                  rationale: string;
                  triggeringSignal: string;
                  x402CostUSDC: number;
                };
                return (
                  <li
                    key={i}
                    className="rounded-sm border border-border/40 bg-background p-3 font-mono text-[11px]"
                  >
                    <div className="flex justify-between text-text-primary">
                      <span>
                        {decision.triggeringSignal} →{' '}
                        <span
                          className={
                            decision.shouldFetchPremium ? 'text-positive' : 'text-text-tertiary'
                          }
                        >
                          {decision.shouldFetchPremium ? 'PAID' : 'SKIPPED'}
                        </span>
                      </span>
                      <span className="text-text-tertiary">
                        ev ratio {decision.evRatio.toFixed(1)}×
                      </span>
                    </div>
                    <p className="mt-1 text-text-secondary">{decision.rationale}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <div className="mt-8 rounded-md border border-border bg-surface p-4">
          <h3 className="font-display text-lg text-text-primary">Proof chain</h3>
          <dl className="mt-3 grid gap-2 font-mono text-[11px] text-text-secondary">
            <Row label="Reasoning hash" value={session.reasoningHash} mono />
            <Row label="Commit tx" value={session.attestationCommitTx ?? 'not committed'} mono />
            {session.executionResult?.twakTxHash ? (
              <Row
                label="TWAK swap tx"
                value={
                  <a
                    href={session.executionResult.bscscanUrl ?? '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline"
                  >
                    {session.executionResult.twakTxHash}
                  </a>
                }
              />
            ) : (
              <Row label="TWAK swap tx" value="not executed" />
            )}
            {session.executionResult?.attestationRevealTx ? (
              <Row label="Reveal tx" value={session.executionResult.attestationRevealTx} mono />
            ) : null}
            {session.executionResult?.twakTxHash ? (
              <Row
                label="Public proof"
                value={
                  <a
                    href={`/proof/${session.executionResult.twakTxHash}`}
                    className="text-accent hover:underline"
                  >
                    Verify on-chain →
                  </a>
                }
              />
            ) : null}
          </dl>
        </div>

        <details className="mt-8 rounded-md border border-border bg-surface p-4">
          <summary className="cursor-pointer font-display text-base text-text-primary">
            Raw model output
          </summary>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <pre className="overflow-x-auto rounded-md bg-background p-3 font-mono text-[10px] text-text-secondary">
              {JSON.stringify(session.narrativeCall.parsedOutput, null, 2)}
            </pre>
            <pre className="overflow-x-auto rounded-md bg-background p-3 font-mono text-[10px] text-text-secondary">
              {JSON.stringify(session.quantCall.parsedOutput, null, 2)}
            </pre>
            <pre className="overflow-x-auto rounded-md bg-background p-3 font-mono text-[10px] text-text-secondary">
              {JSON.stringify(session.riskCall.parsedOutput, null, 2)}
            </pre>
          </div>
        </details>
      </section>
    </Shell>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3">
      <dt className="text-text-tertiary uppercase tracking-[0.12em] text-[10px]">{label}</dt>
      <dd className={mono ? 'font-mono break-all' : ''}>{value}</dd>
    </div>
  );
}
