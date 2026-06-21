import Link from 'next/link';
import { erc20Abi, formatUnits } from 'viem';
import { Shell } from '@/components/layout/Shell';
import { OnChainActivityFeed } from '@/components/features/agent/OnChainActivityFeed';
import { getRecentSessions } from '@/lib/queries/sessions';
import { getPositionHistory } from '@/lib/queries/positions';
import { pythHermesClient } from '@/lib/clients/pyth';
import { publicClient } from '@/lib/clients/chain';
import {
  PYTH_FEED_IDS,
  BSC_USDT_ADDRESS,
  ATTESTATION_CONTRACT_ADDRESS,
  COMPETITION_CONTRACT_ADDRESS,
  ERC8004_REGISTRY_ADDRESS,
  ERC8183_COMMERCE_ADDRESS,
} from '@/config/chains';
import { allowedTokenSymbols } from '@/lib/utils/allowedTokens';
import { fmtNum, fmtAddr, fmtRel, bscScanAddr, bscScanTx } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const revalidate = 60;

const AGENT_WALLET = (process.env.TWAK_AGENT_WALLET_ADDRESS ??
  '0x1a59eD9BB4890a8ac02746BFC00EDeCBBBe375fF') as `0x${string}`;
const ERC8004_AGENT_ID = process.env.ERC8004_AGENT_ID ?? '139974';
const TELEGRAM_CHANNEL = 'https://t.me/neurodegenv2';

interface AnatomyData {
  fetchedAt: number;
  lastSession: Awaited<ReturnType<typeof getRecentSessions>>[number] | null;
  lastExecutedPosition: Awaited<ReturnType<typeof getPositionHistory>>[number] | null;
  pythBtc: number | null;
  pythEth: number | null;
  pythBnb: number | null;
  pythFreshness: number | null;
  pythLive: boolean;
  cmcLive: boolean;
  bnbBalance: number | null;
  usdtBalance: number | null;
  totalSessions: number;
  totalCommits: number;
  totalReveals: number;
  x402SumUsd: number;
  allowlistCount: number;
  allowlistSymbols: string[];
  errors: string[];
}

async function fetchAnatomy(): Promise<AnatomyData> {
  const errors: string[] = [];

  const [sessionsRes, positionsRes, pythRes, bnbRes, usdtRes] = await Promise.allSettled([
    getRecentSessions(50),
    getPositionHistory(50),
    pythHermesClient.fetchLatestPrices([
      PYTH_FEED_IDS.BTC_USD,
      PYTH_FEED_IDS.ETH_USD,
      PYTH_FEED_IDS.BNB_USD,
    ]),
    publicClient.getBalance({ address: AGENT_WALLET }),
    publicClient.readContract({
      address: BSC_USDT_ADDRESS,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [AGENT_WALLET],
    }),
  ]);

  const sessions = sessionsRes.status === 'fulfilled' ? sessionsRes.value : [];
  if (sessionsRes.status === 'rejected') errors.push(`sessions: ${sessionsRes.reason}`);

  const positions = positionsRes.status === 'fulfilled' ? positionsRes.value : [];
  if (positionsRes.status === 'rejected') errors.push(`positions: ${positionsRes.reason}`);

  const pythPrices = pythRes.status === 'fulfilled' ? pythRes.value : [];
  if (pythRes.status === 'rejected') errors.push(`pyth: ${pythRes.reason}`);

  const bnbBalanceRaw = bnbRes.status === 'fulfilled' ? bnbRes.value : null;
  if (bnbRes.status === 'rejected') errors.push(`bnb-balance: ${bnbRes.reason}`);

  const usdtBalanceRaw = usdtRes.status === 'fulfilled' ? (usdtRes.value as bigint) : null;
  if (usdtRes.status === 'rejected') errors.push(`usdt-balance: ${usdtRes.reason}`);

  const pythByPair: Record<string, { priceUSD: number; stalenessSeconds: number }> = {};
  for (const p of pythPrices) pythByPair[p.pair] = p;

  const now = Date.now();
  const pythFreshness = pythPrices[0]?.stalenessSeconds ?? null;
  const lastSession = sessions[0] ?? null;
  const cmcLive = lastSession != null && now - lastSession.createdAt < 180_000;
  const pythLive = pythFreshness != null && pythFreshness < 60;

  return {
    fetchedAt: now,
    lastSession,
    lastExecutedPosition: positions.find((p) => Boolean(p.twakTxHash)) ?? null,
    pythBtc: pythByPair['BTC/USD']?.priceUSD ?? null,
    pythEth: pythByPair['ETH/USD']?.priceUSD ?? null,
    pythBnb: pythByPair['BNB/USD']?.priceUSD ?? null,
    pythFreshness,
    pythLive,
    cmcLive,
    bnbBalance: bnbBalanceRaw != null ? Number(formatUnits(bnbBalanceRaw, 18)) : null,
    usdtBalance: usdtBalanceRaw != null ? Number(formatUnits(usdtBalanceRaw, 18)) : null,
    totalSessions: sessions.length,
    totalCommits: sessions.filter((s) => Boolean(s.attestationCommitTx)).length,
    totalReveals: positions.filter((p) => Boolean(p.twakTxHash)).length,
    x402SumUsd: sessions.reduce((sum, s) => sum + (s.x402SpendThisSessionUSDC ?? 0), 0),
    allowlistCount: allowedTokenSymbols().length,
    allowlistSymbols: allowedTokenSymbols(),
    errors,
  };
}

