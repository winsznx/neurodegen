import { Shell } from '@/components/layout/Shell';

export default function HomePage() {
  return (
    <Shell backgroundVariant="none">
      <section className="mx-auto max-w-3xl px-6 py-24">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-tertiary">
          NeuroDegen V2
        </p>
        <h1 className="mt-3 font-display text-4xl text-text-primary md:text-5xl">
          Three agents debate.
          <br />
          One decision.
          <br />
          Your keys never leave your wallet.
        </h1>
        <p className="mt-6 max-w-2xl text-text-secondary">
          An autonomous on-chain investment committee for BNB Chain. Three LLM
          analysts deliberate over CoinMarketCap signal data and produce a
          structured action recommendation. Trust Wallet Agent Kit signs every
          trade with self-custody preserved. Every decision is committed to BSC
          before execution and revealed after confirmation.
        </p>
        <p className="mt-8 font-mono text-[12px] text-text-tertiary">
          Mandate form ships in Phase 6.
        </p>
      </section>
    </Shell>
  );
}
