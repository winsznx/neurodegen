import Link from 'next/link';
import type { ReasoningGraph } from '@/types/cognition';
import { Card, CardHeader, CardTitle, CardBody, Badge } from '@/components/ui';
import { RegimeIndicator } from './RegimeIndicator';
import { ReasoningNodeCard } from './ReasoningNodeCard';
import { formatActionLabel, getDisplayedAction, getExecutionSummary } from '@/lib/utils/reasoningDisplay';

interface ReasoningChainViewProps {
  graph: ReasoningGraph | null;
}

const ACTION_TONE = {
  open_long: 'green',
  open_short: 'red',
  close_position: 'yellow',
  adjust_parameters: 'blue',
  hold: 'neutral',
} as const;

export function ReasoningChainView({ graph }: ReasoningChainViewProps) {
  if (!graph) {
    return (
      <Card className="h-[500px]">
        <CardHeader>
          <CardTitle>Latest Reasoning</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="font-mono text-xs text-text-tertiary">
            No reasoning cycles yet. First cycle runs after perception warms up.
          </div>
        </CardBody>
      </Card>
    );
  }

  const displayedAction = getDisplayedAction(graph);
  const executionSummary = getExecutionSummary(graph);
  const confidencePct = Math.round(graph.finalAction.confidence * 100);

  return (
    <Card className="flex h-[500px] flex-col">
      <CardHeader>
        <CardTitle>Latest Reasoning</CardTitle>
        <Link
          href={`/reasoning/${graph.graphId}`}
          className="font-mono text-[10px] uppercase tracking-wider text-accent-blue hover:underline"
        >
          detail →
        </Link>
      </CardHeader>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <div className="flex items-start justify-between gap-3">
          <RegimeIndicator regime={graph.regime} />
          <div className="flex flex-col items-end gap-1">
            <Badge tone={ACTION_TONE[displayedAction]}>
              {formatActionLabel(displayedAction)}
            </Badge>
            <span className="font-mono text-[10px] text-text-tertiary">
              {confidencePct}% confidence
            </span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="font-mono text-xs leading-relaxed text-text-secondary">
            {graph.finalAction.rationale}
          </div>
          <div className="font-mono text-[11px] leading-relaxed text-text-tertiary">
            {executionSummary.title}: {executionSummary.body}
          </div>
        </div>

        <div className="space-y-2 pt-2">
          <div className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
            Model pipeline ({graph.modelCalls.length} calls)
          </div>
          <div className="space-y-2">
            {graph.modelCalls.map((call) => (
              <ReasoningNodeCard key={call.callId} call={call} />
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