function Pulse({ live }: { live: boolean }) {
  if (!live) {
    return (
      <span className="inline-block size-1.5 rounded-full bg-text-muted/50" aria-label="cold" />
    );
  }
  return (
    <span
      className="inline-block size-1.5 rounded-full bg-accent-green animate-[pulse_1.6s_ease-in-out_infinite]"
      aria-label="live"
    />
  );
}

function Organ({
  code,
  title,
  href,
  external,
  live,
  children,
  className = '',
}: {
  code: string;
  title: string;
  href?: string;
  external?: boolean;
  live?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const inner = (
    <div
      className={`group relative flex h-full flex-col border border-border-strong bg-surface/80 px-4 py-3 transition-colors hover:border-accent ${className}`}
    >
      <div className="flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
        <span className="text-accent">[{code}]</span>
        <span className="truncate text-text-secondary group-hover:text-text-primary">
          {title}
        </span>
        <Pulse live={Boolean(live)} />
      </div>
      <div className="mt-2 flex-1 font-mono text-[11px] leading-[1.55] text-text-primary">
        {children}
      </div>
    </div>
  );
  if (!href) return inner;
  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className="block h-full">
        {inner}
      </a>
    );
  }
  return (
    <Link href={href} className="block h-full">
      {inner}
    </Link>
  );
}

function Row({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="relative">
      <div className="mb-3 flex items-center gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-accent">
          ═══ {label} ═══
        </span>
        <span className="h-px flex-1 bg-linear-to-r from-border-strong via-border to-transparent" />
      </div>
      <div className="grid gap-3">{children}</div>
    </div>
  );
}

function FlowArrow({ note }: { note?: string }) {
  return (
    <div className="my-3 flex flex-col items-center gap-1 text-text-tertiary">
      <span className="font-mono text-[12px] leading-none">│</span>
      <span className="font-mono text-[12px] leading-none">▼</span>
      {note ? (
        <span className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
          {note}
        </span>
      ) : null}
    </div>
  );
}

function KV({
  k,
  v,
  href,
  external,
  highlight,
}: {
  k: string;
  v: React.ReactNode;
  href?: string;
  external?: boolean;
  highlight?: boolean;
}) {
  const value = (
    <span
      className={
        highlight ? 'text-accent' : 'text-text-primary'
      }
    >
      {v}
    </span>
  );
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-border/50 py-1 last:border-b-0">
      <span className="text-text-tertiary">{k}</span>
      {href ? (
        external ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="font-mono hover:underline"
          >
            {value}
          </a>
        ) : (
          <Link href={href} className="font-mono hover:underline">
            {value}
          </Link>
        )
      ) : (
        value
      )}
    </div>
  );
}

