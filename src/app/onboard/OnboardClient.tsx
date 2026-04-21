'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSigners, useWallets, usePrivy } from '@privy-io/react-auth';
import { Card, CardBody, CardHeader, CardTitle, Button, Badge } from '@/components/ui';
import { Shell } from '@/components/layout/Shell';
import { PreferenceRow } from '@/components/features/copyTrade/PreferenceRow';
import { useMe } from '@/hooks/useMe';

const SIGNER_ID = process.env.NEXT_PUBLIC_PRIVY_SIGNER_ID ?? '';

type Step = 'connect' | 'grant' | 'update';

async function patchSubscription(input: {
  leverageMultiplier: number;
  maxPositionUsd: number;
  sessionSignerGranted?: boolean;
  active?: boolean;
}): Promise<void> {
  const res = await fetch('/api/me/subscription', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`subscription patch failed: ${res.status}`);
}

export function OnboardClient() {
  const router = useRouter();
  const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const { addSigners } = useSigners();
  const me = useMe();

  const [leverageMultiplier, setLeverageMultiplier] = useState(1);
  const [maxPositionUsd, setMaxPositionUsd] = useState(25);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const embeddedWallet = useMemo(
    () => wallets.find((w) => w.walletClientType === 'privy'),
    [wallets]
  );

  const alreadyGranted = !!me.subscription?.sessionSignerGranted;

  const step: Step = useMemo(() => {
    if (!authenticated || !embeddedWallet) return 'connect';
    return alreadyGranted ? 'update' : 'grant';
  }, [authenticated, embeddedWallet, alreadyGranted]);

  // Redirect if fully onboarded
  useEffect(() => {
    if (step === 'update' && me.subscription?.active) {
      router.replace('/me');
    }
  }, [step, me.subscription?.active, router]);

  const handleSave = async (): Promise<void> => {
    if (!embeddedWallet || !SIGNER_ID) {
      setError('embedded wallet or signer id not available');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (!alreadyGranted) {
        // First-time grant: save prefs, register signer, then mark active
        await patchSubscription({ leverageMultiplier, maxPositionUsd });
        await addSigners({
          address: embeddedWallet.address,
          signers: [{ signerId: SIGNER_ID, policyIds: [] }],
        });
        await patchSubscription({
          leverageMultiplier,
          maxPositionUsd,
          sessionSignerGranted: true,
          active: true,
        });
      } else {
        // Signer already registered — only update preferences, never call addSigners again
        await patchSubscription({ leverageMultiplier, maxPositionUsd, active: true });
      }
      await me.refresh();
      router.push('/me');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Shell>
      <div className="mx-auto max-w-2xl space-y-6 px-6 py-12">
        <header>
          <div className="font-mono text-[10px] uppercase tracking-wider text-accent">
            onboarding
          </div>
          <h1 className="mt-2 font-mono text-3xl font-bold tracking-tight">
            Enable copy-trading
          </h1>
          <p className="mt-2 text-text-secondary">
            NeuroDegen mirrors the agent&apos;s entries on your Privy wallet. You stay in control of your funds. Revoke access any time.
          </p>
        </header>

        {!ready && <Card><CardBody>loading Privy…</CardBody></Card>}

        {ready && step === 'connect' && (
          <Card>
            <CardBody>
              <p className="font-mono text-sm">Connect first using the button in the top-right.</p>
            </CardBody>
          </Card>
        )}

        {ready && step !== 'connect' && (
          <Card>
            <CardHeader>
              <CardTitle>Copy-trade preferences</CardTitle>
              <Badge tone={me.subscription?.sessionSignerGranted ? 'green' : 'yellow'}>
                {me.subscription?.sessionSignerGranted ? 'signer granted' : 'not granted'}
              </Badge>
            </CardHeader>
            <CardBody className="space-y-6">
              <PreferenceRow
                label="Leverage multiplier"
                hint="1.0 = match agent exactly. Capped at 2.0."
                value={leverageMultiplier}
                min={0.1}
                max={2}
                step={0.1}
                onChange={setLeverageMultiplier}
                suffix="x"
              />
              <PreferenceRow
                label="Max position size (USDT)"
                hint="Hard ceiling per mirror. Trades exceeding this size get clamped."
                value={maxPositionUsd}
                min={5}
                max={500}
                step={5}
                onChange={setMaxPositionUsd}
                suffix=" USDT"
              />

              {error && (
                <div className="rounded border border-accent-red/40 bg-accent-red/10 p-3 font-mono text-xs text-accent-red">
                  {error}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Button variant="primary" onClick={handleSave} disabled={saving}>
                  {saving
                    ? (alreadyGranted ? 'saving…' : 'granting…')
                    : (alreadyGranted ? 'Save preferences' : 'Grant signer + enable copy-trade')}
                </Button>
                <Button variant="ghost" onClick={() => router.push('/me')}>
                  skip for now
                </Button>
              </div>
            </CardBody>
          </Card>
        )}

        {embeddedWallet && (
          <Card>
            <CardHeader>
              <CardTitle>Fund your wallet</CardTitle>
              <Badge tone="blue">BNB Chain · mainnet</Badge>
            </CardHeader>
            <CardBody className="space-y-4">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-text-tertiary">your address</div>
                <div className="mt-1 break-all font-mono text-xs text-text-secondary">
                  {embeddedWallet.address}
                </div>
                <div className="mt-2">
                  <a
                    href={`https://bscscan.com/address/${embeddedWallet.address}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-[10px] uppercase tracking-wider text-accent-blue hover:underline"
                  >
                    view on bscscan →
                  </a>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded border border-border/60 bg-surface/40 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-text-tertiary">for gas</div>
                  <div className="mt-1 font-mono text-sm">~0.01 BNB</div>
                  <div className="mt-1 text-[11px] text-text-tertiary">covers many mirror trades at BSC fees</div>
                </div>
                <div className="rounded border border-border/60 bg-surface/40 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-text-tertiary">for collateral</div>
                  <div className="mt-1 font-mono text-sm">{Math.max(maxPositionUsd * 2, 10)} USDT+</div>
                  <div className="mt-1 text-[11px] text-text-tertiary">2+ × your max position to allow rotations</div>
                </div>
              </div>
              <p className="text-[11px] text-text-tertiary">
                Your keys stay with Privy. NeuroDegen never custodies your funds — the session signer can only submit MYX orders on your behalf.
              </p>
            </CardBody>
          </Card>
        )}
      </div>
    </Shell>
  );
}

