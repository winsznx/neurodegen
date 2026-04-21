'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { Shell } from '@/components/layout/Shell';
import { Card, CardBody, CardHeader, CardTitle, Button, Badge } from '@/components/ui';
import { UserPositionTable } from '@/components/features/copyTrade/UserPositionTable';
import { useMe, useMyPositions } from '@/hooks/useMe';
import { cn } from '@/lib/utils/cn';

async function toggleActive(active: boolean): Promise<void> {
  const res = await fetch('/api/me/subscription', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ active }),
  });
  if (!res.ok) throw new Error('toggle failed');
}

export function MeClient() {
  const router = useRouter();
  const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const me = useMe();
  const mine = useMyPositions();
  const [toggling, setToggling] = useState(false);

  const embedded = wallets.find((w) => w.walletClientType === 'privy');
  const active = me.subscription?.active === true;
  const signerGranted = me.subscription?.sessionSignerGranted === true;

  const realizedPnl = mine.positions.reduce((sum, p) => sum + (p.realizedPnlUsd ?? 0), 0);
  const open = mine.positions.filter((p) => ['submitted', 'pending', 'filled', 'managed'].includes(p.status));

  const handleToggle = async (): Promise<void> => {
    if (!signerGranted) {
      router.push('/onboard');
      return;
    }
    setToggling(true);
    try {
      await toggleActive(!active);
      await me.refresh();
    } finally {
      setToggling(false);
    }
  };

  if (!ready || me.loading) {
    return (
      <Shell>
        <div className="mx-auto max-w-7xl px-6 py-12 font-mono text-sm text-text-muted">
          loading…
        </div>
      </Shell>
    );
  }

  if (!authenticated || !me.user) {
    return (
      <Shell>
        <div className="mx-auto max-w-2xl space-y-4 px-6 py-12 text-center">
          <h1 className="font-mono text-2xl font-bold">Not connected</h1>
          <p className="text-text-secondary">Connect your wallet to see your copy-trade dashboard.</p>
          <Link href="/" className="font-mono text-xs text-accent-blue hover:underline">← back home</Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-mono text-2xl font-bold tracking-tight">Your copy-trade</h1>
            <p className="mt-1 font-mono text-xs text-text-muted">
              {embedded?.address ?? me.user.walletAddress}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={signerGranted ? 'green' : 'yellow'} dot>
              {signerGranted ? 'signer granted' : 'signer not granted'}
            </Badge>
            <Badge tone={active ? 'green' : 'neutral'}>
              {active ? 'mirroring' : 'paused'}
            </Badge>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <StatsCard mirrors={mine.positions.length} open={open.length} realizedPnl={realizedPnl} />
          <PreferencesCard
            subscription={me.subscription}
            active={active}
            toggling={toggling}
            onToggle={handleToggle}
          />
        </div>

        <UserPositionTable positions={mine.positions} />
      </div>
    </Shell>
  );
}

function StatsCard({ mirrors, open, realizedPnl }: { mirrors: number; open: number; realizedPnl: number }) {
  const pnlTone = realizedPnl > 0 ? 'text-accent-green' : realizedPnl < 0 ? 'text-accent-red' : 'text-text-primary';
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
      <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">{label}</span>
      <span className={cn('font-mono text-2xl font-bold tabular-nums', tone ?? 'text-text-primary')}>
        {value}
      </span>
    </div>
  );
}

function PreferencesCard({
  subscription,
  active,
  toggling,
  onToggle,
}: {
  subscription: { leverageMultiplier: number; maxPositionUsd: number; minConfidence: number } | null;
  active: boolean;
  toggling: boolean;
  onToggle: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Preferences</CardTitle>
        <Link href="/onboard" className="font-mono text-[10px] text-accent-blue hover:underline">
          edit →
        </Link>
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
      <span className="text-text-muted">{label}</span>
      <span className="text-text-primary">{value}</span>
    </div>
  );
}
