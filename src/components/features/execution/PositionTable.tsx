import type { PositionState } from '@/types/execution';
import { Card, CardHeader, CardTitle, Badge } from '@/components/ui';
import { PositionRow } from './PositionRow';

interface PositionTableProps {
  positions: PositionState[];
}

export function PositionTable({ positions }: PositionTableProps) {
  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader>
        <CardTitle>Positions</CardTitle>
        <Badge tone="neutral">{positions.length}</Badge>
      </CardHeader>

      {positions.length === 0 ? (
        <div className="px-4 py-12 text-center font-mono text-xs text-text-muted">
          No positions yet. Agent opens positions when reasoning confidence exceeds threshold.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border font-mono text-[10px] uppercase tracking-wider text-text-muted">
                <th scope="col" className="px-3 py-2 font-medium">Pair</th>
                <th scope="col" className="px-3 py-2 font-medium">Side</th>
                <th scope="col" className="px-3 py-2 font-medium">Entry</th>
                <th scope="col" className="px-3 py-2 font-medium">Size</th>
                <th scope="col" className="px-3 py-2 font-medium">TP / SL</th>
                <th scope="col" className="px-3 py-2 font-medium">Status</th>
                <th scope="col" className="px-3 py-2 font-medium">PnL</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <PositionRow key={p.positionId} position={p} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
