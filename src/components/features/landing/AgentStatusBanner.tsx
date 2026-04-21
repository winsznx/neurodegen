'use client';

import { useEffect, useState } from 'react';
import { useAgentStatus } from '@/hooks/useAgentStatus';
import { cn } from '@/lib/utils/cn';

export function AgentStatusBanner() {
  const { data, loading, error } = useAgentStatus();
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const interval = setInterval(tick, 1000);
    queueMicrotask(tick);
    return () => clearInterval(interval);
  }, []);

  const running = data?.status === 'running';
  const dotClass = error ? 'bg-negative' : running ? 'bg-accent' : 'bg-text-tertiary';
  const label = error ? 'disconnected' : loading ? 'loading' : running ? 'running' : 'stopped';

  const lastCycleDisplay = data?.lastCycleAt && now !== null
    ? `${Math.max(1, Math.round((now - data.lastCycleAt) / 1000))}s`
    : '—';

  const stats: { label: string; value: string | number }[] = [
    { label: 'regime', value: data?.regime ?? '—' },
    { label: 'cycles', value: data?.cycleCount ?? 0 },
    { label: 'open positions', value: data?.openPositions ?? 0 },
    { label: 'last cycle', value: lastCycleDisplay },
  ];

  return (
    <div className="border-t border-border bg-background">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-10 gap-y-3 px-6 py-3.5 font-mono text-[11px]">
        <div className="flex items-center gap-2 uppercase tracking-wider text-text-secondary">
          <span className={cn('inline-flex size-1.5 rounded-full animate-pulse-dot', dotClass)} />
          <span>agent</span>
          <span className="text-text-primary">{label}</span>
        </div>

        <dl className="flex flex-wrap items-center gap-x-10 gap-y-2">
          {stats.map((s) => (
            <div key={s.label} className="flex items-center gap-2">
              <dt className="uppercase tracking-wider text-text-tertiary">{s.label}</dt>
              <dd className="text-text-primary">{s.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
