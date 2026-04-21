import type { PositionState } from '@/types/execution';
import { OrderStatusBadge } from './OrderStatusBadge';
import { cn } from '@/lib/utils/cn';

interface PositionRowProps {
  position: PositionState;
}

function formatUsd(v: number | null): string {
  if (v === null || v === undefined) return '—';
  return `$${v.toFixed(2)}`;
}

export function PositionRow({ position }: PositionRowProps) {
  const pnl = position.realizedPnlUsd ?? 0;
  const pnlTone =
    pnl > 0 ? 'text-accent-green' : pnl < 0 ? 'text-accent-red' : 'text-text-secondary';

  return (
    <tr className="border-b border-border/60 font-mono text-xs hover:bg-surface-hover/40">
      <td className="px-3 py-2.5 text-text-primary">{position.pair}</td>
      <td className="px-3 py-2.5">
        <span className={cn(
          'rounded px-1.5 py-0.5 text-[10px] font-bold uppercase',
          position.isLong ? 'bg-accent-green/15 text-accent-green' : 'bg-accent-red/15 text-accent-red'
        )}>
          {position.isLong ? 'long' : 'short'}
        </span>
      </td>
      <td className="px-3 py-2.5 tabular-nums text-text-secondary">
        {formatUsd(position.entryPrice)}
      </td>
      <td className="px-3 py-2.5 tabular-nums text-text-secondary">
        {formatUsd(position.collateralUsd)} · {position.leverage}x
      </td>
      <td className="px-3 py-2.5 tabular-nums text-text-tertiary">
        {formatUsd(position.tpPrice)} / {formatUsd(position.slPrice)}
      </td>
      <td className="px-3 py-2.5">
        <OrderStatusBadge status={position.status} />
      </td>
      <td className={cn('px-3 py-2.5 tabular-nums font-semibold', pnlTone)}>
        {position.realizedPnlUsd !== null ? formatUsd(position.realizedPnlUsd) : '—'}
      </td>
    </tr>
  );
}
