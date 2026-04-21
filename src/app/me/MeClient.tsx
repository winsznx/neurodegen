'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePrivy, useWallets, getAccessToken } from '@privy-io/react-auth';
import { Shell } from '@/components/layout/Shell';
import { Card, CardBody, Button, Badge } from '@/components/ui';
import { UserPositionTable } from '@/components/features/copyTrade/UserPositionTable';
import { WalletCard } from '@/components/features/copyTrade/WalletCard';
import { useMe, useMyPositions } from '@/hooks/useMe';
import { StatsCard, PreferencesCard } from './MeCards';

async function patchSubscription(body: Record<string, unknown>): Promise<void> {
  const res = await fetch('/api/me/subscription', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`subscription patch failed: ${res.status}`);
}

async function registerSession(walletAddress: `0x${string}`): Promise<void> {
  const authToken = await getAccessToken();
  if (!authToken) throw new Error('no Privy auth token');
  const res = await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ authToken, walletAddress }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(body?.detail ?? `session registration failed: ${res.status}`);
  }
}

export function MeClient() {
  const router = useRouter();
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const me = useMe();
  const mine = useMyPositions();
  const [toggling, setToggling] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  const embedded = wallets.find((w) => w.walletClientType === 'privy');
  const embeddedAddress = embedded?.address as `0x${string}` | undefined;
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
      await patchSubscription({ active: !active });
      await me.refresh();
    } finally {
      setToggling(false);
    }
  };

  const handleRetrySetup = async (): Promise<void> => {
    if (!embeddedAddress) return;
    setRetrying(true);
    setRetryError(null);
    try {
      await registerSession(embeddedAddress);
      await me.refresh();
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : String(err));
    } finally {
      setRetrying(false);
    }
  };

  if (!ready || me.loading) {
    return (
      <Shell>
        <div className="mx-auto max-w-7xl px-6 py-12 font-mono text-sm text-text-tertiary">loading…</div>
      </Shell>
    );
  }

  if (!authenticated) {
    return (
      <Shell>
        <div className="mx-auto max-w-2xl space-y-4 px-6 py-12 text-center">
          <h1 className="font-mono text-2xl font-bold">Not connected</h1>
          <p className="text-text-secondary">Connect your wallet to see your copy-trade dashboard.</p>
          <div className="flex justify-center gap-2 pt-2">
            <Button variant="primary" onClick={() => login()}>Connect with Privy</Button>
            <Link href="/"><Button variant="ghost">← home</Button></Link>
          </div>
        </div>
      </Shell>
    );
  }

  if (!me.user) {
    return (
      <Shell>
        <div className="mx-auto max-w-2xl space-y-4 px-6 py-12">
          <h1 className="font-mono text-2xl font-bold">Finish setup</h1>
          <p className="text-text-secondary">
            You signed in with Privy, but your server-side session isn&apos;t registered yet.
            This usually happens the first time after a fresh deploy. Hit retry to create it.
          </p>
          <Card>
            <CardBody className="space-y-3">
              {embeddedAddress && (
                <div className="font-mono text-xs text-text-tertiary">
                  wallet: <span className="text-text-primary">{embeddedAddress}</span>
                </div>
              )}
              {me.error && <div className="font-mono text-[11px] text-negative">{me.error}</div>}
              {retryError && <div className="font-mono text-[11px] text-negative">{retryError}</div>}
              <div className="flex gap-2">
                <Button variant="primary" onClick={handleRetrySetup} disabled={retrying || !embeddedAddress}>
                  {retrying ? 'retrying…' : 'Retry session register'}
                </Button>
                <Button variant="ghost" onClick={() => logout()}>disconnect</Button>
              </div>
            </CardBody>
          </Card>
        </div>
      </Shell>
    );
  }

  const walletAddress = embeddedAddress ?? (me.user.walletAddress as `0x${string}`);

  return (
    <Shell>
      <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-mono text-2xl font-bold tracking-tight">Your copy-trade</h1>
            <p className="mt-1 font-mono text-xs text-text-tertiary">{walletAddress}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={signerGranted ? 'green' : 'yellow'} dot>
              {signerGranted ? 'signer granted' : 'signer not granted'}
            </Badge>
            <Badge tone={active ? 'green' : 'neutral'}>{active ? 'mirroring' : 'paused'}</Badge>
            <Button variant="ghost" onClick={() => logout()}>disconnect</Button>
          </div>
        </header>

        {!signerGranted && (
          <Card>
            <CardBody className="flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-2xl text-sm text-text-secondary">
                Copy-trade is off until you grant a session signer to NeuroDegen on your embedded wallet.
                That&apos;s a one-time consent so the agent can submit MYX orders on your behalf — you can revoke it any time.
              </p>
              <Button variant="primary" onClick={() => router.push('/onboard')}>Grant signer →</Button>
            </CardBody>
          </Card>
        )}

        <WalletCard address={walletAddress} />

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
