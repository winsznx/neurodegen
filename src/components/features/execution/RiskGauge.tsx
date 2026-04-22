import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui';
import { cn } from '@/lib/utils/cn';

interface RiskGaugeProps {
  currentExposure: number;
  maxExposure: number;
}

export function RiskGauge({ currentExposure, maxExposure }: RiskGaugeProps) {
  const pct = maxExposure > 0 ? Math.min(100, (currentExposure / maxExposure) * 100) : 0;
  const tone =
    pct > 80 ? 'bg-accent-red' : pct > 50 ? 'bg-accent-yellow' : 'bg-accent-green';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Risk Exposure</CardTitle>
        <span className="font-mono text-xs tabular-nums text-text-secondary">
          {currentExposure.toFixed(0)} / {maxExposure.toFixed(0)} USD
        </span>
      </CardHeader>
      <CardBody className="space-y-2">
        <div className="h-2 overflow-hidden rounded-full bg-surface-hover">
          <div
            className={cn('h-full transition-all duration-300', tone)}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex items-center justify-between font-mono text-[10px] text-text-tertiary">
          <span>{pct.toFixed(0)}% deployed</span>
          <span>configured collateral cap</span>
        </div>
      </CardBody>
    </Card>
  );
}
