'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLogin, useLogout, useWallets, usePrivy, getAccessToken } from '@privy-io/react-auth';
import { Button } from '@/components/ui';

async function registerSession(
  walletAddress: `0x${string}`,
  walletId: string | null,
  email?: string | null
): Promise<void> {
  const authToken = await getAccessToken();
  if (!authToken) throw new Error('no auth token');
  const res = await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ authToken, walletAddress, walletId, email }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { detail?: string; error?: string } | null;
    throw new Error(body?.detail ?? body?.error ?? `session registration failed: ${res.status}`);
  }
}

export function ConnectButton() {
  const router = useRouter();
  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const [sessionError, setSessionError] = useState<string | null>(null);

  const embeddedWallet = useMemo(
    () => wallets.find((w) => w.walletClientType === 'privy'),
    [wallets]
  );

  const { login } = useLogin({
    onComplete: async ({ user: privyUser }) => {
      const wallet = privyUser.wallet;
      if (!wallet) return;
      const walletId = (() => {
        const linked = (privyUser as unknown as { linkedAccounts?: unknown[] }).linkedAccounts;
        if (!Array.isArray(linked)) return null;
        const embedded = linked.find((entry): entry is { type: string; walletClientType?: string; id?: string } => {
          if (typeof entry !== 'object' || entry === null) return false;
          const e = entry as { type?: string; walletClientType?: string };
          return e.type === 'wallet' && e.walletClientType === 'privy';
        });
        return embedded?.id ?? null;
      })();
      try {
        setSessionError(null);
        await registerSession(
          wallet.address as `0x${string}`,
          walletId,
          privyUser.email?.address ?? null
        );
        router.push('/onboard');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[connect] session registration failed:', msg);
        setSessionError(msg);
      }
    },
  });

  const { logout } = useLogout({
    onSuccess: async () => {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => null);
      setSessionError(null);
      router.push('/');
    },
  });

  if (!ready) return <Button variant="ghost" disabled>connecting…</Button>;

  if (!authenticated) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button variant="primary" onClick={() => login()} className="whitespace-nowrap">
          Connect to copy-trade
        </Button>
        {sessionError && (
          <span className="max-w-55 text-right font-mono text-[10px] text-negative">
            {sessionError}
          </span>
        )}
      </div>
    );
  }

  const displayAddress = embeddedWallet?.address ?? user?.wallet?.address;
  const short = displayAddress ? `${displayAddress.slice(0, 6)}…${displayAddress.slice(-4)}` : 'me';

  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" onClick={() => router.push('/me')} className="whitespace-nowrap">
        {short}
      </Button>
      <Button variant="ghost" onClick={() => logout()} className="hidden sm:inline-flex">
        disconnect
      </Button>
    </div>
  );
}
