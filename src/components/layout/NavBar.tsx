'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { useAgentStatus } from '@/hooks/useAgentStatus';
import { ConnectButton } from '@/components/features/auth/ConnectButton';

const NAV_ITEMS = [
  { href: '/', label: 'Home' },
  { href: '/live', label: 'Live' },
];

export function NavBar() {
  const pathname = usePathname();
  const status = useAgentStatus();

  const statusColor = status.data?.status === 'running'
    ? 'bg-accent-green'
    : status.error
      ? 'bg-accent-red'
      : 'bg-text-muted';

  return (
    <nav className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1280px] items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="flex size-7 items-center justify-center rounded bg-accent-green/10 font-mono text-[11px] font-bold text-accent-green tracking-tighter">
            ND
          </div>
          <span className="font-mono text-sm font-semibold tracking-tight">
            neurodegen<span className="text-text-muted">.agent</span>
          </span>
        </Link>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'rounded px-3 py-1.5 font-mono text-xs font-medium transition-colors',
                  pathname === item.href
                    ? 'bg-surface text-text-primary'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-2 rounded border border-border bg-surface px-2.5 py-1">
            <span className={cn('size-1.5 rounded-full animate-pulse-dot', statusColor)} />
            <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-text-secondary">
              {status.data?.status ?? 'offline'}
            </span>
          </div>

          <ConnectButton />
        </div>
      </div>
    </nav>
  );
}
