import Link from 'next/link';

export default function NotFound(): React.ReactElement {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-6 py-16 text-center">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-tertiary">
        404
      </p>
      <h1 className="mt-3 font-display text-3xl text-text-primary">
        No reasoning was committed to this route.
      </h1>
      <p className="mt-3 max-w-prose text-text-secondary">
        If you were looking for a specific trade proof, check the URL. Proof pages live at
        <span className="font-mono text-text-primary">{' /proof/<twakTxHash>'}</span>.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="rounded-md border border-border bg-surface px-4 py-2 text-sm text-text-primary transition-colors hover:border-accent hover:text-accent"
        >
          Home
        </Link>
        <Link
          href="/journal"
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          Browse sessions ↗
        </Link>
      </div>
    </main>
  );
}
