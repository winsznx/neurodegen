'use client';

import Link from 'next/link';
import { Card, CardBody, CardHeader, CardTitle, Button } from '@/components/ui';
import { cn } from '@/lib/utils/cn';

export function StatsCard({ mirrors, open, realizedPnl }: { mirrors: number; open: number; realizedPnl: number }) {
  const pnlTone = realizedPnl > 0 ? 'text-positive' : realizedPnl < 0 ? 'text-negative' : 'text-text-primary';
  return (
    <Card>
      <div className="grid grid-cols-3">
        <Tile label="Total mirrors" value={String(mirrors)} />
        <Tile label="Open" value={String(open)} />
        <Tile label="Realized PnL" value={`$${realizedPnl.toFixed(2)}`} tone={pnlTone} />
      </div>
    </Card>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-col justify-between gap-2 border-r border-border/60 p-4 last:border-r-0">
      <span className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">{label}</span>
      <span className={cn('font-mono text-2xl font-bold tabular-nums', tone ?? 'text-text-primary')}>{value}</span>
    </div>
  );
}

export function PreferencesCard({ subscription, active, toggling, onToggle }: {
  subscription: { leverageMultiplier: number; maxPositionUsd: number; minConfidence: number } | null;
  active: boolean;
  toggling: boolean;
  onToggle: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Preferences</CardTitle>
        <Link href="/onboard" className="font-mono text-[10px] text-accent hover:underline">edit →</Link>
      </CardHeader>
      <CardBody className="space-y-2 font-mono text-xs">
        <Row label="Leverage mult." value={`${subscription?.leverageMultiplier ?? '—'}x`} />
        <Row label="Max position" value={`$${subscription?.maxPositionUsd ?? '—'}`} />
        <Row label="Min confidence" value={`${Math.round((subscription?.minConfidence ?? 0) * 100)}%`} />
        <div className="pt-3">
          <Button variant={active ? 'secondary' : 'primary'} onClick={onToggle} disabled={toggling}>
            {toggling ? '…' : active ? 'Pause mirror' : 'Resume mirror'}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-text-tertiary">{label}</span>
      <span className="text-text-primary">{value}</span>
    </div>
  );
}
