import Link from 'next/link';

const ATTESTATION_ADDRESS = '0xe21f5ebec3f098c744c1e35db0c9338d6b717dc4';

interface TrustCard {
  index: string;
  title: string;
  body: string;
  cta: { label: string; href: string; external?: boolean };
}

const CARDS: TrustCard[] = [
  {
    index: '01',
    title: 'Reasoning is committed before every trade.',
    body:
      'Each decision produces a keccak256 hash pinned on-chain via the attestation contract. The agent cannot rewrite why it traded after the fact — the hash is public before execution.',
    cta: {
      label: 'View contract on BscScan',
      href: `https://bscscan.com/address/${ATTESTATION_ADDRESS}#events`,
      external: true,
    },
  },
  {
    index: '02',
    title: 'Every trade is publicly attested.',
    body:
      'PositionOpened and PositionClosed events are emitted on BNB Chain for every entry and exit. The track record below is indexed straight from those logs — no back-filling, no edits.',
    cta: { label: 'See the track record', href: '/track-record' },
  },
  {
    index: '03',
    title: 'You control the caps. Revoke any time.',
    body:
      'Mirror the agent with your own Privy-managed wallet. Set leverage, max collateral per trade, minimum confidence. Pause on one click. Keys never leave the TEE; the session signer is always yours to revoke.',
    cta: { label: 'Set up mirroring', href: '/me' },
  },
];

export function WhyTrustThis() {
  return (
    <section className="mx-auto mt-16 max-w-340 px-6 md:px-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-tertiary">
            why you can trust this
          </div>
          <h2 className="font-display mt-2 text-[28px] font-medium leading-tight tracking-[-0.02em] md:text-[40px]">
            Three things this agent cannot <em className="not-italic text-accent">lie</em> about.
          </h2>
        </div>
        <p className="max-w-md font-mono text-[11px] leading-relaxed text-text-secondary">
          No promises of alpha. No backtested returns. The product is auditable execution — a public ledger of what the agent actually saw, decided, and did.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {CARDS.map((card) => (
          <TrustCardView key={card.index} card={card} />
        ))}
      </div>
    </section>
  );
}

function TrustCardView({ card }: { card: TrustCard }) {
  return (
    <article className="group relative flex flex-col gap-4 rounded-md border border-border bg-surface/60 p-6 transition-colors hover:border-accent/40 hover:bg-surface">
      <div className="flex items-start justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">{card.index}</span>
        <span aria-hidden className="size-1.5 rounded-full bg-accent shadow-[0_0_8px_var(--color-accent)]" />
      </div>
      <h3 className="font-display text-xl font-medium leading-snug tracking-tight text-text-primary">
        {card.title}
      </h3>
      <p className="font-mono text-[12px] leading-relaxed text-text-secondary">{card.body}</p>
      <div className="mt-auto border-t border-border/60 pt-4">
        {card.cta.external ? (
          <a
            href={card.cta.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-accent hover:underline"
          >
            {card.cta.label} ↗
          </a>
        ) : (
          <Link
            href={card.cta.href}
            className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-accent hover:underline"
          >
            {card.cta.label} →
          </Link>
        )}
      </div>
    </article>
  );
}
