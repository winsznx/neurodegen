'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { useAgentStatus } from '@/hooks/useAgentStatus';
import { ConnectButton } from '@/components/features/auth/ConnectButton';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard' },
  { href: '/live', label: 'Live' },
  { href: 'https://github.com/winsznx/neurodegen/blob/main/SKILL.md', label: 'Skill', external: true },
];

export function NavBar() {
  const pathname = usePathname();
  const status = useAgentStatus();

  const running = status.data?.status === 'running';
  const cycleLabel = running
    ? `running · cycle ${String(status.data?.cycleCount ?? 0).padStart(4, '0')}`
    : status.error
    ? 'disconnected'
    : status.data?.status ?? 'stopped';

  return (
    <nav className="relative z-10">
      <div className="mx-auto flex max-w-340 items-center justify-between gap-6 px-6 py-5 md:px-10 md:py-5.5">
        <Link href="/" className="inline-flex items-center gap-2.5 text-[13px]">
          <span
            className="relative grid size-6.5 place-items-center rounded-sm border border-border-strong bg-surface"
            aria-hidden
          >
            <span
              className="absolute inset-1.25 rounded-[1px] bg-accent"
              style={{ boxShadow: '0 0 10px hsl(35 92% 52% / 0.6)' }}
            />
          </span>
          <span className="font-mono text-text-primary">
            neurodegen<span className="text-text-tertiary">.agent</span>
          </span>
        </Link>

        <div className="flex items-center gap-5 text-[12px] md:gap-7">
          {NAV_ITEMS.map((item) =>
            item.external ? (
              <a
                key={item.href}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-text-secondary transition-colors hover:text-text-primary"
              >
                {item.label}
              </a>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'font-mono transition-colors',
                  pathname === item.href ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary'
                )}
              >
                {item.label}
              </Link>
            )
          )}
          <Link href="/live" className="hidden items-center gap-1.5 font-mono text-text-primary md:inline-flex">
            <span
              className="size-1.5 rounded-full bg-positive animate-blink"
              style={{ boxShadow: '0 0 0 3px hsl(140 60% 55% / 0.2)' }}
              aria-hidden
            />
            live
          </Link>

          <span
            className={cn(
              'hidden items-center gap-1.5 rounded-[3px] border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] md:inline-flex',
              running
                ? 'border-accent-border/40 bg-accent-deep text-accent-soft'
                : 'border-border-strong bg-surface text-text-secondary'
            )}
          >
            <span className={cn('size-1.5', running ? 'bg-accent' : 'bg-current')} />
            {cycleLabel}
          </span>

          <ConnectButton />
        </div>
      </div>
    </nav>
  );
}
