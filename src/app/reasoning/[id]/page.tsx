import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Shell } from '@/components/layout/Shell';
import { Card, CardBody, Badge } from '@/components/ui';
import { RegimeIndicator } from '@/components/features/cognition/RegimeIndicator';
import { ModelCallDetail } from '@/components/features/cognition/ModelCallDetail';
import { getReasoningChainById } from '@/lib/queries/reasoningChains';

export const dynamic = 'force-dynamic';

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

  const confidencePct = Math.round(graph.finalAction.confidence * 100);
  const createdAt = new Date(graph.createdAt).toLocaleString();

  return (
    <Shell>
      <div className="mx-auto max-w-[1280px] space-y-6 px-6 py-10">
        <Link
          href="/live"
          className="inline-flex items-center gap-2 font-mono text-xs text-text-muted hover:text-text-primary"
        >
          ← back to live dashboard
        </Link>

        <header className="space-y-4">
          <div className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
            reasoning graph · {graph.graphId}
          </div>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="font-mono text-3xl font-bold tracking-tight">
                {graph.finalAction.action.replace(/_/g, ' ').toUpperCase()}
              </h1>
              <p className="mt-2 font-mono text-xs text-text-secondary">
                {graph.finalAction.pair} · {confidencePct}% confidence · {createdAt}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Badge tone={ACTION_TONE[graph.finalAction.action]} dot>
                {graph.finalAction.action.replace(/_/g, ' ')}
              </Badge>
              <RegimeIndicator regime={graph.regime} />
            </div>
          </div>
        </header>

        <Card>
          <CardBody className="space-y-4">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                rationale
              </div>
              <p className="mt-2 text-sm leading-relaxed text-text-primary">
                {graph.finalAction.rationale}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 border-t border-border pt-4 font-mono text-xs sm:grid-cols-4">
              <Field label="size" value={graph.finalAction.positionSizeUSD ? `$${graph.finalAction.positionSizeUSD}` : '—'} />
              <Field label="leverage" value={graph.finalAction.leverageMultiplier ? `${graph.finalAction.leverageMultiplier}x` : '—'} />
              <Field label="tp" value={graph.finalAction.tpPercentage ? `${(graph.finalAction.tpPercentage * 100).toFixed(1)}%` : '—'} />
              <Field label="sl" value={graph.finalAction.slPercentage ? `${(graph.finalAction.slPercentage * 100).toFixed(1)}%` : '—'} />
            </div>
          </CardBody>
        </Card>

        <div>
          <div className="mb-3 font-mono text-[10px] uppercase tracking-wider text-text-muted">
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
          <div className="mb-3 font-mono text-[10px] uppercase tracking-wider text-text-muted">
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
      <div className="text-[10px] uppercase tracking-wider text-text-muted">{label}</div>
      <div className="mt-1 text-text-primary">{value}</div>
    </div>
  );
}
