'use client';

const REGIME_LABEL: Record<string, string> = {
  quiet: 'QUIET',
  active: 'ACTIVE',
  momentum: 'MOMENTUM',
  volatile: 'VOLATILE',
  unknown: 'UNKNOWN',
};

const REGIME_COLOR: Record<string, string> = {
  quiet: 'border-text-tertiary/40 bg-text-tertiary/10 text-text-tertiary',
  active: 'border-accent/40 bg-accent/10 text-accent-soft',
  momentum: 'border-positive/40 bg-positive/10 text-positive',
  volatile: 'border-red-400/40 bg-red-400/10 text-red-400',
  unknown: 'border-border bg-surface text-text-tertiary',
};

const REGIME_SUB: Record<string, string> = {
  quiet: 'hibernate · probe-only',
  active: '0.5× position multiplier',
  momentum: '1.0× position multiplier',
  volatile: '0.1× · defensive sizing',
  unknown: 'agent not running',
};

export function RegimeIndicator({ regime, running }: { regime: string; running: boolean }) {
  const key = (regime ?? 'unknown').toLowerCase();
  const color = REGIME_COLOR[key] ?? REGIME_COLOR.unknown;
  return (
    <div className={`rounded-md border p-4 ${color}`}>
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] opacity-70">Regime</p>
      <p className="mt-1 font-display text-2xl">{REGIME_LABEL[key] ?? regime.toUpperCase()}</p>
      <p className="mt-1 font-mono text-[10px] opacity-70">
        {running ? REGIME_SUB[key] ?? '' : 'agent stopped'}
      </p>
    </div>
  );
}
