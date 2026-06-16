import { notFound } from 'next/navigation';
import { keccak256, stringToBytes } from 'viem';
import { Shell } from '@/components/layout/Shell';
import { getPositionByTxHash } from '@/lib/queries/positions';
import { getSessionById, getSessionByReasoningHash } from '@/lib/queries/sessions';
import { canonicalize } from '@/lib/utils/canonicalSerialize';
import { ATTESTATION_CONTRACT_ADDRESS } from '@/config/chains';

export const dynamic = 'force-dynamic';

interface ProofProps {
  params: Promise<{ txHash: string }>;
}

export default async function ProofPage({ params }: ProofProps) {
  const { txHash } = await params;
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) notFound();

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
        </section>
      </Shell>
    );
  }

  const session = await getSessionById(position.sessionId).catch(() => null);
  if (!session) notFound();

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
  const sessionFoundByHash = await getSessionByReasoningHash(session.reasoningHash).catch(() => null);
  const dbIntegrityOk = !!sessionFoundByHash && sessionFoundByHash.sessionId === session.sessionId;

  const flags = [
    { label: 'Reasoning hash recomputes', ok: hashMatches },
    { label: 'DB integrity (hash → session round-trip)', ok: dbIntegrityOk },
    { label: 'TWAK swap recorded in DB', ok: !!position.twakTxHash },
    { label: 'Attestation commit tx present', ok: !!session.attestationCommitTx },
    { label: 'Attestation reveal tx present', ok: !!position.attestationRevealTx },
  ];

  const allVerified = flags.every((f) => f.ok);

  return (
    <Shell>
      <section className="mx-auto max-w-3xl px-6 py-10">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-tertiary">proof</p>
        <h1 className="mt-2 font-display text-3xl text-text-primary">
          {allVerified ? 'Verified.' : 'Verification incomplete.'}
        </h1>
        <p className="mt-3 text-text-secondary">
          The committee committed a hash of its reasoning to BSC at{' '}
          <code className="font-mono">{ATTESTATION_CONTRACT_ADDRESS.slice(0, 10)}…</code> before
          TWAK signed the swap. This page recomputes the hash from our database
          and shows whether each step of the chain holds.
        </p>

        <ul className="mt-8 space-y-3">
          {flags.map((f) => (
            <li
              key={f.label}
              className="flex items-center justify-between rounded-md border border-border bg-surface px-4 py-3"
            >
              <span className="font-mono text-[12px] text-text-primary">{f.label}</span>
              <span
                className={`font-mono text-[11px] ${
                  f.ok ? 'text-positive' : 'text-red-400'
                }`}
              >
                {f.ok ? 'OK' : 'FAIL'}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-8 rounded-md border border-border bg-surface p-4 font-mono text-[11px] text-text-secondary">
          <p>session: #{session.sessionNumber}</p>
          <p className="break-all">reasoning hash: {session.reasoningHash}</p>
          <p className="break-all">recomputed:      {recomputedHash}</p>
          <p className="break-all">twak tx: {position.twakTxHash}</p>
          {session.attestationCommitTx ? (
            <p className="break-all">commit: {session.attestationCommitTx}</p>
          ) : null}
          {position.attestationRevealTx ? (
            <p className="break-all">reveal: {position.attestationRevealTx}</p>
          ) : null}
        </div>
      </section>
    </Shell>
  );
}
