import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui';
import { formatUsd } from '@/lib/utils/format';
import type { PairRollup } from './page';

interface TrackRecordPairsProps {
  rollups: PairRollup[];
}

export function TrackRecordPairs({ rollups }: TrackRecordPairsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>by pair</CardTitle>
        <div className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
          {rollups.length} pair{rollups.length === 1 ? '' : 's'} traded
        </div>
      </CardHeader>
      <CardBody className="space-y-3">
        {rollups.map((r) => {
          const pnlTone = r.netPnl > 0 ? 'text-accent-green' : r.netPnl < 0 ? 'text-accent-red' : 'text-text-secondary';
          const decided = r.wins + r.losses;
          const winPct = decided === 0 ? 0 : (r.wins / decided) * 100;
          return (
            <div key={r.pair} className="flex flex-wrap items-center justify-between gap-4 border-b border-border/40 pb-3 last:border-b-0 last:pb-0">
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-sm font-semibold text-text-primary">{r.pair}</span>
                <span className="font-mono text-xs tabular-nums text-text-tertiary">{r.trades} trade{r.trades === 1 ? '' : 's'}</span>
              </div>
              <div className="flex items-center gap-6 font-mono text-xs tabular-nums">
                <div className="flex items-center gap-2">
                  <span className="text-text-tertiary">win rate</span>
                  <div className="relative h-1.5 w-24 overflow-hidden rounded-full bg-border/70">
                    <div className="h-full bg-accent-green" style={{ width: `${winPct}%` }} aria-hidden />
                  </div>
                  <span className="w-10 text-right text-text-primary">
                    {decided === 0 ? '—' : `${Math.round(winPct)}%`}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-text-tertiary">w/l</span>
                  <span className="text-text-primary">
                    {r.wins}/{r.losses}
                  </span>
                </div>
                <div className={`text-sm font-semibold ${pnlTone}`}>
                  {r.netPnl >= 0 ? '+' : ''}{formatUsd(r.netPnl)}
                </div>
              </div>
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
}
