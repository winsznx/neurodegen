import { Card, CardBody } from '@/components/ui';
import { formatUsd } from '@/lib/utils/format';

interface TrackRecordStatsProps {
  totalOpened: number;
  totalClosed: number;
  wins: number;
  losses: number;
  breakevens: number;
  winRate: number | null;
  cumulativePnl: number;
  best: number;
  worst: number;
}

export function TrackRecordStats({
  totalOpened,
  totalClosed,
  wins,
  losses,
  breakevens,
  winRate,
  cumulativePnl,
  best,
  worst,
}: TrackRecordStatsProps) {
  const pnlTone = cumulativePnl > 0 ? 'text-accent-green' : cumulativePnl < 0 ? 'text-accent-red' : 'text-text-primary';
  const winRateLabel = winRate === null ? '—' : `${Math.round(winRate * 100)}%`;

  return (
    <Card>
      <CardBody>
        <div className="grid gap-5 md:grid-cols-5">
          <Stat label="positions opened" value={totalOpened.toString()} />
          <Stat label="closed" value={totalClosed.toString()} />
          <Stat
            label="win rate"
            value={winRateLabel}
            sub={wins + losses > 0 ? `${wins} W / ${losses} L${breakevens > 0 ? ` · ${breakevens} BE` : ''}` : null}
          />
          <Stat
            label="cumulative p&l"
            value={formatUsd(cumulativePnl)}
            valueClassName={pnlTone}
          />
          <Stat
            label="best / worst"
            value={formatUsd(best)}
            valueClassName="text-accent-green"
            sub={formatUsd(worst)}
            subClassName="text-accent-red"
          />
        </div>
      </CardBody>
    </Card>
  );
}

interface StatProps {
  label: string;
  value: string;
  valueClassName?: string;
  sub?: string | null;
  subClassName?: string;
}

function Stat({ label, value, valueClassName, sub, subClassName }: StatProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">{label}</div>
      <div className={`font-display text-2xl font-semibold tracking-tight tabular-nums ${valueClassName ?? 'text-text-primary'}`}>
        {value}
      </div>
      {sub ? (
        <div className={`font-mono text-[11px] tabular-nums ${subClassName ?? 'text-text-tertiary'}`}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}
