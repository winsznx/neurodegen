import type { UserPosition } from '@/types/users';
import type { OrderLifecycleState } from '@/types/execution';
import { Card, CardHeader, CardTitle, Badge } from '@/components/ui';
import { OrderStatusBadge } from '@/components/features/execution/OrderStatusBadge';
import { cn } from '@/lib/utils/cn';

interface UserPositionTableProps {
  positions: UserPosition[];
}

export function UserPositionTable({ positions }: UserPositionTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your mirrors</CardTitle>
        <Badge tone="neutral">{positions.length}</Badge>
      </CardHeader>
      {positions.length === 0 ? (
        <div className="px-4 py-10 text-center font-mono text-xs text-text-tertiary">
          No mirrors yet. When the agent opens a position and your subscription is active, it appears here.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
                <th className="px-3 py-2 font-medium">Pair</th>
                <th className="px-3 py-2 font-medium">Side</th>
                <th className="px-3 py-2 font-medium">Entry</th>
                <th className="px-3 py-2 font-medium">Size</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">PnL</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => {
                const pnl = p.realizedPnlUsd ?? 0;
                const tone = pnl > 0 ? 'text-accent-green' : pnl < 0 ? 'text-accent-red' : 'text-text-secondary';
                return (
                  <tr key={p.userPositionId} className="border-b border-border/60 font-mono text-xs hover:bg-surface-hover/40">
                    <td className="px-3 py-2.5 text-text-primary">{p.pair}</td>
                    <td className="px-3 py-2.5">
                      <span className={cn(
                        'rounded px-1.5 py-0.5 text-[10px] font-bold uppercase',
                        p.isLong ? 'bg-accent-green/15 text-accent-green' : 'bg-accent-red/15 text-accent-red'
                      )}>
                        {p.isLong ? 'long' : 'short'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-text-secondary">
                      ${p.entryPrice.toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-text-secondary">
                      ${p.collateralUsd.toFixed(2)} · {p.leverage}x
                    </td>
                    <td className="px-3 py-2.5">
                      <OrderStatusBadge status={p.status as OrderLifecycleState} />
                    </td>
                    <td className={cn('px-3 py-2.5 tabular-nums font-semibold', tone)}>
                      {p.realizedPnlUsd !== null ? `$${p.realizedPnlUsd.toFixed(2)}` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
