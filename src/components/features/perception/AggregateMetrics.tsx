import type { AggregateMetrics as MetricsType } from '@/types/perception';
import { Card, CardBody } from '@/components/ui';

interface AggregateMetricsProps {
  metrics: MetricsType | null;
}

interface MetricTileProps {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
}

function MetricTile({ label, value, unit, hint }: MetricTileProps) {
  return (
    <div className="flex flex-col justify-between gap-2 border-r border-border/60 p-4 last:border-r-0">
      <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
        {label}
      </span>
      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-2xl font-bold tabular-nums text-text-primary">
          {value}
        </span>
        {unit && (
          <span className="font-mono text-xs text-text-secondary">{unit}</span>
        )}
      </div>
      {hint && (
        <span className="font-mono text-[10px] text-text-muted">{hint}</span>
      )}
    </div>
  );
}

export function AggregateMetrics({ metrics }: AggregateMetricsProps) {
  if (!metrics) {
    return (
      <Card>
        <CardBody>
          <div className="font-mono text-xs text-text-muted">Waiting for first cycle…</div>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <div className="grid grid-cols-2 md:grid-cols-4">
        <MetricTile
          label="Launches / hr"
          value={metrics.launchVelocityPerHour.toFixed(1)}
        />
        <MetricTile
          label="Inflow BNB / hr"
          value={metrics.capitalInflowBNBPerHour.toFixed(2)}
          unit="BNB"
        />
        <MetricTile
          label="Graduations / hr"
          value={metrics.graduationVelocityPerHour.toFixed(2)}
        />
        <MetricTile
          label="Active launches"
          value={String(metrics.activeLaunches)}
        />
      </div>
    </Card>
  );
}
