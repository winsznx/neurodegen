import type { ReactNode } from 'react';
import { NavBar } from './NavBar';

interface ShellProps {
  children: ReactNode;
}

export function Shell({ children }: ShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
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
