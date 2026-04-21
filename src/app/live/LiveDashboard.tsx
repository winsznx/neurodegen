'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PerceptionEvent, AggregateMetrics as MetricsType } from '@/types/perception';
import type { ReasoningGraph, RegimeLabel } from '@/types/cognition';
import { useSSE } from '@/hooks/useSSE';
import { usePositions } from '@/hooks/usePositions';
import { AggregateMetrics } from '@/components/features/perception/AggregateMetrics';
import { EventFeed } from '@/components/features/perception/EventFeed';
import { ReasoningChainView } from '@/components/features/cognition/ReasoningChainView';
import { PositionTable } from '@/components/features/execution/PositionTable';
import { RiskGauge } from '@/components/features/execution/RiskGauge';
import { Badge } from '@/components/ui';
import { BASE_POSITION_SIZE_USD, MAX_CONCURRENT_POSITIONS, MAX_TOTAL_EXPOSURE_RATIO } from '@/config/risk';

interface InitialData {
  metrics: MetricsType | null;
  latestReasoning: ReasoningGraph | null;
  regime: RegimeLabel;
}

export function LiveDashboard({ initial }: { initial: InitialData }) {
  const [events, setEvents] = useState<PerceptionEvent[]>([]);
  const [metrics, setMetrics] = useState<MetricsType | null>(initial.metrics);
  const [latestReasoning, setLatestReasoning] = useState<ReasoningGraph | null>(initial.latestReasoning);
  const { positions } = usePositions('open');

  const maxExposure = useMemo(
    () => MAX_CONCURRENT_POSITIONS * BASE_POSITION_SIZE_USD * MAX_TOTAL_EXPOSURE_RATIO,
    []
  );
  const currentExposure = useMemo(
    () => positions.reduce((sum, p) => sum + p.collateralUsd * p.leverage, 0),
    [positions]
  );

  const handlers = useMemo(
    () => ({
      perception_event: (evt: MessageEvent) => {
        const event = JSON.parse(evt.data) as PerceptionEvent;
        setEvents((prev) => [event, ...prev].slice(0, 100));
      },
      metrics_update: (evt: MessageEvent) => {
        setMetrics(JSON.parse(evt.data) as MetricsType);
      },
      reasoning_complete: (evt: MessageEvent) => {
        setLatestReasoning(JSON.parse(evt.data) as ReasoningGraph);
      },
    }),
    []
  );

  const sseState = useSSE('/api/events/stream', handlers);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-mono text-2xl font-bold tracking-tight">Live Dashboard</h1>
          <p className="mt-1 font-mono text-xs text-text-muted">
            real-time perception → cognition → execution · sse stream
          </p>
        </div>
        <Badge tone={sseState.connected ? 'green' : 'red'} dot>
          stream {sseState.connected ? 'live' : sseState.error ? 'error' : 'connecting'}
        </Badge>
      </header>

      <section aria-label="Aggregate metrics">
        <AggregateMetrics metrics={metrics} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <EventFeed events={events} />
        <ReasoningChainView graph={latestReasoning} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <PositionTable positions={positions} />
        <RiskGauge currentExposure={currentExposure} maxExposure={maxExposure} />
      </div>
    </div>
  );
}
