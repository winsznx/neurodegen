import type { ClaudeSentimentOutput } from '@/lib/utils/prompts';
import { Badge } from '@/components/ui';
import { sentimentLabel } from './reasoningHelpers';

interface SentimentViewProps {
  data: ClaudeSentimentOutput;
}

export function SentimentView({ data }: SentimentViewProps) {
  const { label, tone } = sentimentLabel(data.sentimentScore);
  const markerPct = ((data.sentimentScore + 1) / 2) * 100;
  const confidencePct = Math.round(data.confidenceLevel * 100);
  const scoreDisplay = data.sentimentScore >= 0 ? `+${data.sentimentScore.toFixed(2)}` : data.sentimentScore.toFixed(2);

  return (
    <div className="space-y-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
            narrative read
          </span>
          <Badge tone={tone} dot>{label}</Badge>
        </div>
        <div className="flex items-center gap-4 font-mono text-xs tabular-nums text-text-secondary">
          <span>
            <span className="text-text-tertiary">score</span>{' '}
            <span className="text-text-primary">{scoreDisplay}</span>
          </span>
          <span>
            <span className="text-text-tertiary">conf</span>{' '}
            <span className="text-text-primary">{confidencePct}%</span>
          </span>
        </div>
      </div>

      <p className="text-sm leading-relaxed text-text-primary">
        {data.narrativeSummary || <span className="italic text-text-tertiary">Model returned no narrative.</span>}
      </p>

      <div>
        <div className="mb-1.5 flex justify-between font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
          <span>fear</span>
          <span>neutral</span>
          <span>greed</span>
        </div>
        <div className="relative h-2.5 rounded-full bg-gradient-to-r from-accent-red/70 via-border to-accent-green/70">
          <div
            className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-accent shadow-[0_0_12px_var(--color-accent)]"
            style={{ left: `${markerPct}%` }}
            aria-hidden
          />
        </div>
        <div className="mt-1 flex justify-between font-mono text-[10px] tabular-nums text-text-tertiary">
          <span>-1.0</span>
          <span>0</span>
          <span>+1.0</span>
        </div>
      </div>

      {data.flaggedPatterns.length > 0 ? (
        <div>
          <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
            flagged patterns
          </div>
          <div className="flex flex-wrap gap-1.5">
            {data.flaggedPatterns.map((pattern, i) => (
              <Badge key={`${pattern}-${i}`} tone="yellow">{pattern}</Badge>
            ))}
          </div>
        </div>
      ) : (
        <div className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
          no anomalies flagged
        </div>
      )}
    </div>
  );
}
