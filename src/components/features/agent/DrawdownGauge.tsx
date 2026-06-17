'use client';

const ALERT_PCT = 0.15;
const DEFENSIVE_PCT = 0.2;
const HALT_PCT = 0.25;

function tierFor(drawdown: number): { label: string; color: string; bg: string } {
  if (drawdown >= HALT_PCT) return { label: 'HALT', color: 'text-red-400', bg: 'bg-red-400' };
  if (drawdown >= DEFENSIVE_PCT)
    return { label: 'DEFENSIVE', color: 'text-accent-soft', bg: 'bg-accent' };
  if (drawdown >= ALERT_PCT)
    return { label: 'ALERT', color: 'text-accent-soft', bg: 'bg-accent' };
  return { label: 'NORMAL', color: 'text-positive', bg: 'bg-positive' };
}

export function DrawdownGauge({ drawdownPct }: { drawdownPct: number }) {
  const tier = tierFor(drawdownPct);
  // Scale 0% to 30% disqualification onto the 0-100% bar
  const fillPct = Math.min(100, (drawdownPct / 0.3) * 100);
  return (
    <div className="rounded-md border border-border bg-surface p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-tertiary">Drawdown</p>
      <p className={`mt-1 font-display text-2xl ${tier.color}`}>
        {(drawdownPct * 100).toFixed(2)}%
      </p>
      <p className={`mt-1 font-mono text-[10px] ${tier.color}`}>{tier.label}</p>
      <div className="mt-3 relative h-1.5 overflow-hidden rounded-sm bg-background">
        <div
          className={`h-full transition-all ${tier.bg}`}
          style={{ width: `${fillPct}%` }}
        />
        {/* tier markers at 15/20/25/30% */}
        {[ALERT_PCT, DEFENSIVE_PCT, HALT_PCT, 0.3].map((threshold) => (
          <div
            key={threshold}
            className="absolute top-0 h-1.5 w-px bg-text-tertiary/60"
            style={{ left: `${(threshold / 0.3) * 100}%` }}
            aria-label={`${(threshold * 100).toFixed(0)}%`}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[8px] text-text-tertiary">
        <span>0</span>
        <span>15</span>
        <span>20</span>
        <span>25</span>
        <span>30%</span>
      </div>
    </div>
  );
}
