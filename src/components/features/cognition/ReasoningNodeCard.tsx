import type { ModelCall } from '@/types/cognition';
import { Badge } from '@/components/ui';

interface ReasoningNodeCardProps {
  call: ModelCall;
}

const FORMAT_LABEL: Record<ModelCall['endpointFormat'], string> = {
  claude_native: '/v1/messages',
  openai_compatible: '/v1/chat/completions',
  gemini_native: '/v1/generateContent',
};

export function ReasoningNodeCard({ call }: ReasoningNodeCardProps) {
  const shortModel = call.modelId.split('/').pop() ?? call.modelId;
  const preview = call.rawOutput.slice(0, 140);

  return (
    <div className="flex flex-col gap-2 rounded border border-border bg-surface/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Badge tone={call.parseSuccess ? 'green' : 'red'} dot>
            {call.parseSuccess ? 'ok' : 'parse fail'}
          </Badge>
          <span className="truncate font-mono text-xs font-semibold text-text-primary">
            {shortModel}
          </span>
        </div>
        <span className="shrink-0 font-mono text-[10px] text-text-muted">
          {call.latencyMs}ms
        </span>
      </div>
      <div className="flex items-center gap-2 font-mono text-[10px] text-text-muted">
        <span>{FORMAT_LABEL[call.endpointFormat]}</span>
        <span>·</span>
        <span>{call.routingDecision}</span>
        <span>·</span>
        <span>{call.inputTokens}→{call.outputTokens} tokens</span>
      </div>
      {preview && (
        <div className="font-mono text-[11px] text-text-secondary line-clamp-2">
          {preview}
        </div>
      )}
    </div>
  );
}
