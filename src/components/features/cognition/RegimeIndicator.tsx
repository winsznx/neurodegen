import type { RegimeLabel } from '@/types/cognition';
import { Badge } from '@/components/ui';

interface RegimeIndicatorProps {
  regime: RegimeLabel;
}

const REGIME_CONFIG: Record<RegimeLabel, { tone: 'green' | 'blue' | 'yellow' | 'red'; description: string }> = {
  quiet: { tone: 'blue', description: 'Low activity, reduced sizing' },
  active: { tone: 'green', description: 'Healthy flow, base parameters' },
  retail_frenzy: { tone: 'yellow', description: 'High velocity, increased sizing' },
  volatile: { tone: 'red', description: 'Funding flipped, defensive mode' },
};

export function RegimeIndicator({ regime }: RegimeIndicatorProps) {
  const config = REGIME_CONFIG[regime];

  return (
    <div className="flex flex-col items-start gap-2">
      <Badge tone={config.tone} dot>
        {regime.replace(/_/g, ' ')}
      </Badge>
      <span className="font-mono text-xs text-text-tertiary">{config.description}</span>
    </div>
  );
}
