import { notFound } from 'next/navigation';
import { keccak256, stringToBytes } from 'viem';
import { Shell } from '@/components/layout/Shell';
import { getPositionByTxHash } from '@/lib/queries/positions';
import { getSessionById, getSessionByReasoningHash } from '@/lib/queries/sessions';
import { canonicalize } from '@/lib/utils/canonicalSerialize';
import { ATTESTATION_CONTRACT_ADDRESS } from '@/config/chains';
import { loadProofChain } from '@/lib/services/attestationReader';

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
  const headline = allVerified
    ? chain.commitToRevealSeconds !== null
      ? `Verified. Reasoning was committed ${chain.commitToRevealSeconds} seconds before execution. Hash recomputes against on-chain.`
      : 'Verified.'
    : 'Verification incomplete.';

  return (
    <Shell>
      <section className="mx-auto max-w-3xl px-6 py-10">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-tertiary">proof</p>
        <h1 className="mt-2 font-display text-3xl text-text-primary">{headline}</h1>
        <p className="mt-3 text-text-secondary">
          Every committee decision is committed to BSC at{' '}
          <a
            href={`https://bscscan.com/address/${ATTESTATION_CONTRACT_ADDRESS}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-accent hover:underline"
          >
            {ATTESTATION_CONTRACT_ADDRESS.slice(0, 10)}…
          </a>{' '}
          before TWAK signs the swap, then revealed after BSC confirms. This page reads the
          contract events directly + recomputes the reasoning hash from our database.
        </p>

        <ul className="mt-8 space-y-3">
          {flags.map((f) => (
            <li
              key={f.label}
              className="flex items-start justify-between gap-4 rounded-md border border-border bg-surface px-4 py-3"
            >
              <div className="flex flex-col">
                <span className="font-mono text-[12px] text-text-primary">{f.label}</span>
                <span className="font-mono text-[10px] text-text-tertiary mt-1 break-all">
                  {f.detail}
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {f.bscscanUrl ? (
                  <a
                    href={f.bscscanUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] font-mono text-accent hover:underline"
                  >
                    BscScan↗
                  </a>
                ) : null}
                <span
                  className={`font-mono text-[11px] ${f.ok ? 'text-positive' : 'text-red-400'}`}
                >
                  {f.ok ? 'OK' : 'FAIL'}
                </span>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-8 rounded-md border border-border bg-surface p-4 font-mono text-[11px] text-text-secondary">
          <p>session: #{session.sessionNumber}</p>
          <p className="break-all">reasoning hash: {session.reasoningHash}</p>
          <p className="break-all">recomputed:      {recomputedHash}</p>
          <p className="break-all">twak tx: {position.twakTxHash}</p>
          {chain.commit ? (
            <p className="break-all">commit tx: {chain.commit.txHash}</p>
          ) : null}
          {chain.reveal ? (
            <p className="break-all">reveal tx: {chain.reveal.txHash}</p>
          ) : null}
        </div>
      </section>
    </Shell>
  );
}
