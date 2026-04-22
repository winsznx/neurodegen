import type { ReasoningGraph } from '@/types/cognition';
import { Card, CardBody } from '@/components/ui';
import {
  castSentiment,
  castExtraction,
  castClassification,
  detectTask,
  sentimentLabel,
} from './reasoningHelpers';

interface ReasoningNarrativeProps {
  graph: ReasoningGraph;
}

export function ReasoningNarrative({ graph }: ReasoningNarrativeProps) {
  const sentimentCall = findLatestCall(graph, 'sentiment');
  const extractionCall = findLatestCall(graph, 'extraction');
  const classificationCall = findLatestCall(graph, 'classification');

  const sentiment = sentimentCall ? castSentiment(sentimentCall) : null;
  const extraction = extractionCall ? castExtraction(extractionCall) : null;
  const classification = classificationCall ? castClassification(classificationCall) : null;

  const launchesPerHour = graph.inputMetrics.launchVelocityPerHour;
  const inflowPerHour = graph.inputMetrics.capitalInflowBNBPerHour;
  const activeLaunches = graph.inputMetrics.activeLaunches;

  const sentimentChunk = sentiment
    ? `Claude read the market as ${sentimentLabel(sentiment.sentimentScore).label} ` +
      `(score ${sentiment.sentimentScore >= 0 ? '+' : ''}${sentiment.sentimentScore.toFixed(2)}, ` +
      `${Math.round(sentiment.confidenceLevel * 100)}% confident)${sentiment.flaggedPatterns.length > 0 ? ` and flagged ${sentiment.flaggedPatterns.length} anomaly${sentiment.flaggedPatterns.length === 1 ? '' : 'ies'}` : ''}.`
    : 'Sentiment pass did not return parseable output.';

  const extractionChunk = extraction
    ? buildExtractionSentence(extraction)
    : 'Feature extraction did not return parseable output.';

  const classificationChunk = classification
    ? `Llama classified: ${classification.action.replace(/_/g, ' ')} at ${Math.round(classification.confidence * 100)}% confidence.`
    : 'Classifier did not return parseable output.';

  const finalAction = graph.finalAction;
  const verdict =
    finalAction.action === 'hold'
      ? 'Final verdict: hold (no order submitted).'
      : `Final verdict: ${finalAction.action.replace(/_/g, ' ')} ${finalAction.pair}` +
        (finalAction.positionSizeUSD !== null ? ` with $${finalAction.positionSizeUSD} collateral` : '') +
        (finalAction.leverageMultiplier !== null ? ` at ${finalAction.leverageMultiplier}x.` : '.');

  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
          what the agent saw and did
        </div>
        <p className="text-base leading-relaxed text-text-primary">
          <span className="text-text-secondary">Perception:</span>{' '}
          {formatNumber(launchesPerHour)} launches/hr, {formatNumber(inflowPerHour)} BNB/hr inflow, {activeLaunches} active curves. Regime classified as <strong className="text-text-primary">{graph.regime}</strong>.{' '}
          <span className="text-text-secondary">Cognition:</span> {sentimentChunk} {extractionChunk} {classificationChunk}{' '}
          <span className="text-text-secondary">Execution:</span> {verdict}
        </p>
      </CardBody>
    </Card>
  );
}

function buildExtractionSentence(extraction: NonNullable<ReturnType<typeof castExtraction>>): string {
  const counts = { bullish: 0, bearish: 0, neutral: 0 };
  for (const f of extraction.features) counts[f.direction] += f.weight;

  const total = counts.bullish + counts.bearish + counts.neutral;
  if (total === 0) {
    return `GPT-4o extracted ${extraction.features.length} feature${extraction.features.length === 1 ? '' : 's'}.`;
  }

  const dominant = (['bullish', 'bearish', 'neutral'] as const).reduce((a, b) =>
    counts[a] >= counts[b] ? a : b
  );

  return (
    `GPT-4o extracted ${extraction.features.length} feature${extraction.features.length === 1 ? '' : 's'}, ` +
    `weight-skewed ${dominant} (${counts[dominant].toFixed(2)} of ${total.toFixed(2)} total weight).`
  );
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n >= 10) return Math.round(n).toString();
  return n.toFixed(2);
}

function findLatestCall(
  graph: ReasoningGraph,
  task: ReturnType<typeof detectTask>
) {
  for (let index = graph.modelCalls.length - 1; index >= 0; index--) {
    const call = graph.modelCalls[index];
    if (detectTask(call.modelId) === task) {
      return call;
    }
  }
  return null;
}
