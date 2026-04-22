import type { ReactNode } from 'react';
import { NavBar } from './NavBar';
import { AppBackground } from './AppBackground';

interface ShellProps {
  children: ReactNode;
  backgroundVariant?: 'app' | 'none';
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
      <path d="M18.901 2H21.98l-6.728 7.69L23.166 22h-6.194l-4.85-7.037L5.965 22H2.884l7.197-8.227L.5 2h6.352l4.383 6.361L18.901 2Zm-1.082 18.131h1.706L5.927 3.772H4.096L17.819 20.13Z" />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
      <path d="M21.944 4.665c.322-1.502-1.182-2.745-2.563-2.1L2.81 10.093c-1.502.683-1.382 2.865.2 3.387l3.427 1.122 1.323 4.245c.442 1.422 2.224 1.864 3.267.803l1.924-1.944 3.788 2.784c1.303.962 3.166.24 3.487-1.403l1.718-14.422ZM8.379 13.8l9.498-6.171a.75.75 0 1 1 .823 1.254l-8.315 5.41-1.203 2.947-.803-3.44Z" />
    </svg>
  );
}

function FooterLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      className="inline-flex items-center gap-1.5 rounded-full border border-border/80 px-2.5 py-1 text-text-secondary transition hover:border-accent-yellow/50 hover:text-text-primary"
    >
      {children}
    </a>
  );
}

export function Shell({ children, backgroundVariant = 'app' }: ShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {backgroundVariant === 'app' ? <AppBackground /> : null}
      <NavBar />
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-4 font-mono text-[11px] text-text-tertiary">
          <div className="flex flex-col gap-1">
            <span>neurodegen v1.0.0 · four.meme ai sprint · bnb chain</span>
            <span>agent is a demonstration, not a trading strategy</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.18em] text-text-muted">contact</span>
            <FooterLink href="https://x.com/winsznx" label="NeuroDegen builder on X">
              <XIcon />
              <span>@winsznx</span>
            </FooterLink>
            <FooterLink href="https://t.me/winszn_x" label="NeuroDegen builder on Telegram">
              <TelegramIcon />
              <span>@winszn_x</span>
            </FooterLink>
          </div>
        </div>
      </footer>
    </div>
  );
}
