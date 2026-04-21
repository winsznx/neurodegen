'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { useAgentStatus } from '@/hooks/useAgentStatus';
import { ConnectButton } from '@/components/features/auth/ConnectButton';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard' },
  { href: '/live', label: 'Live' },
  { href: '/track-record', label: 'Track record' },
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

  const brand = (
    <Link href="/" className="inline-flex shrink-0 items-center gap-2.5 text-[13px]">
      <span className="relative grid size-6.5 place-items-center rounded-sm border border-border-strong bg-surface" aria-hidden>
        <span className="absolute inset-1.25 rounded-[1px] bg-accent" style={{ boxShadow: '0 0 10px hsl(35 92% 52% / 0.6)' }} />
      </span>
      <span className="font-mono text-text-primary">
        neurodegen<span className="text-text-tertiary">.agent</span>
      </span>
    </Link>
  );

  const navLinks = NAV_ITEMS.map((item) =>
    item.external ? (
      <a
        key={item.href}
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 font-mono text-text-secondary transition-colors hover:text-text-primary"
      >
        {item.label}
      </a>
    ) : (
      <Link
        key={item.href}
        href={item.href}
        className={cn(
          'shrink-0 font-mono transition-colors',
          pathname === item.href ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary'
        )}
      >
        {item.label}
      </Link>
    )
  );

  const liveLink = (
    <Link href="/live" className="inline-flex shrink-0 items-center gap-1.5 font-mono text-text-primary">
      <span
        className="size-1.5 rounded-full bg-positive animate-blink"
        style={{ boxShadow: '0 0 0 3px hsl(140 60% 55% / 0.2)' }}
        aria-hidden
      />
      live
    </Link>
  );

  const cyclePill = (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-[3px] border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] md:px-2.5 md:py-1.5',
        running ? 'border-accent-border/40 bg-accent-deep text-accent-soft' : 'border-border-strong bg-surface text-text-secondary'
      )}
    >
      <span className={cn('size-1.5', running ? 'bg-accent' : 'bg-current')} />
      {cycleLabel}
    </span>
  );

  return (
    <nav className="relative z-10 border-b border-border/40 md:border-b-0">
      <div className="mx-auto hidden max-w-340 items-center justify-between gap-6 px-10 py-5.5 md:flex">
        {brand}
        <div className="flex items-center gap-7 text-[12px]">
          {navLinks}
          {liveLink}
          {cyclePill}
        </div>
        <ConnectButton />
      </div>

      <div className="md:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          {brand}
          <ConnectButton />
        </div>
        <div className="flex items-center gap-4 overflow-x-auto px-4 pb-3 text-[11px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {navLinks}
          {liveLink}
          {cyclePill}
        </div>
      </div>
    </nav>
  );
}
