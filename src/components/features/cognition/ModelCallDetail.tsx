import type { ModelCall } from '@/types/cognition';
import { Card, CardHeader, CardTitle, Badge } from '@/components/ui';
import { SentimentView } from './SentimentView';
import { FeaturesView } from './FeaturesView';
import { ClassificationView } from './ClassificationView';
import {
  detectTask,
  castSentiment,
  castExtraction,
  castClassification,
  taskLabel,
} from './reasoningHelpers';

interface ModelCallDetailProps {
  call: ModelCall;
  order: number;
}

const FORMAT_LABEL: Record<ModelCall['endpointFormat'], string> = {
  claude_native: '/v1/messages',
  openai_compatible: '/v1/chat/completions',
  gemini_native: '/v1/generateContent',
};

export function ModelCallDetail({ call, order }: ModelCallDetailProps) {
  const timestamp = new Date(call.timestamp).toLocaleTimeString();
  const task = detectTask(call.modelId);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-text-tertiary">#{order}</span>
          <div className="flex flex-col">
            <CardTitle>{call.modelId}</CardTitle>
            <span className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
              {taskLabel(task)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="neutral">{FORMAT_LABEL[call.endpointFormat]}</Badge>
          <Badge tone={call.routingDecision === 'dgrid' ? 'purple' : 'blue'}>
            {call.routingDecision}
          </Badge>
          <Badge tone={call.parseSuccess ? 'green' : 'red'} dot>
            {call.parseSuccess ? 'parsed' : 'failed'}
          </Badge>
        </div>
      </CardHeader>

      <div className="grid grid-cols-2 divide-x divide-border border-b border-border md:grid-cols-4">
        <MetricCell label="Latency" value={`${call.latencyMs}ms`} />
        <MetricCell label="Input" value={`${call.inputTokens} tok`} />
        <MetricCell label="Output" value={`${call.outputTokens} tok`} />
        <MetricCell label="At" value={timestamp} />
      </div>

      <ParsedView call={call} task={task} />

      <details className="border-t border-border">
        <summary className="cursor-pointer select-none px-5 py-3 font-mono text-[10px] uppercase tracking-wider text-text-tertiary hover:bg-surface-hover/40 hover:text-text-secondary">
          view raw input / output
        </summary>
        <div className="grid grid-cols-1 divide-y divide-border lg:grid-cols-2 lg:divide-x lg:divide-y-0">
          <CodeBlock label="System prompt" content={call.systemPrompt} />
          <CodeBlock label="User input" content={call.userInput} />
        </div>
        <div className="border-t border-border">
          <CodeBlock label="Raw model output" content={call.rawOutput} />
        </div>
      </details>
    </Card>
  );
}

function ParsedView({ call, task }: { call: ModelCall; task: ReturnType<typeof detectTask> }) {
  if (!call.parseSuccess) {
    return (
      <div className="border-b border-border bg-accent-red/5 p-5">
        <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-accent-red">
          parse failed
        </div>
        <p className="font-mono text-xs text-text-secondary">
          The model response could not be parsed into the expected schema. The fallback payload was used downstream. Expand the raw output below to inspect.
        </p>
      </div>
    );
  }

  if (task === 'sentiment') {
    const data = castSentiment(call);
    if (data) return <SentimentView data={data} />;
  }

  if (task === 'extraction') {
    const data = castExtraction(call);
    if (data) return <FeaturesView data={data} />;
  }

  if (task === 'classification') {
    const data = castClassification(call);
    if (data) return <ClassificationView data={data} />;
  }

  return (
    <div className="p-5 font-mono text-xs text-text-tertiary">
      Parsed payload did not match an expected schema for this task. Raw output preserved below.
    </div>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3">
      <div className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">{label}</div>
      <div className="mt-1 font-mono text-sm font-semibold tabular-nums text-text-primary">{value}</div>
    </div>
  );
}

function CodeBlock({ label, content }: { label: string; content: string }) {
  return (
    <div className="p-4">
      <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-text-tertiary">{label}</div>
      <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap wrap-break-word font-mono text-[11px] leading-relaxed text-text-secondary">
        {content || '(empty)'}
      </pre>
    </div>
  );
}
