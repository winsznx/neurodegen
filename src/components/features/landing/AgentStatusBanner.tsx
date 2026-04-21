'use client';

import { useAgentStatus } from '@/hooks/useAgentStatus';
import { Badge } from '@/components/ui';
import { cn } from '@/lib/utils/cn';

export function AgentStatusBanner() {
  const { data, loading, error } = useAgentStatus();

  const running = data?.status === 'running';
  const tone = error ? 'red' : running ? 'green' : 'yellow';
  const label = error ? 'disconnected' : loading ? 'loading' : running ? 'running' : 'stopped';

  const lastCycleDisplay = data?.lastCycleAt
    ? `${Math.max(1, Math.round((Date.now() - data.lastCycleAt) / 1000))}s ago`
    : '—';

  return (
    <div className="border-y border-border bg-surface/40">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-4 font-mono text-xs">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'inline-flex size-2 rounded-full animate-pulse-dot',
              error ? 'bg-accent-red' : running ? 'bg-accent-green' : 'bg-accent-yellow'
            )}
          />
          <span className="uppercase tracking-wider text-text-secondary">agent</span>
          <Badge tone={tone}>{label}</Badge>
        </div>

        <dl className="flex flex-wrap items-center gap-x-6 gap-y-1 text-text-secondary">
          <div className="flex items-center gap-2">
            <dt className="text-text-muted uppercase tracking-wider">regime</dt>
            <dd className="text-text-primary">{data?.regime ?? '—'}</dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="text-text-muted uppercase tracking-wider">cycles</dt>
            <dd className="text-text-primary">{data?.cycleCount ?? 0}</dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="text-text-muted uppercase tracking-wider">open positions</dt>
            <dd className="text-text-primary">{data?.openPositions ?? 0}</dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="text-text-muted uppercase tracking-wider">last cycle</dt>
            <dd className="text-text-primary">{lastCycleDisplay}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
