import { Shell } from '@/components/layout/Shell';
import { HeroSection } from '@/components/features/landing/HeroSection';
import { AgentStatusBanner } from '@/components/features/landing/AgentStatusBanner';
import { ArchitectureDiagram } from '@/components/features/landing/ArchitectureDiagram';

export default function HomePage() {
  return (
    <Shell>
      <HeroSection />
      <AgentStatusBanner />
      <ArchitectureDiagram />

      <section className="border-b border-border">
        <div className="mx-auto max-w-[1280px] px-6 py-24">
          <div className="mb-12">
            <div className="font-mono text-xs uppercase tracking-wider text-accent-green">
              Bounty fit
            </div>
            <h2 className="mt-3 font-mono text-3xl font-bold tracking-tight md:text-4xl">
              One loop. Four protocols.
            </h2>
          </div>

          <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-2">
            {[
              {
                name: 'MYX Finance',
                amount: '$5,000 USDT',
                hook: 'Real createIncreaseOrder calls through the official SDK. Full keeper lifecycle. Per-user copy-trade mirrors.',
              },
              {
                name: 'DGrid',
                amount: '$3,000 credits',
                hook: 'Three providers (Claude Sonnet 4.6, GPT-4o, DeepSeek v3.2) across two endpoint formats. Anthropic-direct fallback keeps cognition alive.',
              },
              {
                name: 'Pieverse',
                amount: '$2,000 USDT',
                hook: 'x402 HTTP endpoint with on-chain pieUSD verification. ClawHub-ready SKILL.md bundled.',
              },
              {
                name: 'Main Sprint',
                amount: 'up to $12,000',
                hook: 'Commit-reveal attestation on BSC. Every trade carries a cryptographic link from reasoning to execution. Verify at /proof.',
              },
            ].map((b) => (
              <div key={b.name} className="bg-surface/40 p-6">
                <div className="flex items-baseline justify-between">
                  <h3 className="font-mono text-lg font-semibold text-text-primary">{b.name}</h3>
                  <span className="font-mono text-xs text-accent-green">{b.amount}</span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-text-secondary">{b.hook}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-[1280px] px-6 py-24 text-center">
          <h2 className="font-mono text-3xl font-bold tracking-tight md:text-4xl">
            <span className="text-text-muted">Watch it</span> reason.
            <br />
            <span className="text-text-muted">Watch it</span> <span className="text-accent-green">execute</span>.
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-text-secondary">
            The live dashboard shows every event, every model call, every position — in real time via SSE.
          </p>
          <a
            href="/live"
            className="mt-10 inline-flex items-center gap-2 rounded bg-accent-green px-6 py-3 font-mono text-sm font-medium text-background transition-colors hover:bg-accent-green/90"
          >
            Open live dashboard →
          </a>
        </div>
      </section>
    </Shell>
  );
}
