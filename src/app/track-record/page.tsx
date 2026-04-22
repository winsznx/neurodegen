import { Suspense } from 'react';
import type { PositionState } from '@/types/execution';
import { Shell } from '@/components/layout/Shell';
import { Card, CardBody, CardHeader, CardTitle, Badge, Skeleton } from '@/components/ui';
import { getPositionHistory } from '@/lib/queries/positions';
import { getAttestationHistory, type AttestationHistory } from '@/lib/services/attestationHistory';
import { TrackRecordHeader } from './TrackRecordHeader';
import { TrackRecordStats } from './TrackRecordStats';
import { TrackRecordPairs } from './TrackRecordPairs';
import { TrackRecordTable } from './TrackRecordTable';
import { LiveRefresh } from './LiveRefresh';

export const dynamic = 'force-dynamic';
export const revalidate = 60;

export const metadata = {
  title: 'Track record',
  description:
    'On-chain history of every position NeuroDegen has opened and closed. Verified against the attestation contract on BNB Chain.',
  openGraph: {
    title: 'NeuroDegen track record',
    description: 'Every trade verified on-chain. No fabricated stats.',
  },
};

const CLOSED_STATES = new Set(['closed', 'liquidated', 'expired']);

export interface PairRollup {
  pair: string;
  trades: number;
  wins: number;
  losses: number;
  netPnl: number;
}

function rollupByPair(positions: PositionState[]): PairRollup[] {
  const map = new Map<string, PairRollup>();
  for (const p of positions) {
    const current = map.get(p.pair) ?? { pair: p.pair, trades: 0, wins: 0, losses: 0, netPnl: 0 };
    current.trades += 1;
    const pnl = p.realizedPnlUsd ?? 0;
    current.netPnl += pnl;
    if (pnl > 0) current.wins += 1;
    else if (pnl < 0) current.losses += 1;
    map.set(p.pair, current);
  }
  return [...map.values()].sort((a, b) => b.trades - a.trades);
}

export default async function TrackRecordPage() {
  const history = await getPositionHistory(200).catch(() => [] as PositionState[]);
  const attestationPromise: Promise<AttestationHistory | null> = getAttestationHistory().catch(() => null);

  const closed = history.filter((p) => CLOSED_STATES.has(p.status) && p.closedAt !== null);

  const wins = closed.filter((p) => (p.realizedPnlUsd ?? 0) > 0).length;
  const losses = closed.filter((p) => (p.realizedPnlUsd ?? 0) < 0).length;
  const breakevens = closed.length - wins - losses;
  const cumulativePnl = closed.reduce((sum, p) => sum + (p.realizedPnlUsd ?? 0), 0);
  const best = closed.reduce<number>((m, p) => Math.max(m, p.realizedPnlUsd ?? 0), 0);
  const worst = closed.reduce<number>((m, p) => Math.min(m, p.realizedPnlUsd ?? 0), 0);
  const winRate = wins + losses === 0 ? null : wins / (wins + losses);

  const byPair = rollupByPair(closed);
  const recent = closed.slice(0, 20);

  return (
    <Shell>
      <LiveRefresh />
      <div className="mx-auto max-w-7xl space-y-6 px-6 py-10">
        <Suspense fallback={<TrackRecordHeaderSkeleton />}>
          <TrackRecordHeaderAsync attestationPromise={attestationPromise} />
        </Suspense>

        {closed.length === 0 ? <EmptyState /> : null}

        <TrackRecordStats
          totalOpened={history.length}
          totalClosed={closed.length}
          wins={wins}
          losses={losses}
          breakevens={breakevens}
          winRate={winRate}
          cumulativePnl={cumulativePnl}
          best={best}
          worst={worst}
        />

        {byPair.length > 0 ? <TrackRecordPairs rollups={byPair} /> : null}

        {recent.length > 0 ? <TrackRecordTable positions={recent} /> : null}

        <Suspense fallback={<Disclaimer verifiedOnChainEvents={0} />}>
          <DisclaimerAsync attestationPromise={attestationPromise} />
        </Suspense>
      </div>
    </Shell>
  );
}

async function TrackRecordHeaderAsync({
  attestationPromise,
}: {
  attestationPromise: Promise<AttestationHistory | null>;
}) {
  const attestation = await attestationPromise;

  return (
    <TrackRecordHeader
      indexedAt={attestation?.indexedAt ?? 0}
      contractAddress={attestation?.contractAddress ?? null}
      onChainOpens={attestation?.opens.length ?? 0}
      onChainCloses={attestation?.closes.length ?? 0}
      fromBlock={attestation?.fromBlock ?? 0n}
      toBlock={attestation?.toBlock ?? 0n}
    />
  );
}

async function DisclaimerAsync({
  attestationPromise,
}: {
  attestationPromise: Promise<AttestationHistory | null>;
}) {
  const attestation = await attestationPromise;
  return <Disclaimer verifiedOnChainEvents={(attestation?.opens.length ?? 0) + (attestation?.closes.length ?? 0)} />;
}

function TrackRecordHeaderSkeleton() {
  return (
    <div className="space-y-3">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
          track record
        </div>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-text-primary">
          Every position the agent has taken.
        </h1>
        <p className="mt-2 max-w-3xl font-mono text-xs leading-relaxed text-text-secondary">
          No cherry-picking. No backtest. Real trades, real P&amp;L, committed on-chain before execution and revealed after.
        </p>
      </div>

      <Card>
        <CardBody>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <div className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">attestation contract</div>
              <Skeleton className="h-4 w-28" />
            </div>
            <div className="space-y-2">
              <div className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">on-chain events</div>
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="space-y-2">
              <div className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">blocks indexed</div>
              <Skeleton className="h-4 w-20" />
            </div>
            <div className="space-y-2">
              <div className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">indexed at</div>
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardBody className="space-y-2 text-center">
        <div className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
          no trades yet
        </div>
        <p className="text-sm text-text-secondary">
          Once the agent closes its first position, every trade will appear here with its proof, reasoning, and on-chain attestation.
        </p>
      </CardBody>
    </Card>
  );
}

function Disclaimer({ verifiedOnChainEvents }: { verifiedOnChainEvents: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>about this page</CardTitle>
        <Badge tone="neutral">live</Badge>
      </CardHeader>
      <CardBody className="space-y-2 font-mono text-xs leading-relaxed text-text-secondary">
        <p>
          Every row above is a position the agent opened and then closed. P&amp;L is realized, measured in USD against the MYX entry and exit prices. Losses are tracked with the same rigor as wins.
        </p>
        <p>
          Aggregates read from the NeuroDegen database.{' '}
          <strong className="text-text-primary">{verifiedOnChainEvents.toLocaleString('en-US')}</strong>{' '}
          attestation event{verifiedOnChainEvents === 1 ? '' : 's'} verified directly against the attestation contract on BNB Chain over the indexed block range.
        </p>
        <p className="text-text-tertiary">
          This is not a promise of future returns. It is a public ledger of what the agent actually did.
        </p>
      </CardBody>
    </Card>
  );
}
