import Link from 'next/link';
import type { PositionState } from '@/types/execution';
import { Card, CardHeader, CardTitle, Badge } from '@/components/ui';
import { formatUsd } from '@/lib/utils/format';

interface TrackRecordTableProps {
  positions: PositionState[];
}

function shortHash(hash: string | null): string {
  if (!hash) return '—';
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

function formatDuration(openedAt: string, closedAt: string | null): string {
  if (!closedAt) return '—';
  const diffMs = new Date(closedAt).getTime() - new Date(openedAt).getTime();
  if (diffMs < 60_000) return `${Math.max(1, Math.round(diffMs / 1_000))}s`;
  if (diffMs < 3_600_000) return `${Math.round(diffMs / 60_000)}m`;
  if (diffMs < 86_400_000) return `${Math.round(diffMs / 3_600_000)}h`;
  return `${Math.round(diffMs / 86_400_000)}d`;
}

function exitReasonLabel(reason: string | null): string {
  if (!reason) return '—';
  const map: Record<string, string> = {
    tp_hit: 'TP hit',
    sl_hit: 'SL hit',
    time_exit: 'time',
    regime_exit: 'regime',
    external_close: 'external',
    manual: 'manual',
    admin: 'admin',
    liquidated: 'liquidated',
  };
  return map[reason] ?? reason;
}

export function TrackRecordTable({ positions }: TrackRecordTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>recent trades</CardTitle>
        <div className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
          last {positions.length}
        </div>
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full text-left font-mono text-xs">
          <thead>
            <tr className="border-b border-border text-[10px] uppercase tracking-wider text-text-tertiary">
              <Th>pair</Th>
              <Th>side</Th>
              <Th>entry</Th>
              <Th>exit</Th>
              <Th>lev</Th>
              <Th>duration</Th>
              <Th>reason</Th>
              <Th className="text-right">p&amp;l</Th>
              <Th className="text-right">proof</Th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => {
              const pnl = p.realizedPnlUsd ?? 0;
              const pnlTone = pnl > 0 ? 'text-accent-green' : pnl < 0 ? 'text-accent-red' : 'text-text-secondary';
              return (
                <tr
                  key={p.positionId}
                  className="border-b border-border/40 transition-colors hover:bg-surface-hover/40"
                >
                  <Td className="text-text-primary">{p.pair}</Td>
                  <Td>
                    <Badge tone={p.isLong ? 'green' : 'red'}>{p.isLong ? 'long' : 'short'}</Badge>
                  </Td>
                  <Td className="tabular-nums text-text-secondary">{formatUsd(p.entryPrice)}</Td>
                  <Td className="tabular-nums text-text-secondary">
                    {p.exitPrice !== null ? formatUsd(p.exitPrice) : '—'}
                  </Td>
                  <Td className="tabular-nums text-text-secondary">{p.leverage}x</Td>
                  <Td className="text-text-secondary">{formatDuration(p.openedAt, p.closedAt)}</Td>
                  <Td className="text-text-tertiary">{exitReasonLabel(p.exitReason)}</Td>
                  <Td className={`text-right font-semibold tabular-nums ${pnlTone}`}>
                    {pnl >= 0 ? '+' : ''}{formatUsd(pnl)}
                  </Td>
                  <Td className="text-right">
                    {p.entryTxHash ? (
                      <Link
                        href={`/proof/${p.entryTxHash}`}
                        className="text-accent hover:underline"
                        title={p.entryTxHash}
                      >
                        {shortHash(p.entryTxHash)} →
                      </Link>
                    ) : (
                      <span className="text-text-tertiary">—</span>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2.5 font-medium ${className ?? ''}`}>{children}</th>;
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2.5 ${className ?? ''}`}>{children}</td>;
}
