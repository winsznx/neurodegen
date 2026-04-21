interface Partner {
  name: string;
  href: string;
  label: string;
  svg: React.ReactNode;
}

const AMBER = 'hsl(35, 92%, 52%)';
const BNB = 'hsl(46, 100%, 52%)';
const DGRID = 'hsl(155, 70%, 55%)';
const PIEVERSE = 'hsl(330, 78%, 62%)';
const INK = 'hsl(40, 18%, 92%)';

const PARTNERS: Partner[] = [
  {
    name: 'BNB Chain',
    href: 'https://www.bnbchain.org',
    label: 'execution chain',
    svg: (
      <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
        <g fill={BNB}>
          <path d="M8.5 10.5l3.5-3.5 3.5 3.5 2-2L12 3 6.5 8.5zM4 12l2-2 2 2-2 2zM8.5 13.5L12 17l3.5-3.5 2 2L12 21l-5.5-5.5zM16 12l2-2 2 2-2 2zM12 10l2 2-2 2-2-2z" />
        </g>
      </svg>
    ),
  },
  {
    name: 'MYX Finance',
    href: 'https://app.myx.finance',
    label: 'perp execution',
    svg: (
      <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
        <g fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round">
          <path d="M5 6l7 7 7-7M5 18l7-7 7 7" />
        </g>
      </svg>
    ),
  },
  {
    name: 'DGrid',
    href: 'https://dgrid.ai',
    label: 'multi-model gateway',
    svg: (
      <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
        <g fill="none" stroke={DGRID} strokeWidth="1.6">
          <path d="M12 3L3 20h18z" />
          <path d="M12 3v17M3 20l9-10M21 20l-9-10" opacity="0.7" />
        </g>
      </svg>
    ),
  },
  {
    name: 'Pieverse',
    href: 'https://www.pieverse.io',
    label: 'agent skill store',
    svg: (
      <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
        <g fill={PIEVERSE}>
          <circle cx="7" cy="8" r="1.6" />
          <circle cx="12" cy="6" r="1.6" />
          <circle cx="17" cy="8" r="1.6" />
          <path d="M12 10c-3.2 0-5.5 2.3-5.5 5 0 2 1.5 3.5 3.5 3.5.8 0 1.4-.3 2-.7.6.4 1.2.7 2 .7 2 0 3.5-1.5 3.5-3.5 0-2.7-2.3-5-5.5-5z" />
        </g>
      </svg>
    ),
  },
];

export function PartnerLogos() {
  return (
    <section className="mx-auto max-w-340 px-6 pb-16 md:px-10">
      <div className="flex items-center gap-3 font-mono text-[9px] uppercase tracking-[0.18em] text-text-tertiary">
        <span aria-hidden className="h-px flex-1 bg-border" />
        <span>powered by</span>
        <span aria-hidden className="h-px flex-1 bg-border" />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border md:grid-cols-4">
        {PARTNERS.map((p) => (
          <a
            key={p.name}
            href={p.href}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-3 bg-surface/40 px-5 py-4 transition-colors hover:bg-surface"
          >
            <span
              className="grid size-9 shrink-0 place-items-center rounded-sm border border-border-strong bg-background/60"
              style={{ boxShadow: `inset 0 0 0 1px ${AMBER}20` }}
            >
              {p.svg}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-mono text-sm text-text-primary transition-colors group-hover:text-accent">
                {p.name}
              </span>
              <span className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary">
                {p.label}
              </span>
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
