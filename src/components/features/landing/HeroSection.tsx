import Link from 'next/link';
import { Button } from '@/components/ui';
import { PipelineDiagram } from './PipelineDiagram';

export function HeroSection() {
  return (
    <>
      <header className="mx-auto max-w-340 px-6 pt-16 pb-8 text-center md:px-10 md:pt-24">
        <span className="inline-flex items-center gap-2.5 rounded-full border border-accent-border/50 bg-accent-deep px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-accent-soft">
          <span className="size-1.25 rounded-full bg-accent" style={{ boxShadow: '0 0 6px hsl(35 92% 52%)' }} />
          four.meme ai sprint · bnb chain
        </span>

        <h1 className="font-display mx-auto mt-7 max-w-245 text-[44px] font-medium leading-[0.98] tracking-[-0.035em] md:text-[72px] lg:text-[88px]">
          The agent you <em className="not-italic text-accent">don&apos;t</em> have to <em className="not-italic text-accent">trust</em>.
        </h1>

        <p className="mx-auto mt-7 max-w-155 text-sm leading-[1.65] text-text-secondary md:text-[15px]">
          Every AI decision is committed on-chain <strong className="font-medium text-text-primary">before</strong> the trade.
          Every trade is revealed on-chain <strong className="font-medium text-text-primary">after</strong> confirmation.
          Verify any decision on BscScan — no dashboard, no database, no trust required.
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link href="/live"><Button variant="primary">View live dashboard →</Button></Link>
          <Link
            href="https://bscscan.com/address/0xe21f5ebec3f098c744c1e35db0c9338d6b717dc4#events"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="secondary">Verify on BscScan ↗</Button>
          </Link>
          <Link
            href="https://github.com/winsznx/neurodegen/blob/main/SKILL.md"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="ghost">Read the skill</Button>
          </Link>
        </div>
      </header>

      <section className="mx-auto mt-16 max-w-340 px-6 md:px-10">
        <div className="relative overflow-hidden rounded-md border border-border bg-surface">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: 'radial-gradient(60% 80% at 50% 50%, hsl(35 92% 52% / 0.035), transparent 70%)' }}
          />
          <Corner placement="tl" />
          <Corner placement="tr" />
          <Corner placement="bl" />
          <Corner placement="br" />

          <div className="relative z-[3] flex items-center gap-[18px] px-5 pt-4 text-[9px] uppercase tracking-[0.12em] text-text-tertiary">
            <LegendItem color="hot">hot path</LegendItem>
            <LegendItem>data in / out</LegendItem>
            <LegendItem color="bind">crypto binding</LegendItem>
          </div>
          <div className="absolute right-5 top-4 z-[3] font-mono text-[9px] uppercase tracking-[0.12em] text-text-tertiary">
            pipeline · v2 · keccak256
          </div>

          <div className="relative px-4 pt-14 pb-6 md:px-8">
            <PipelineDiagram />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-y-2 border-t border-border px-5 py-3.5 font-mono text-[10px] uppercase tracking-[0.12em] text-text-tertiary">
            <span>contract · 0xe21f…7dc4</span>
            <span>events · ReasoningCommitted / ExecutionRevealed</span>
            <span>chain · bnb · 56</span>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-12 grid max-w-340 grid-cols-2 gap-6 px-6 pb-20 md:grid-cols-4 md:px-10">
        {STATS.map((s) => (
          <div key={s.label} className="border-t border-border pt-4">
            <div className="font-display text-[34px] leading-none tracking-[-0.03em] text-text-primary">
              {s.value}
              {s.accent && <span className="text-accent">{s.accent}</span>}
            </div>
            <div className="mt-2.5 font-mono text-[9px] uppercase tracking-[0.14em] text-text-tertiary">
              {s.label}
            </div>
          </div>
        ))}
      </section>
    </>
  );
}

function Corner({ placement }: { placement: 'tl' | 'tr' | 'bl' | 'br' }) {
  const map: Record<string, string> = {
    tl: '-top-px -left-px border-r-0 border-b-0',
    tr: '-top-px -right-px border-l-0 border-b-0',
    bl: '-bottom-px -left-px border-r-0 border-t-0',
    br: '-bottom-px -right-px border-l-0 border-t-0',
  };
  return <span aria-hidden className={`pointer-events-none absolute size-2.5 border border-border-strong ${map[placement]}`} />;
}

function LegendItem({ children, color }: { children: React.ReactNode; color?: 'hot' | 'bind' }) {
  const cls =
    color === 'hot'
      ? 'h-[2px] w-[18px] bg-accent'
      : color === 'bind'
      ? 'h-px w-[18px] bg-[linear-gradient(90deg,var(--color-accent)_50%,transparent_0)] bg-[length:4px_1px] bg-repeat-x'
      : 'h-px w-[18px] bg-text-tertiary';
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className={cls} />
      {children}
    </span>
  );
}

const STATS = [
  { value: '2', accent: '-step', label: 'commit → reveal' },
  { value: '3', label: 'dgrid formats' },
  { value: '3', label: 'llms per cycle' },
  { value: 'BSC', label: 'on-chain proof' },
];
