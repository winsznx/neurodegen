'use client';

import type { ReactNode } from 'react';
import { PrivyProvider } from '@privy-io/react-auth';
import { bsc } from 'viem/chains';

interface PrivyAuthProviderProps {
  children: ReactNode;
}

export function PrivyAuthProvider({ children }: PrivyAuthProviderProps) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? '';
  if (!appId) {
    return <>{children}</>;
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        appearance: {
          theme: 'dark',
          accentColor: '#22c55e',
          logo: '/icon',
        },
        defaultChain: bsc,
        supportedChains: [bsc],
        embeddedWallets: {
          ethereum: { createOnLogin: 'all-users' },
        },
        loginMethods: ['email', 'wallet'],
      }}
    >
      {children}
    </PrivyProvider>
  );
}
