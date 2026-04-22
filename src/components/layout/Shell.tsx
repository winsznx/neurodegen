import type { ReactNode } from 'react';
import { NavBar } from './NavBar';
import { AppBackground } from './AppBackground';

interface ShellProps {
  children: ReactNode;
  backgroundVariant?: 'app' | 'none';
}

export function Shell({ children, backgroundVariant = 'app' }: ShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {backgroundVariant === 'app' ? <AppBackground /> : null}
      <NavBar />
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-6 py-4 font-mono text-[11px] text-text-tertiary">
          <span>
            neurodegen v1.0.0 · four.meme ai sprint · bnb chain
          </span>
          <span>agent is a demonstration, not a trading strategy</span>
        </div>
      </footer>
    </div>
  );
}
