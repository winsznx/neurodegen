import { notFound } from 'next/navigation';
import { Shell } from '@/components/layout/Shell';
import { getSessionById } from '@/lib/queries/sessions';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const session = await getSessionById(id).catch(() => null);
  if (!session) {
    return { title: 'Session not found' };
  }
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

  return (
    <Shell>
      <section className="mx-auto max-w-5xl px-6 py-10">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-tertiary">
          session #{session.sessionNumber} · {session.regime}
        </p>
        <h1 className="mt-2 font-display text-3xl text-text-primary">
          {session.finalAction.action.toUpperCase()} · {session.finalAction.tokenSymbol ?? '—'}
        </h1>
        <p className="mt-3 text-text-secondary">{session.finalAction.plainLanguageExplanation}</p>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <AnalystCard
            title="Narrative (Claude)"
            body={JSON.stringify(session.narrativeCall.parsedOutput, null, 2)}
          />
          <AnalystCard
            title="Quant (GPT-4o)"
            body={JSON.stringify(session.quantCall.parsedOutput, null, 2)}
          />
          <AnalystCard
            title="Risk (DeepSeek)"
            body={JSON.stringify(session.riskCall.parsedOutput, null, 2)}
          />
        </div>

        <div className="mt-8 rounded-md border border-border bg-surface p-4">
          <h3 className="font-display text-lg text-text-primary">Dissent</h3>
          <p className="mt-2 font-mono text-[12px] text-text-secondary">
            severity: {session.dissentResult.dissentSeverity} · narrative{' '}
            {session.dissentResult.narrativeDirection} vs quant{' '}
            {session.dissentResult.quantDirection} → size modifier{' '}
            {session.dissentResult.positionSizeModifier.toFixed(2)}
          </p>
        </div>

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
          </dl>
        </div>
      </section>
    </Shell>
  );
}

function AnalystCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-border bg-surface p-4">
      <h3 className="font-display text-base text-text-primary">{title}</h3>
      <pre className="mt-3 overflow-x-auto rounded-md bg-background p-3 font-mono text-[10px] text-text-secondary">
        {body}
      </pre>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3">
      <dt className="text-text-tertiary uppercase tracking-[0.12em] text-[10px]">{label}</dt>
      <dd className={mono ? 'font-mono break-all' : ''}>{value}</dd>
    </div>
  );
}
