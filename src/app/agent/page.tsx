import { Shell } from '@/components/layout/Shell';
import { AgentDashboard } from '@/components/features/agent/AgentDashboard';

export const dynamic = 'force-dynamic';

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
      </section>
    </Shell>
  );
}