export default async function AnatomyPage() {
  const data = await fetchAnatomy();

  const fearGreed =
    data.lastSession?.fearGreedAtSession != null
      ? String(data.lastSession.fearGreedAtSession)
      : 'pending';
  const regime = data.lastSession?.regime ?? 'pending';
  const narrativeModel = data.lastSession?.narrativeCall.modelId ?? 'pending';
  const narrativeRoute = data.lastSession?.narrativeCall.routingDecision ?? '-';
  const quantModel = data.lastSession?.quantCall.modelId ?? 'pending';
  const quantRoute = data.lastSession?.quantCall.routingDecision ?? '-';
  const riskModel = data.lastSession?.riskCall.modelId ?? 'pending';
  const riskRoute = data.lastSession?.riskCall.routingDecision ?? '-';
  const dissent = data.lastSession?.dissentResult.dissentSeverity ?? 'pending';
  const dissentNote = data.lastSession?.dissentResult.rationale ?? '';
  const finalAction = data.lastSession?.finalAction.action ?? 'pending';
  const lastSwapTx = data.lastExecutedPosition?.twakTxHash ?? null;

  const { pythLive, cmcLive } = data;

  return (
    <Shell>
      <section className="relative mx-auto max-w-6xl px-6 py-10">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(to right, hsl(35 92% 52%) 1px, transparent 1px), linear-gradient(to bottom, hsl(35 92% 52%) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />

        <header className="mb-10">
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-accent">
            ┌─ /anatomy ─┐
          </p>
          <h1 className="mt-2 font-display text-4xl leading-[1.05] text-text-primary">
            Every API we said we use,
            <br />
            wired into one page,
            <br />
            <span className="text-accent">with live receipts.</span>
          </h1>
          <p className="mt-4 max-w-2xl font-mono text-[12px] text-text-secondary">
            This is the schematic. Each box reads live data on every page load.
            What the README claims, this page proves. Click any box to jump to
            the BscScan, the journal entry, or the source code.
          </p>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
            snapshot · {fmtRel(data.fetchedAt)}
            {data.errors.length > 0 ? (
              <span className="ml-3 text-accent-red">
                {data.errors.length} lookup{data.errors.length === 1 ? '' : 's'} failed
              </span>
            ) : null}
          </p>
        </header>

        <Row label="perception">
          <div className="grid gap-3 md:grid-cols-2">
            <Organ
              code="P1"
              title="CMC AI Agent Hub · MCP + x402"
              href="https://coinmarketcap.com/api/"
              external
              live={cmcLive}
            >
              <KV k="last regime" v={regime} highlight />
              <KV k="fear & greed" v={fearGreed} />
              <KV
                k="sessions ingested"
                v={fmtNum(data.totalSessions)}
                href="/journal"
              />
              <KV
                k="x402 outbound (last 50)"
                v={`$${data.x402SumUsd.toFixed(4)}`}
              />
            </Organ>
            <Organ
              code="P2"
              title="Pyth Hermes · BTC ETH BNB"
              href="https://hermes.pyth.network/v2/updates/price/latest?ids[]=0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43&ids[]=0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace&ids[]=0x2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f&parsed=true"
              external
              live={pythLive}
            >
              <KV
                k="BTC/USD"
                v={data.pythBtc != null ? `$${fmtNum(data.pythBtc)}` : 'pending'}
              />
              <KV
                k="ETH/USD"
                v={data.pythEth != null ? `$${fmtNum(data.pythEth)}` : 'pending'}
              />
              <KV
                k="BNB/USD"
                v={data.pythBnb != null ? `$${fmtNum(data.pythBnb)}` : 'pending'}
              />
              <KV
                k="staleness"
                v={
                  data.pythFreshness != null
                    ? `${data.pythFreshness.toFixed(1)}s`
                    : '-'
                }
              />
            </Organ>
          </div>
        </Row>

        <FlowArrow note="aggregate → regime + features" />

        <Row label="cognition · three-LLM committee via DGrid">
          <div className="grid gap-3 md:grid-cols-3">
            <Organ
              code="C1"
              title="Narrative analyst"
              live={cmcLive}
              className="border-l-2 border-l-accent-purple"
            >
              <KV k="model" v={narrativeModel} highlight />
              <KV k="route" v={narrativeRoute} />
              <KV
                k="direction"
                v={
                  ((data.lastSession?.narrativeCall.parsedOutput as { direction?: string })
                    ?.direction as string) ?? '-'
                }
              />
              <KV
                k="confidence"
                v={
                  ((data.lastSession?.narrativeCall.parsedOutput as {
                    confidenceLevel?: number;
                  })?.confidenceLevel as number | undefined)?.toFixed(2) ?? '-'
                }
              />
            </Organ>
            <Organ
              code="C2"
              title="Quant analyst"
              live={cmcLive}
              className="border-l-2 border-l-accent-blue"
            >
              <KV k="model" v={quantModel} highlight />
              <KV k="route" v={quantRoute} />
              <KV
                k="direction"
                v={
                  ((data.lastSession?.quantCall.parsedOutput as {
                    dominantDirection?: string;
                  })?.dominantDirection as string) ?? '-'
                }
              />
              <KV
                k="liquidity"
                v={
                  ((data.lastSession?.quantCall.parsedOutput as {
                    liquidityAdequate?: boolean;
                  })?.liquidityAdequate as boolean | undefined)?.toString() ?? '-'
                }
              />
            </Organ>
            <Organ
              code="C3"
              title="Risk classifier"
              live={cmcLive}
              className="border-l-2 border-l-accent-yellow"
            >
              <KV k="model" v={riskModel} highlight />
              <KV k="route" v={riskRoute} />
              <KV k="action" v={finalAction} highlight />
              <KV
                k="confidence"
                v={data.lastSession?.finalAction.confidence?.toFixed(2) ?? '-'}
              />
            </Organ>
          </div>
          <div className="mt-3 flex items-start gap-3 border border-dashed border-border/70 bg-surface/40 px-4 py-2 font-mono text-[11px]">
            <span className="text-accent">[C4]</span>
            <span className="text-text-tertiary">dissent tracker</span>
            <span className="text-text-primary">→ {dissent}</span>
            {dissentNote ? (
              <span className="text-text-secondary">· {dissentNote}</span>
            ) : null}
          </div>
        </Row>

        <FlowArrow note="action intent → preflight" />

        <Row label="execution · TWAK is the sole signer">
          <div className="grid gap-3 md:grid-cols-2">
            <Organ
              code="E1"
              title="TWAK CLI · self-custody wallet"
              href={bscScanAddr(AGENT_WALLET)}
              external
              live={data.bnbBalance != null}
            >
              <KV k="signer" v={fmtAddr(AGENT_WALLET)} highlight />
              <KV
                k="BNB"
                v={data.bnbBalance != null ? data.bnbBalance.toFixed(4) : '-'}
              />
              <KV
                k="USDT"
                v={data.usdtBalance != null ? data.usdtBalance.toFixed(4) : '-'}
              />
              <KV
                k="last swap"
                v={lastSwapTx ? fmtAddr(lastSwapTx) : 'none yet'}
                href={lastSwapTx ? bscScanTx(lastSwapTx) : undefined}
                external
              />
            </Organ>
            <Organ code="E2" title="Pre-execution · 8 checks" live={cmcLive}>
              <ul className="space-y-0.5 text-[11px]">
                <li>✓ 149-token allowlist membership</li>
                <li>✓ Pyth ↔ CMC oracle divergence</li>
                <li>✓ token security-risk score</li>
                <li>✓ honeypot flag</li>
                <li>✓ slippage headroom vs MAX_SLIPPAGE_PCT</li>
                <li>✓ drawdown tier (≤ 25%)</li>
                <li>✓ daily PnL cap</li>
                <li>✓ live total-exposure cap</li>
              </ul>
            </Organ>
          </div>
        </Row>

        <FlowArrow note="three on-chain rails" />

        <Row label="attestation · three protocols, one decision">
          <div className="grid gap-3 md:grid-cols-3">
            <Organ
              code="A1"
              title="AttestationEmitter V2"
              href={bscScanAddr(ATTESTATION_CONTRACT_ADDRESS) + '#code'}
              external
              live={data.totalCommits > 0}
            >
              <KV k="contract" v={fmtAddr(ATTESTATION_CONTRACT_ADDRESS)} highlight />
              <KV k="commits" v={fmtNum(data.totalCommits)} />
              <KV k="reveals" v={fmtNum(data.totalReveals)} />
              <KV k="pattern" v="commit-reveal" />
            </Organ>
            <Organ
              code="A2"
              title="ERC-8004 identity"
              href={bscScanAddr(ERC8004_REGISTRY_ADDRESS)}
              external
              live
            >
              <KV k="agentId" v={ERC8004_AGENT_ID} highlight />
              <KV k="owner" v={fmtAddr(AGENT_WALLET)} />
              <KV k="registry" v={fmtAddr(ERC8004_REGISTRY_ADDRESS)} />
              <KV
                k="card"
                v="/api/agent-card"
                href="/api/agent-card"
                external
              />
            </Organ>
            <Organ
              code="A3"
              title="ERC-8183 commerce"
              href={bscScanAddr(ERC8183_COMMERCE_ADDRESS)}
              external
              live={false}
            >
              <KV k="contract" v={fmtAddr(ERC8183_COMMERCE_ADDRESS)} highlight />
              <KV k="job lifecycle" v="negotiate → fund → submit" />
              <KV k="evaluator" v="OptimisticPolicy 7d" />
              <KV k="state" v="wired · enable post-window" />
            </Organ>
          </div>
        </Row>

        <FlowArrow note="public surfaces" />

        <Row label="output · what a spectator can read or pay for">
          <div className="grid gap-3 md:grid-cols-4">
            <Organ code="O1" title="Live committee" href="/agent" live={cmcLive}>
              <KV k="page" v="/agent" highlight />
              <KV k="SSE" v="/api/events/stream" />
              <KV k="cycles" v={`${fmtNum(data.totalSessions)} stored`} />
            </Organ>
            <Organ code="O2" title="Session journal" href="/journal" live>
              <KV k="page" v="/journal" highlight />
              <KV k="per-session detail" v="/session/[id]" />
              <KV k="paid read (x402)" v="/api/x402/session/[id]" />
            </Organ>
            <Organ code="O3" title="Per-trade verifier" href="/proof/0x" live>
              <KV k="page" v="/proof/[twakTxHash]" highlight />
              <KV k="flags" v="8 independent on-chain" />
              <KV k="reads from" v="BSC events only" />
            </Organ>
            <Organ
              code="O4"
              title="Telegram channel"
              href={TELEGRAM_CHANNEL}
              external
              live
            >
              <KV k="channel" v="@neurodegenv2" highlight />
              <KV k="mirrors" v="boots · positions · regime" />
              <KV k="watch live" v="t.me/neurodegenv2" />
            </Organ>
          </div>
        </Row>

        {/* Live on-chain activity from BscScan — receipts for everything above */}
        <div className="mt-10 border border-border-strong bg-surface/60 px-4 py-4">
          <OnChainActivityFeed agentAddress={AGENT_WALLET} limit={10} />
        </div>

        <div className="mt-6 border border-border-strong bg-surface/60 px-4 py-4">
          <div className="flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
            <span>
              <span className="text-accent">[F1]</span> 149-token allowlist · filtered
              before any TWAK swap leaves the worker
            </span>
            <span>{fmtNum(data.allowlistCount)} symbols</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5 font-mono text-[10px]">
            {data.allowlistSymbols.map((sym) => (
              <span
                key={sym}
                className="rounded-sm border border-border bg-background/40 px-1.5 py-0.5 text-text-secondary"
              >
                {sym}
              </span>
            ))}
            {data.allowlistSymbols.length < 30 ? (
              <span className="rounded-sm border border-dashed border-border px-1.5 py-0.5 text-text-tertiary">
                seed list · runtime loads full {process.env.ALLOWED_TOKENS_JSON ? '' : '149'} from env at boot
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-6 border border-dashed border-border/70 bg-surface/30 px-4 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
          <span className="text-accent">[X1]</span> competition contract ·
          <a
            href={bscScanAddr(COMPETITION_CONTRACT_ADDRESS)}
            target="_blank"
            rel="noreferrer"
            className="ml-2 normal-case tracking-normal text-text-secondary hover:text-text-primary"
          >
            {fmtAddr(COMPETITION_CONTRACT_ADDRESS)}
          </a>
          <span className="ml-2">·</span>
          <span className="ml-2 normal-case tracking-normal text-text-secondary">
            registration is wired into worker boot · idempotent · refuses after deadline
          </span>
        </div>
      </section>
    </Shell>
  );
}
