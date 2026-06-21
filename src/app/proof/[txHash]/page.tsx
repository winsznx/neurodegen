import { notFound } from 'next/navigation';
import { keccak256, stringToBytes } from 'viem';
import { Shell } from '@/components/layout/Shell';
import { CopyHash } from '@/components/CopyHash';
import { getPositionByTxHash } from '@/lib/queries/positions';
import { getSessionById, getSessionByReasoningHash } from '@/lib/queries/sessions';
import { canonicalize } from '@/lib/utils/canonicalSerialize';
import { ATTESTATION_CONTRACT_ADDRESS } from '@/config/chains';
import { loadProofChain } from '@/lib/services/attestationReader';
import { bscScanTx, bscScanAddr, fmtRel } from '@/lib/format';

export const dynamic = 'force-dynamic';

interface ProofProps {
  params: Promise<{ txHash: string }>;
}

export default async function ProofPage({ params }: ProofProps) {
  const { txHash } = await params;
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) notFound();
  const txHashTyped = txHash as `0x${string}`;

  const position = await getPositionByTxHash(txHash).catch(() => null);
  if (!position) {
    return (
      <Shell>
        <section className="mx-auto max-w-2xl px-6 py-16">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-tertiary">proof</p>
          <h1 className="mt-2 font-display text-3xl text-text-primary">No position bound to this tx</h1>
          <p className="mt-4 text-text-secondary">
            The agent has no record of {txHash.slice(0, 12)}…
          </p>
          <p className="mt-2 text-text-tertiary text-sm">
            If you expected a session here, the agent may have not run a commit-reveal pass for this swap. Check{' '}
            <a
              href={`https://bscscan.com/tx/${txHash}`}
              className="text-accent hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              BscScan
            </a>{' '}
            for the raw transaction.
          </p>
        </section>
      </Shell>
    );
  }

  // Probe-trade positions have sessionId=null (no committee session). The
  // /proof page is meant for committee-attested trades only; bounce probe
  // trades to 404.
  if (!position.sessionId) notFound();
  const session = await getSessionById(position.sessionId).catch(() => null);
  if (!session) notFound();

  // Recompute the reasoning hash from the persisted session row.
  const partial = {
    sessionId: session.sessionId,
    sessionNumber: session.sessionNumber,
    createdAt: session.createdAt,
    regime: session.regime,
    previousRegime: session.previousRegime,
    fearGreedAtSession: session.fearGreedAtSession,
    inputMetrics: session.inputMetrics,
    evGateDecisions: session.evGateDecisions,
    x402SpendThisSessionUSDC: session.x402SpendThisSessionUSDC,
    narrativeCall: session.narrativeCall,
    quantCall: session.quantCall,
    dissentResult: session.dissentResult,
    riskCall: session.riskCall,
    finalAction: session.finalAction,
  };
  const recomputedHash = keccak256(stringToBytes(canonicalize(partial)));
  const hashMatches = recomputedHash.toLowerCase() === session.reasoningHash.toLowerCase();

  // Read the AttestationEmitter contract events for chronological verification.
  const chain = await loadProofChain(session.reasoningHash, txHashTyped).catch(() => ({
    commit: null,
    reveal: null,
    commitToRevealSeconds: null,
    chronologyHolds: false,
    myxTxMatches: false,
  }));

  const sessionFoundByHash = await getSessionByReasoningHash(session.reasoningHash).catch(
    () => null,
  );
  const dbIntegrityOk = !!sessionFoundByHash && sessionFoundByHash.sessionId === session.sessionId;

  const flags = [
    { label: 'Reasoning hash recomputes (DB)', ok: hashMatches, detail: hashMatches ? recomputedHash : 'mismatch' },
    { label: 'DB integrity (hash → session round-trip)', ok: dbIntegrityOk, detail: dbIntegrityOk ? 'matched' : 'no match' },
    {
      label: 'On-chain ReasoningCommitted event found',
      ok: !!chain.commit,
      detail: chain.commit ? `block #${chain.commit.blockNumber}` : 'no event for this hash',
      bscscanUrl: chain.commit?.txHash ? `https://bscscan.com/tx/${chain.commit.txHash}` : null,
    },
    {
      label: 'Commit tx on-chain matches DB',
      ok:
        !!session.attestationCommitTx &&
        !!chain.commit &&
        session.attestationCommitTx.toLowerCase() === chain.commit.txHash.toLowerCase(),
      detail:
        !session.attestationCommitTx
          ? 'no commit tx persisted in DB'
          : chain.commit
            ? `${chain.commit.txHash.slice(0, 12)}… vs ${session.attestationCommitTx.slice(0, 12)}…`
            : 'no on-chain event to compare',
    },
    {
      label: 'On-chain ExecutionRevealed event found',
      ok: !!chain.reveal,
      detail: chain.reveal ? `block #${chain.reveal.blockNumber}` : 'no event for this hash',
      bscscanUrl: chain.reveal?.txHash ? `https://bscscan.com/tx/${chain.reveal.txHash}` : null,
    },
    {
      label: 'Commit landed BEFORE reveal',
      ok: chain.chronologyHolds,
      detail: chain.chronologyHolds
        ? `${chain.commitToRevealSeconds ?? '?'}s between commit and reveal`
        : 'chronology missing or inverted',
    },
    {
      label: 'On-chain myxTxHash matches the swap',
      ok: chain.myxTxMatches,
      detail: chain.myxTxMatches ? 'matches' : 'mismatch',
    },
    {
      label: 'TWAK swap recorded in DB',
      ok: !!position.twakTxHash,
      detail: position.twakTxHash ?? 'not recorded',
      bscscanUrl: position.twakTxHash ? `https://bscscan.com/tx/${position.twakTxHash}` : null,
    },
  ];

  const allVerified = flags.every((f) => f.ok);
  const dbFlags = flags.slice(0, 2);
  const chainFlags = flags.slice(2, 7);
  const matchFlags = flags.slice(7);

  return (
    <Shell>
      <section className="mx-auto max-w-3xl px-6 py-10">
        {allVerified ? (
          <div className="rounded-xl border border-positive/40 bg-positive/5 p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-positive/15 text-positive">
                <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8.5L6.5 12L13 4.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-positive">verified on-chain</p>
            </div>
            <h1 className="mt-4 font-display text-3xl text-text-primary">
              {chain.commitToRevealSeconds !== null
                ? `Committed ${chain.commitToRevealSeconds}s before execution.`
                : 'Every flag matches.'}
            </h1>
            <p className="mt-3 text-text-secondary">
              The reasoning hash was published to BSC before TWAK signed the swap, then linked to
              the execution after confirmation. Anyone can replay this from the AttestationEmitter
              contract events alone.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent('NeuroDegen V2 verified this trade on-chain before TWAK signed it')}&url=${encodeURIComponent(`https://neurodegen.xyz/proof/${txHash}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-positive/40 bg-positive/10 px-3 py-2 text-[12px] font-mono text-positive transition-colors hover:bg-positive/20"
              >
                Share on X
              </a>
              <a
                href={`https://bscscan.com/address/${ATTESTATION_CONTRACT_ADDRESS}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-border bg-surface px-3 py-2 text-[12px] font-mono text-text-secondary transition-colors hover:border-accent hover:text-accent"
              >
                Attestation contract
              </a>
            </div>
          </div>
        ) : (
          <>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-tertiary">proof</p>
            <h1 className="mt-2 font-display text-3xl text-text-primary">Verification incomplete.</h1>
            <p className="mt-3 text-text-secondary">
              At least one flag failed below. This usually means the BSC RPC is lagging on event
              indexing, or this trade is still finalising. Refresh in 60 seconds.
            </p>
          </>
        )}

        <p className="mt-6 text-[12px] text-text-tertiary">
          Verified against contract{' '}
          <CopyHash value={ATTESTATION_CONTRACT_ADDRESS} href={bscScanAddr(ATTESTATION_CONTRACT_ADDRESS)} head={10} tail={6} />
        </p>

        <FlagGroup title="Database" flags={dbFlags} />
        <FlagGroup title="On-chain events" flags={chainFlags} />
        <FlagGroup title="Match" flags={matchFlags} />

        <div className="mt-10 rounded-md border border-border bg-surface p-5 font-mono text-[11px] text-text-secondary">
          <p className="mb-3 font-display text-[10px] uppercase tracking-[0.2em] text-text-tertiary">trade detail</p>
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-text-tertiary">session</span>
            <span className="text-text-primary">#{session.sessionNumber}</span>
            <span className="text-text-tertiary">·</span>
            <span className="text-text-tertiary">{fmtRel(session.createdAt)}</span>
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-text-tertiary">reasoning hash</span>
            <CopyHash value={session.reasoningHash} head={10} tail={8} />
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-text-tertiary">twak tx</span>
            <CopyHash value={position.twakTxHash} href={bscScanTx(position.twakTxHash)} head={10} tail={8} />
          </p>
          {chain.commit ? (
            <p className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-text-tertiary">commit tx</span>
              <CopyHash value={chain.commit.txHash} href={bscScanTx(chain.commit.txHash)} head={10} tail={8} />
            </p>
          ) : null}
          {chain.reveal ? (
            <p className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-text-tertiary">reveal tx</span>
              <CopyHash value={chain.reveal.txHash} href={bscScanTx(chain.reveal.txHash)} head={10} tail={8} />
            </p>
          ) : null}
        </div>
      </section>
    </Shell>
  );
}

interface FlagGroupProps {
  title: string;
  flags: Array<{ label: string; ok: boolean; detail: string; bscscanUrl?: string | null }>;
}

function FlagGroup({ title, flags }: FlagGroupProps): React.ReactElement {
  return (
    <div className="mt-8">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-tertiary">{title}</p>
      <ul className="mt-3 space-y-2">
        {flags.map((f) => (
          <li
            key={f.label}
            className="flex items-start justify-between gap-4 rounded-md border border-border bg-surface px-4 py-3"
          >
            <div className="flex flex-col">
              <span className="font-mono text-[12px] text-text-primary">{f.label}</span>
              <span className="mt-1 break-all font-mono text-[10px] text-text-tertiary">{f.detail}</span>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {f.bscscanUrl ? (
                <a
                  href={f.bscscanUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[10px] text-accent hover:underline"
                >
                  BscScan
                </a>
              ) : null}
              <span className={`font-mono text-[11px] ${f.ok ? 'text-positive' : 'text-red-400'}`}>
                {f.ok ? 'OK' : 'FAIL'}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
