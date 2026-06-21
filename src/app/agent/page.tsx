import { Shell } from '@/components/layout/Shell';
import { AgentDashboard } from '@/components/features/agent/AgentDashboard';
import { OnChainActivityFeed } from '@/components/features/agent/OnChainActivityFeed';

export const dynamic = 'force-dynamic';

const AGENT_ADDRESS: `0x${string}` =
  (process.env.TWAK_AGENT_WALLET_ADDRESS as `0x${string}` | undefined) ??
  '0x1a59eD9BB4890a8ac02746BFC00EDeCBBBe375fF';

export default function AgentPage() {
  return (
    <Shell>
      <section className="mx-auto max-w-6xl px-6 py-10">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-tertiary">
            committee live
          </p>
          <h1 className="mt-2 font-display text-3xl text-text-primary">
            Three analysts deliberating in public.
          </h1>
        </div>
        <AgentDashboard />

        {/* On-chain activity — visible even when committee is idle in quiet regime */}
        <div className="mt-12">
          <OnChainActivityFeed agentAddress={AGENT_ADDRESS} limit={15} />
        </div>
      </section>
    </Shell>
  );
}
