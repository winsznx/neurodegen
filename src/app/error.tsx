'use client';

import { useEffect } from 'react';
import Link from 'next/link';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: ErrorProps): React.ReactElement {
  useEffect(() => {
    console.error('[ui] root error boundary tripped:', error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-6 py-16 text-center">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-tertiary">
        something went sideways
      </p>
      <h1 className="mt-3 font-display text-3xl text-text-primary">
        The page hit a snag.
      </h1>
      <p className="mt-3 max-w-prose text-text-secondary">
        Refresh to retry, or jump to the live committee dashboard. It stays online even
        when individual pages misbehave.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-md border border-border bg-surface px-4 py-2 text-sm text-text-primary transition-colors hover:border-accent hover:text-accent"
        >
          Try again
        </button>
        <Link
          href="/agent"
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          Live dashboard ↗
        </Link>
      </div>
      {error.digest ? (
        <p className="mt-8 font-mono text-[10px] text-text-tertiary">ref {error.digest}</p>
      ) : null}
    </main>
  );
}
