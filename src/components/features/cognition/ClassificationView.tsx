import type { LlamaClassificationOutput } from '@/lib/utils/prompts';
import { Badge } from '@/components/ui';
import { MIN_CONFIDENCE_TO_ACT } from '@/config';

interface ClassificationViewProps {
  data: LlamaClassificationOutput;
}

const ACTION_TONE: Record<LlamaClassificationOutput['action'], 'green' | 'red' | 'yellow' | 'blue' | 'neutral'> = {
  open_long: 'green',
  open_short: 'red',
  close_position: 'yellow',
  adjust_parameters: 'blue',
  hold: 'neutral',
};

const ACTION_COPY: Record<LlamaClassificationOutput['action'], string> = {
  open_long: 'wants to open a long',
  open_short: 'wants to open a short',
  close_position: 'wants to close a position',
  adjust_parameters: 'wants to adjust parameters',
  hold: 'recommends holding',
};

export function ClassificationView({ data }: ClassificationViewProps) {
  const pct = Math.round(data.confidence * 100);
  const belowThreshold = data.confidence < MIN_CONFIDENCE_TO_ACT && data.action !== 'hold';
  const tone = ACTION_TONE[data.action];

  return (
    <div className="space-y-4 p-5">
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
        decision
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={tone} dot>
          {data.action.replace(/_/g, ' ')}
        </Badge>
        <span className="font-display text-3xl font-semibold tracking-tight text-text-primary">
          {pct}%
        </span>
        <span className="font-mono text-xs text-text-tertiary">confidence</span>
      </div>

      <div>
        <div className="mb-1.5 flex justify-between font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
          <span>0</span>
          <span>threshold {Math.round(MIN_CONFIDENCE_TO_ACT * 100)}%</span>
          <span>100</span>
        </div>
        <div className="relative h-2 overflow-hidden rounded-full bg-border/70">
          <div
            className={`h-full ${tone === 'green' ? 'bg-accent-green' : tone === 'red' ? 'bg-accent-red' : tone === 'yellow' ? 'bg-accent-yellow' : tone === 'blue' ? 'bg-accent-blue' : 'bg-text-secondary'}`}
            style={{ width: `${pct}%` }}
            aria-hidden
          />
          <div
            className="absolute top-0 h-full w-px bg-text-primary/60"
            style={{ left: `${MIN_CONFIDENCE_TO_ACT * 100}%` }}
            aria-hidden
          />
        </div>
      </div>

      <div className="border-l-2 border-border pl-4">
        <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
          why
        </div>
        <p className="text-sm leading-relaxed text-text-primary">
          Model {ACTION_COPY[data.action]}. {data.rationale}
        </p>
      </div>

      {belowThreshold ? (
        <div className="rounded-sm border border-accent-yellow/30 bg-accent-yellow/5 p-3 font-mono text-[11px] text-accent-yellow">
          confidence below {Math.round(MIN_CONFIDENCE_TO_ACT * 100)}% — final action overridden to hold.
        </div>
      ) : null}
    </div>
  );
}
