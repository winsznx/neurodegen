import { Shell } from '@/components/layout/Shell';
import { LiveDashboard } from './LiveDashboard';
import { getLatestMetrics } from '@/lib/queries/metrics';
import { getRecentReasoningChains } from '@/lib/queries/reasoningChains';
import type { ReasoningGraph, RegimeLabel } from '@/types/cognition';
import type { AggregateMetrics } from '@/types/perception';

export const dynamic = 'force-dynamic';

async function loadInitialData(): Promise<{
  metrics: AggregateMetrics | null;
  latestReasoning: ReasoningGraph | null;
  regime: RegimeLabel;
}> {
  try {
    const [metrics, chains] = await Promise.all([
      getLatestMetrics().catch(() => null),
      getRecentReasoningChains(1).catch(() => []),
    ]);
    const latestReasoning = chains[0] ?? null;
    return {
      metrics,
      latestReasoning,
      regime: latestReasoning?.regime ?? 'quiet',
    };
  } catch {
    return { metrics: null, latestReasoning: null, regime: 'quiet' };
  }
}

export default async function LivePage() {
  const initial = await loadInitialData();
  return (
    <Shell>
      <LiveDashboard initial={initial} />
    </Shell>
  );
}
