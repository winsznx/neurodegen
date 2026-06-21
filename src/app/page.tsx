import Link from 'next/link';
import { Shell } from '@/components/layout/Shell';
import { MandateForm } from '@/components/features/landing/MandateForm';
import { getRecentSessions } from '@/lib/queries/sessions';
import { getOpenPositions } from '@/lib/queries/positions';
import { fmtRel, fmtNum } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const revalidate = 30;

async function getLiveStats() {
  try {
    const [recent, openPositions] = await Promise.all([
      getRecentSessions(10).catch(() => []),
      getOpenPositions().catch(() => []),
    ]);
    const lastSession = recent[0];
    const executed = recent.filter((s) => s.executionResult?.executed === true).length;
    return {
      totalSessions: recent.length,
      executed,
      openPositionCount: openPositions.length,
      lastSessionAt: lastSession ? lastSession.createdAt : null,
      lastRegime: lastSession ? lastSession.regime : null,
    };
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const stats = await getLiveStats();

  return (
    <Shell backgroundVariant="app">
      <section className="mx-auto max-w-4xl px-6 py-16 md:py-20">
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
          An autonomous on-chain investment committee for BNB Chain. Claude
          (narrative), GPT-4o (quant), and DeepSeek (risk) deliberate over
          CoinMarketCap signal data and produce a structured action.
          Trust Wallet Agent Kit signs every trade with self-custody preserved.
          Every decision is committed to BSC before execution and revealed after
          confirmation.
        </p>

        {stats ? (
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Recent sessions" value={fmtNum(stats.totalSessions)} hint="last 10 committee runs" />
            <StatCard label="Executed" value={fmtNum(stats.executed)} hint="signed via TWAK" />
            <StatCard label="Open positions" value={fmtNum(stats.openPositionCount)} hint={stats.lastRegime ? `regime ${stats.lastRegime}` : 'live on BSC'} />
            <StatCard label="Last decision" value={stats.lastSessionAt ? fmtRel(stats.lastSessionAt) : 'pending'} hint="committee tick" />
          </div>
        ) : null}

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/agent"
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            Watch the committee
          </Link>
          <Link
            href="/journal"
            className="rounded-md border border-border bg-surface px-4 py-2 text-sm text-text-primary transition-colors hover:border-accent hover:text-accent"
          >
            Browse sessions
          </Link>
          <Link
            href="/anatomy"
            className="rounded-md border border-border bg-surface px-4 py-2 text-sm text-text-primary transition-colors hover:border-accent hover:text-accent"
          >
            See the wiring
          </Link>
        </div>

        <MandateForm />
      </section>
    </Shell>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  hint: string;
}

function StatCard({ label, value, hint }: StatCardProps): React.ReactElement {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-text-tertiary">{label}</p>
      <p className="mt-2 font-display text-2xl text-text-primary">{value}</p>
      <p className="mt-1 text-[11px] text-text-tertiary">{hint}</p>
    </div>
  );
}
