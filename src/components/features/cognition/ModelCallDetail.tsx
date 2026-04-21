import type { ModelCall } from '@/types/cognition';
import { Card, CardHeader, CardTitle, Badge } from '@/components/ui';

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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-text-tertiary">#{order}</span>
          <CardTitle>{call.modelId}</CardTitle>
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
      <div className="grid grid-cols-2 divide-x divide-border md:grid-cols-4 border-b border-border">
        <MetricCell label="Latency" value={`${call.latencyMs}ms`} />
        <MetricCell label="Input" value={`${call.inputTokens} tok`} />
        <MetricCell label="Output" value={`${call.outputTokens} tok`} />
        <MetricCell label="At" value={timestamp} />
      </div>
      <div className="grid grid-cols-1 divide-y divide-border lg:grid-cols-2 lg:divide-x lg:divide-y-0">
        <CodeBlock label="System prompt" content={call.systemPrompt} />
        <CodeBlock label="User input" content={call.userInput} />
      </div>
      <div className="border-t border-border">
        <CodeBlock label="Raw output" content={call.rawOutput} />
      </div>
    </Card>
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
      <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-text-secondary">
        {content || '(empty)'}
      </pre>
    </div>
  );
}
