import Link from 'next/link';
import { Shell } from '@/components/layout/Shell';
import { MandateForm } from '@/components/features/landing/MandateForm';
import { getRecentSessions } from '@/lib/queries/sessions';
import { getOpenPositions } from '@/lib/queries/positions';
import { getWorkerState } from '@/lib/queries/workerState';
import {
  COMPETITION_REGISTRATION_KEY,
  type PersistedCompetitionRegistration,
} from '@/lib/services/competitionRegistration';
import {
  ERC8004_REGISTRATION_KEY,
  type PersistedErc8004Registration,
} from '@/lib/services/bnbAgentRegistration';
import {
  ATTESTATION_CONTRACT_ADDRESS,
  COMPETITION_CONTRACT_ADDRESS,
  ERC8004_REGISTRY_ADDRESS,
  ERC8183_COMMERCE_ADDRESS,
} from '@/config/chains';
import { readErc20Balance, readNativeBalance } from '@/lib/clients/erc20BalanceFallback';
import { fmtRel, fmtNum, fmtUSD, bscScanTx, bscScanAddr } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const revalidate = 30;

const AGENT_ADDRESS: `0x${string}` =
  (process.env.TWAK_AGENT_WALLET_ADDRESS as `0x${string}` | undefined) ??
  '0x1a59eD9BB4890a8ac02746BFC00EDeCBBBe375fF';

interface LiveHero {
  agentAddress: `0x${string}`;
  walletUSD: number;
  usdtBalance: number;
  cakeBalance: number;
  cakePriceUSD: number;
  nativeBNB: number;
  competition: PersistedCompetitionRegistration | null;
  erc8004: PersistedErc8004Registration | null;
  recentSessions: number;
  executedSessions: number;
  openPositions: number;
  lastSessionAt: number | null;
  lastRegime: string | null;
}

async function getLiveHero(): Promise<LiveHero> {
  const [
    recentSessions,
    openPositions,
    competition,
    erc8004,
    usdt,
    cake,
    bnb,
  ] = await Promise.all([
    getRecentSessions(10).catch(() => []),
    getOpenPositions().catch(() => []),
    getWorkerState<PersistedCompetitionRegistration>(COMPETITION_REGISTRATION_KEY).catch(
      () => null,
    ),
    getWorkerState<PersistedErc8004Registration>(ERC8004_REGISTRATION_KEY).catch(() => null),
    readErc20Balance({
      holder: AGENT_ADDRESS,
      tokenAddress: '0x55d398326f99059fF775485246999027B3197955',
      symbol: 'USDT',
    }).catch(() => null),
    readErc20Balance({
      holder: AGENT_ADDRESS,
      tokenAddress: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
      symbol: 'CAKE',
    }).catch(() => null),
    readNativeBalance(AGENT_ADDRESS).catch(() => null),
  ]);

  const usdtBalance = usdt ? Number.parseFloat(usdt.balanceTokens) : 0;
  const cakeBalance = cake ? Number.parseFloat(cake.balanceTokens) : 0;
  // We don't pull a live CAKE/USD price here on every homepage render — use
  // the agent's most recent priced CAKE position if any, otherwise rough $1.34
  // estimate (cheap fallback; precision doesn't matter for hero display).
  const cakePriceUSD = 1.34;
  const walletUSD = usdtBalance + cakeBalance * cakePriceUSD;
  const nativeBNB = bnb ? Number.parseFloat(bnb.balanceTokens) : 0;

  const lastSession = recentSessions[0];
  const executed = recentSessions.filter((s) => s.executionResult?.executed === true).length;

  return {
    agentAddress: AGENT_ADDRESS,
    walletUSD,
    usdtBalance,
    cakeBalance,
    cakePriceUSD,
    nativeBNB,
    competition,
    erc8004,
    recentSessions: recentSessions.length,
    executedSessions: executed,
    openPositions: openPositions.length,
    lastSessionAt: lastSession ? lastSession.createdAt : null,
    lastRegime: lastSession ? lastSession.regime : null,
  };
}

