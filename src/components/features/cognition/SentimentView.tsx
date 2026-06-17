'use client';

import type { NarrativeAnalystOutput } from '@/types/cognition';

interface Props {
  output: NarrativeAnalystOutput;
}

export function SentimentView({ output }: Props) {
  // Map sentiment score [-1, 1] to a marker position [0%, 100%] on the bar
  const markerPct = Math.max(0, Math.min(100, ((output.sentimentScore + 1) / 2) * 100));
  const confidencePct = Math.max(0, Math.min(100, output.confidenceLevel * 100));
  const directionColor =
    output.direction === 'bullish'
      ? 'text-positive'
      : output.direction === 'bearish'
        ? 'text-red-400'
        : 'text-text-secondary';

  return (
    <div className="rounded-md border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-base text-text-primary">Narrative · Claude</h3>
        <span className={`font-mono text-[11px] uppercase tracking-[0.14em] ${directionColor}`}>
          {output.direction}
        </span>
      </div>

      <p className="mt-3 text-sm text-text-secondary">{output.narrativeSummary}</p>

      <div className="mt-5 space-y-3">
        <div>
          <div className="flex justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary">
            <span>Sentiment</span>
            <span>{output.sentimentScore.toFixed(2)}</span>
          </div>
          <div className="relative mt-2 h-2 rounded-sm bg-background">
            <div className="absolute inset-0 rounded-sm bg-gradient-to-r from-red-500/40 via-text-tertiary/30 to-positive/40" />
            <div
              className="absolute top-1/2 size-3 -translate-y-1/2 rounded-full bg-accent"
              style={{ left: `calc(${markerPct}% - 6px)`, boxShadow: '0 0 8px hsl(35 92% 52% / 0.6)' }}
              aria-label={`sentiment ${output.sentimentScore.toFixed(2)}`}
            />
            <div className="absolute top-1/2 left-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-text-tertiary/40" />
          </div>
          <div className="mt-1 flex justify-between font-mono text-[9px] text-text-tertiary">
            <span>fear</span>
            <span>neutral</span>
            <span>greed</span>
          </div>
        </div>

        <div>
          <div className="flex justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary">
            <span>Confidence</span>
            <span>{confidencePct.toFixed(0)}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-sm bg-background">
            <div
              className="h-full bg-accent transition-all"
              style={{ width: `${confidencePct}%` }}
            />
          </div>
        </div>
      </div>

      {output.kolMentionedTokens.length > 0 ? (
        <div className="mt-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary">
            KOL momentum
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {output.kolMentionedTokens.map((sym) => (
              <span
                key={sym}
                className="rounded-sm border border-border bg-background px-2 py-1 font-mono text-[10px] text-text-secondary"
              >
                {sym}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {output.flaggedAnomalies.length > 0 ? (
        <div className="mt-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-red-400">
            Flagged
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {output.flaggedAnomalies.map((flag) => (
              <span
                key={flag}
                className="rounded-sm border border-red-400/40 bg-red-400/10 px-2 py-1 font-mono text-[10px] text-red-400"
              >
                {flag}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {output.topThesisToken ? (
        <p className="mt-5 font-mono text-[11px] text-text-secondary">
          Top thesis: <span className="text-accent">{output.topThesisToken}</span>
        </p>
      ) : null}
    </div>
  );
}
