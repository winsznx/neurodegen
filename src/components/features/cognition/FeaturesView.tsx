import type { GPT4oExtractionOutput } from '@/lib/utils/prompts';
import { Badge } from '@/components/ui';

interface FeaturesViewProps {
  data: GPT4oExtractionOutput;
}

const DIRECTION_TONE = {
  bullish: 'green',
  bearish: 'red',
  neutral: 'neutral',
} as const;

const DIRECTION_BAR = {
  bullish: 'bg-accent-green',
  bearish: 'bg-accent-red',
  neutral: 'bg-text-tertiary',
} as const;

export function FeaturesView({ data }: FeaturesViewProps) {
  const features = data.features;

  if (features.length === 0) {
    return (
      <div className="p-5 font-mono text-xs text-text-tertiary">
        Model returned no features.
      </div>
    );
  }

  const totals = features.reduce(
    (acc, f) => {
      acc[f.direction] += f.weight;
      return acc;
    },
    { bullish: 0, bearish: 0, neutral: 0 }
  );

  const winner = (['bullish', 'bearish', 'neutral'] as const).reduce((a, b) =>
    totals[a] >= totals[b] ? a : b
  );

  return (
    <div className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
          <span>features extracted</span>
          <span className="text-text-secondary">· {features.length}</span>
        </div>
        <div className="flex items-center gap-2 font-mono text-xs text-text-secondary">
          <span className="text-text-tertiary">dominant</span>
          <Badge tone={DIRECTION_TONE[winner]} dot>{winner}</Badge>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {features.map((f, i) => (
          <FeatureRow
            key={`${f.name}-${i}`}
            name={f.name}
            value={String(f.value)}
            direction={f.direction}
            weight={f.weight}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2 border-t border-border pt-3 font-mono text-[10px] uppercase tracking-wider">
        <WeightTotal label="bullish" value={totals.bullish} tone={DIRECTION_TONE.bullish} />
        <WeightTotal label="bearish" value={totals.bearish} tone={DIRECTION_TONE.bearish} />
        <WeightTotal label="neutral" value={totals.neutral} tone={DIRECTION_TONE.neutral} />
      </div>
    </div>
  );
}

interface FeatureRowProps {
  name: string;
  value: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  weight: number;
}

function FeatureRow({ name, value, direction, weight }: FeatureRowProps) {
  const pct = Math.round(weight * 100);
  return (
    <div className="rounded-sm border border-border/70 bg-surface/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-xs font-semibold text-text-primary" title={name}>
            {name}
          </div>
          <div className="mt-0.5 truncate font-mono text-[11px] tabular-nums text-text-secondary" title={value}>
            {value}
          </div>
        </div>
        <Badge tone={DIRECTION_TONE[direction]}>{direction}</Badge>
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-border/70">
          <div
            className={`h-full ${DIRECTION_BAR[direction]}`}
            style={{ width: `${pct}%` }}
            aria-hidden
          />
        </div>
        <span className="w-8 text-right font-mono text-[10px] tabular-nums text-text-tertiary">
          {pct}%
        </span>
      </div>
    </div>
  );
}

function WeightTotal({ label, value, tone }: { label: string; value: number; tone: 'green' | 'red' | 'neutral' }) {
  const colorClass = tone === 'green' ? 'text-accent-green' : tone === 'red' ? 'text-accent-red' : 'text-text-secondary';
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-text-tertiary">{label} total</span>
      <span className={`font-mono text-sm font-semibold tabular-nums ${colorClass}`}>
        {value.toFixed(2)}
      </span>
    </div>
  );
}