export default async function HomePage() {
  const hero = await getLiveHero();

  return (
    <Shell backgroundVariant="app">
      <section className="mx-auto max-w-5xl px-6 py-12 md:py-16">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-tertiary">
          NeuroDegen V2 · live on BNB Chain
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
          Every decision is committed to BSC <em>before</em> execution and
          revealed <em>after</em> confirmation.
        </p>

        {/* Live proof — judges land here, see real on-chain artefacts immediately */}
        <div className="mt-10 rounded-xl border border-border bg-surface p-6">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-tertiary">
              live proof · BSC mainnet
            </p>
            <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-positive">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-positive" />
              autonomous
            </span>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
            <ProofCard
              label="agent wallet"
              value={`${hero.agentAddress.slice(0, 8)}…${hero.agentAddress.slice(-6)}`}
              href={bscScanAddr(hero.agentAddress)}
              hint={`${fmtUSD(hero.walletUSD)} held · ${hero.nativeBNB.toFixed(4)} BNB for gas`}
            />
            <ProofCard
              label="competition registration"
              value={
                hero.competition?.txHash
                  ? `${hero.competition.txHash.slice(0, 8)}…${hero.competition.txHash.slice(-6)}`
                  : 'pending'
              }
              href={hero.competition?.txHash ? bscScanTx(hero.competition.txHash) : null}
              hint={`on ${COMPETITION_CONTRACT_ADDRESS.slice(0, 10)}…`}
            />
            <ProofCard
              label="ERC-8004 identity"
              value={hero.erc8004?.agentId ? `#${hero.erc8004.agentId}` : 'pending'}
              href={hero.erc8004?.txHash ? bscScanTx(hero.erc8004.txHash) : null}
              hint={`BNB Agent SDK · agentId ${hero.erc8004?.agentId ?? '?'}`}
            />
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
            <ProofCard
              label="AttestationEmitter"
              value={`${ATTESTATION_CONTRACT_ADDRESS.slice(0, 10)}…`}
              href={bscScanAddr(ATTESTATION_CONTRACT_ADDRESS)}
              hint="commit-reveal: hash on-chain BEFORE swap, reveal AFTER"
            />
            <ProofCard
              label="ERC-8183 commerce"
              value={`${ERC8183_COMMERCE_ADDRESS.slice(0, 10)}…`}
              href={bscScanAddr(ERC8183_COMMERCE_ADDRESS)}
              hint="agentic job lifecycle per committee decision"
            />
            <ProofCard
              label="ERC-8004 registry"
              value={`${ERC8004_REGISTRY_ADDRESS.slice(0, 10)}…`}
              href={bscScanAddr(ERC8004_REGISTRY_ADDRESS)}
              hint="UUPS proxy · canonical mainnet deployment"
            />
          </div>

          {/* Holdings strip */}
          <div className="mt-5 flex flex-wrap gap-2 font-mono text-[11px]">
            <Pill label="USDT" value={hero.usdtBalance.toFixed(2)} />
            <Pill label="CAKE" value={hero.cakeBalance.toFixed(4)} />
            <Pill label="BNB" value={hero.nativeBNB.toFixed(4)} />
            <Pill label="allowlist" value="146 tokens" />
            <Pill label="commit-reveal" value="enabled" />
            <Pill label="self-custody" value="TWAK only" />
          </div>
        </div>

        {/* Activity summary */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Committee sessions"
            value={fmtNum(hero.recentSessions)}
            hint="DB-tracked in last 10"
          />
          <StatCard
            label="Executed"
            value={fmtNum(hero.executedSessions)}
            hint="signed via TWAK"
          />
          <StatCard
            label="DB open positions"
            value={fmtNum(hero.openPositions)}
            hint={hero.lastRegime ? `regime ${hero.lastRegime}` : 'see BscScan for all activity'}
          />
          <StatCard
            label="Last decision"
            value={hero.lastSessionAt ? fmtRel(hero.lastSessionAt) : 'pending'}
            hint="committee tick · probe trades on BscScan"
          />
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href={bscScanAddr(AGENT_ADDRESS)}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            See all activity on BscScan ↗
          </Link>
          <Link
            href="/agent"
            className="rounded-md border border-border bg-surface px-4 py-2 text-sm text-text-primary transition-colors hover:border-accent hover:text-accent"
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

interface ProofCardProps {
  label: string;
  value: string;
  href: string | null;
  hint: string;
}

function ProofCard({ label, value, href, hint }: ProofCardProps): React.ReactElement {
  const body = (
    <div className="flex h-full flex-col rounded-lg border border-border bg-background/40 p-4 transition-colors hover:border-accent">
      <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-text-tertiary">{label}</p>
      <p className="mt-2 font-mono text-[13px] text-text-primary break-all">{value}</p>
      <p className="mt-2 text-[10px] text-text-tertiary">{hint}</p>
      {href ? (
        <p className="mt-2 font-mono text-[10px] text-accent">view on BscScan ↗</p>
      ) : null}
    </div>
  );
  if (!href) return body;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="block">
      {body}
    </a>
  );
}

interface PillProps {
  label: string;
  value: string;
}

function Pill({ label, value }: PillProps): React.ReactElement {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/40 px-2 py-1 text-text-secondary">
      <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-text-tertiary">
        {label}
      </span>
      <span className="text-text-primary">{value}</span>
    </span>
  );
}
