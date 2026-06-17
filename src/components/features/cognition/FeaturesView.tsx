'use client';

import type { QuantAnalystOutput } from '@/types/cognition';

interface Props {
  output: QuantAnalystOutput;
}

export function FeaturesView({ output }: Props) {
  const directionColor =
    output.dominantDirection === 'bullish'
      ? 'text-positive'
      : output.dominantDirection === 'bearish'
        ? 'text-red-400'
        : 'text-text-secondary';

  // Aggregate feature weights by direction.
  const totals = output.features.reduce(
    (acc, f) => {
      acc[f.direction] += f.weight;
      return acc;
    },
    { bullish: 0, bearish: 0, neutral: 0 },
  );
  const grand = totals.bullish + totals.bearish + totals.neutral;

  return (
    <div className="rounded-md border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-base text-text-primary">Quant · GPT-4o</h3>
        <span className={`font-mono text-[11px] uppercase tracking-[0.14em] ${directionColor}`}>
          {output.dominantDirection}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {output.liquidityAdequate ? (
          <Badge color="positive">liquidity ok</Badge>
        ) : (
          <Badge color="red">liquidity inadequate</Badge>
        )}
        {output.fundingRateWarning ? (
          <Badge color="amber">funding warning</Badge>
        ) : (
          <Badge color="muted">funding neutral</Badge>
        )}
        {output.recommendedToken ? (
          <Badge color="accent">target: {output.recommendedToken}</Badge>
        ) : null}
      </div>

      {grand > 0 ? (
        <div className="mt-5">
          <div className="flex justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary">
            <span>Weighted direction</span>
            <span>{grand.toFixed(2)} total</span>
          </div>
          <div className="mt-2 flex h-2 overflow-hidden rounded-sm bg-background">
            <div
              className="h-full bg-positive"
              style={{ width: `${(totals.bullish / grand) * 100}%` }}
              aria-label={`bullish ${totals.bullish.toFixed(2)}`}
            />
            <div
              className="h-full bg-text-tertiary/50"
              style={{ width: `${(totals.neutral / grand) * 100}%` }}
              aria-label={`neutral ${totals.neutral.toFixed(2)}`}
            />
            <div
              className="h-full bg-red-400"
              style={{ width: `${(totals.bearish / grand) * 100}%` }}
              aria-label={`bearish ${totals.bearish.toFixed(2)}`}
            />
          </div>
          <div className="mt-1 flex justify-between font-mono text-[9px] text-text-tertiary">
            <span>bullish {totals.bullish.toFixed(1)}</span>
            <span>neutral {totals.neutral.toFixed(1)}</span>
            <span>bearish {totals.bearish.toFixed(1)}</span>
          </div>
        </div>
      ) : null}

      {output.features.length > 0 ? (
        <ul className="mt-5 space-y-2">
          {output.features.slice(0, 8).map((f) => (
            <li key={f.name} className="flex items-center justify-between gap-3">
              <div className="flex flex-col min-w-0">
                <span className="truncate font-mono text-[11px] text-text-primary">{f.name}</span>
                <span className="font-mono text-[10px] text-text-tertiary">
                  value: {typeof f.value === 'number' ? f.value.toFixed(4) : f.value}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <div className="h-1.5 w-12 overflow-hidden rounded-sm bg-background">
                  <div
                    className={`h-full ${f.direction === 'bullish' ? 'bg-positive' : f.direction === 'bearish' ? 'bg-red-400' : 'bg-text-tertiary'}`}
                    style={{ width: `${Math.min(100, Math.abs(f.weight) * 100)}%` }}
                  />
                </div>
                <span className="font-mono text-[10px] text-text-tertiary">
                  {f.weight.toFixed(2)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-5 font-mono text-[10px] text-text-tertiary">no features extracted</p>
      )}
    </div>
  );
}

function Badge({
  color,
  children,
}: {
  color: 'positive' | 'red' | 'amber' | 'accent' | 'muted';
  children: React.ReactNode;
}) {
  const classes = {
    positive: 'border-positive/40 bg-positive/10 text-positive',
    red: 'border-red-400/40 bg-red-400/10 text-red-400',
    amber: 'border-accent/40 bg-accent/10 text-accent-soft',
    accent: 'border-accent/40 bg-accent/10 text-accent',
    muted: 'border-border bg-background text-text-tertiary',
  }[color];
  return (
    <span className={`rounded-sm border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] ${classes}`}>
      {children}
    </span>
  );
}
