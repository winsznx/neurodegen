import Link from 'next/link';
import { Button } from '@/components/ui';

export function HeroSection() {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div className="absolute inset-0 grid-bg opacity-40" aria-hidden />
      <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-accent-green/60 to-transparent" aria-hidden />

      <div className="relative mx-auto max-w-7xl px-6 pt-24 pb-32">
        <div className="mb-10 inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-3 py-1 font-mono text-[11px] text-text-secondary">
          <span className="size-1.5 rounded-full bg-accent-green animate-pulse-dot" />
          <span className="uppercase tracking-wider">four.meme ai sprint · bnb chain</span>
        </div>

        <h1 className="max-w-4xl font-mono text-[44px] font-bold leading-[1.05] tracking-tight md:text-[72px]">
          The agent you <span className="text-text-muted">don&apos;t</span>
          <br />
          have to <span className="text-accent-green">trust</span>.
        </h1>

        <p className="mt-8 max-w-2xl text-lg leading-relaxed text-text-secondary">
          Every AI decision is committed on-chain before the trade. Every trade is revealed
          on-chain after confirmation. Verify any decision on BscScan without touching our
          dashboard.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Link href="/live">
            <Button variant="primary">View live dashboard →</Button>
          </Link>
          <Link
            href="https://bscscan.com/address/0xe21f5ebec3f098c744c1e35db0c9338d6b717dc4#events"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="secondary">Verify on BscScan</Button>
          </Link>
          <Link
            href="https://github.com/winsznx/neurodegen/blob/main/SKILL.md"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="ghost">Read the skill</Button>
          </Link>
        </div>

        <div className="mt-16 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-4">
          {[
            { label: 'Commit → Reveal', value: '2-step' },
            { label: 'DGrid formats', value: '3' },
            { label: 'LLMs per cycle', value: '3' },
            { label: 'On-chain proof', value: 'BSC' },
          ].map((stat) => (
            <div key={stat.label} className="bg-surface/50 px-6 py-5">
              <div className="font-mono text-3xl font-bold text-text-primary">{stat.value}</div>
              <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-text-muted">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
