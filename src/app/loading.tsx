export default function Loading(): React.ReactElement {
  return (
    <main className="mx-auto flex min-h-[40vh] max-w-2xl flex-col items-center justify-center px-6 py-16">
      <div className="flex items-center gap-3">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent" />
        <p className="font-mono text-[12px] uppercase tracking-[0.2em] text-text-tertiary">
          loading
        </p>
      </div>
    </main>
  );
}
