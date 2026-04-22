import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Shell } from '@/components/layout/Shell';
import { Card, CardBody, Badge } from '@/components/ui';
import { RegimeIndicator } from '@/components/features/cognition/RegimeIndicator';
import { ModelCallDetail } from '@/components/features/cognition/ModelCallDetail';
import { ReasoningNarrative } from '@/components/features/cognition/ReasoningNarrative';
import { getReasoningChainById } from '@/lib/queries/reasoningChains';
import { formatActionLabel, getDisplayedAction, getExecutionSummary } from '@/lib/utils/reasoningDisplay';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const graph = await getReasoningChainById(id).catch(() => null);
  if (!graph) {
    return { title: 'Reasoning chain not found', robots: { index: false, follow: false } };
  }
  const action = formatActionLabel(getDisplayedAction(graph));
  const pct = Math.round(graph.finalAction.confidence * 100);
  const title = `${action.toUpperCase()} ${graph.finalAction.pair} · ${pct}% confidence`;
  const description = `${graph.regime} regime · ${graph.modelCalls.length} model calls · ${graph.finalAction.rationale.slice(0, 180)}`;
  return {
    title,
    description,
    openGraph: { title, description, type: 'article' },
    twitter: { card: 'summary_large_image', title, description },
  };
}

const ACTION_TONE = {
  open_long: 'green',
  open_short: 'red',
  close_position: 'yellow',
  adjust_parameters: 'blue',
  hold: 'neutral',
} as const;

export default async function ReasoningDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const graph = await getReasoningChainById(id).catch(() => null);
  if (!graph) notFound();

  const displayedAction = getDisplayedAction(graph);
  const displayedActionLabel = formatActionLabel(displayedAction);
  const executionSummary = getExecutionSummary(graph);
  const isEntryAction = displayedAction === 'open_long' || displayedAction === 'open_short';
  const confidencePct = Math.round(graph.finalAction.confidence * 100);
  const createdAt = new Date(graph.createdAt).toLocaleString();

  return (
    <Shell>
      <div className="mx-auto max-w-7xl space-y-6 px-6 py-10">
        <Link
          href="/live"
          className="inline-flex items-center gap-2 font-mono text-xs text-text-tertiary hover:text-text-primary"
        >
          ← back to live dashboard
        </Link>

        <header className="space-y-4">
          <div className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
            reasoning graph · {graph.graphId}
          </div>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="font-mono text-3xl font-bold tracking-tight">
                {displayedActionLabel.toUpperCase()}
              </h1>
              <p className="mt-2 font-mono text-xs text-text-secondary">
                {graph.finalAction.pair} · {confidencePct}% confidence · {createdAt}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Badge tone={ACTION_TONE[displayedAction]} dot>
                {displayedActionLabel}
              </Badge>
              <RegimeIndicator regime={graph.regime} />
            </div>
          </div>
        </header>

        <Card>
          <CardBody className="space-y-2">
            <div className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
              execution outcome
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={executionSummary.tone} dot>
                {executionSummary.title}
              </Badge>
            </div>
            <p className="text-sm leading-relaxed text-text-primary break-all">
              {executionSummary.body}
            </p>
          </CardBody>
        </Card>

        <ReasoningNarrative graph={graph} />

        <Card>
          <CardBody className="space-y-4">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
                rationale
              </div>
              <p className="mt-2 text-sm leading-relaxed text-text-primary">
                {graph.finalAction.rationale}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 border-t border-border pt-4 font-mono text-xs sm:grid-cols-4">
              <Field label="size" value={isEntryAction && graph.finalAction.positionSizeUSD ? `$${graph.finalAction.positionSizeUSD}` : '—'} />
              <Field label="leverage" value={isEntryAction && graph.finalAction.leverageMultiplier ? `${graph.finalAction.leverageMultiplier}x` : '—'} />
              <Field label="tp" value={isEntryAction && graph.finalAction.tpPercentage ? `${(graph.finalAction.tpPercentage * 100).toFixed(1)}%` : '—'} />
              <Field label="sl" value={isEntryAction && graph.finalAction.slPercentage ? `${(graph.finalAction.slPercentage * 100).toFixed(1)}%` : '—'} />
            </div>
          </CardBody>
        </Card>

        <div>
          <div className="mb-3 font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
            aggregation logic
          </div>
          <Card>
            <CardBody>
              <p className="font-mono text-xs leading-relaxed text-text-secondary">
                {graph.aggregationLogic}
              </p>
            </CardBody>
          </Card>
        </div>

        <div>
          <div className="mb-3 font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
            model pipeline · {graph.modelCalls.length} calls
          </div>
          <div className="space-y-4">
            {graph.modelCalls.map((call, i) => (
              <ModelCallDetail key={call.callId} call={call} order={i + 1} />
            ))}
          </div>
        </div>
      </div>
    </Shell>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-text-tertiary">{label}</div>
      <div className="mt-1 text-text-primary">{value}</div>
    </div>
  );
}
