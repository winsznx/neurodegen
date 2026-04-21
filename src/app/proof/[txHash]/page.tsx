import type { Metadata } from 'next';
import Link from 'next/link';
import { Shell } from '@/components/layout/Shell';
import { Card, CardBody, CardHeader, CardTitle, Badge } from '@/components/ui';
import { publicClient } from '@/lib/clients/chain';
import { getPositionByEntryTxHash } from '@/lib/queries/positions';
import { getReasoningChainById } from '@/lib/queries/reasoningChains';
import { getCommitForReasoning, getRevealForReasoning } from '@/lib/services/attestationReader';
import { computeReasoningCommitment } from '@/lib/utils/reasoningHash';
import { ATTESTATION_CONTRACT_ADDRESS } from '@/config/chains';
import { ProofVerdict } from './ProofVerdict';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ txHash: string }>;
}): Promise<Metadata> {
  const { txHash } = await params;
  const normalized = txHash.toLowerCase();
  const position = await getPositionByEntryTxHash(normalized).catch(() => null);
  if (!position) {
    return { title: 'Proof not found', robots: { index: false, follow: false } };
  }
  const side = position.isLong ? 'LONG' : 'SHORT';
  const title = `${side} ${position.pair} · ${position.leverage}x · on-chain proof`;
  const description = `NeuroDegen opened ${side} ${position.pair} at $${position.entryPrice} with $${position.collateralUsd} collateral. Reasoning committed before execution. Verify on BscScan.`;
  return {
    title,
    description,
    openGraph: { title, description, type: 'article' },
    twitter: { card: 'summary_large_image', title, description },
  };
}

interface PageProps {
  params: Promise<{ txHash: string }>;
}

function shorten(hash: string, head = 10, tail = 6): string {
  if (!hash) return '—';
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

export default async function ProofPage({ params }: PageProps) {
  const { txHash } = await params;
  const normalized = txHash.toLowerCase();

  const position = await getPositionByEntryTxHash(normalized).catch(() => null);
  const graph = position ? await getReasoningChainById(position.reasoningGraphId).catch(() => null) : null;

  if (!position || !graph) {
    return (
      <Shell>
        <div className="mx-auto max-w-3xl space-y-6 px-6 py-12">
          <header>
            <div className="font-mono text-[10px] uppercase tracking-wider text-accent-yellow">proof · not found</div>
            <h1 className="mt-2 font-mono text-3xl font-bold tracking-tight">
              {shorten(normalized, 14, 8)}
            </h1>
          </header>
          <Card>
            <CardBody>
              <p className="font-mono text-sm text-text-secondary">
                No NeuroDegen position recorded against this MYX transaction hash.
              </p>
              <p className="mt-3 text-xs text-text-tertiary">
                This page only verifies trades the agent submitted through its own execution gateway.
              </p>
            </CardBody>
          </Card>
        </div>
      </Shell>
    );
  }

  const commitment = computeReasoningCommitment(graph);
  const receipt = await publicClient
    .getTransactionReceipt({ hash: normalized as `0x${string}` })
    .catch(() => null);
  const referenceBlock = receipt?.blockNumber ?? (await publicClient.getBlockNumber());

  const [commit, reveal] = await Promise.all([
    getCommitForReasoning(commitment.reasoningHash, referenceBlock).catch(() => null),
    getRevealForReasoning(commitment.reasoningHash, referenceBlock).catch(() => null),
  ]);

  const hashMatch = !!commit && commit.reasoningHash.toLowerCase() === commitment.reasoningHash.toLowerCase();
  const revealMatchesInput = !!reveal && reveal.myxTxHash.toLowerCase() === normalized;

  const commitSec = commit ? Number(commit.timestamp) : null;
  const revealSec = reveal ? Number(reveal.timestamp) : null;
  const deltaSec = commitSec !== null && revealSec !== null ? revealSec - commitSec : null;

  return (
    <Shell>
      <div className="mx-auto max-w-4xl space-y-6 px-6 py-12">
        <header>
          <div className="font-mono text-[10px] uppercase tracking-wider text-accent">
            proof · neurodegen
          </div>
          <h1 className="mt-2 break-all font-mono text-2xl font-bold tracking-tight">
            {shorten(normalized, 18, 10)}
          </h1>
          <p className="mt-2 text-text-secondary">
            Cryptographic chain of custody linking this MYX transaction to the reasoning graph that produced it.
          </p>
        </header>

        <ProofVerdict
          hashMatch={hashMatch}
          revealPresent={!!reveal}
          commitPresent={!!commit}
          revealMatchesInput={revealMatchesInput}
          deltaSec={deltaSec}
        />

        <Card>
          <CardHeader>
            <CardTitle>Reasoning graph</CardTitle>
            <Badge tone="neutral">{graph.regime}</Badge>
          </CardHeader>
          <CardBody className="space-y-2 font-mono text-xs">
            <Row label="graph id" value={graph.graphId} />
            <Row label="computed hash" value={commitment.reasoningHash} />
            <Row label="final action" value={`${graph.finalAction.action} ${graph.finalAction.pair}`} />
            <Row label="confidence" value={`${(graph.finalAction.confidence * 100).toFixed(0)}%`} />
            <div className="pt-2">
              <Link
                href={`/reasoning/${graph.graphId}`}
                className="text-accent-blue hover:underline"
              >
                view full reasoning →
              </Link>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>On-chain commit</CardTitle>
            <Badge tone={commit ? 'green' : 'red'}>{commit ? 'present' : 'missing'}</Badge>
          </CardHeader>
          <CardBody className="space-y-2 font-mono text-xs">
            {commit ? (
              <>
                <Row label="tx" value={commit.txHash} href={`https://bscscan.com/tx/${commit.txHash}`} />
                <Row label="block" value={String(commit.blockNumber)} />
                <Row label="committed at" value={new Date(Number(commit.timestamp) * 1000).toISOString()} />
                <Row label="action intent" value={commit.actionIntentDecoded || commit.actionIntent} />
                <Row label="reasoning hash" value={commit.reasoningHash} />
              </>
            ) : (
              <p className="text-text-tertiary">No ReasoningCommitted event found for this reasoning hash.</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>On-chain reveal</CardTitle>
            <Badge tone={reveal ? 'green' : 'red'}>{reveal ? 'present' : 'missing'}</Badge>
          </CardHeader>
          <CardBody className="space-y-2 font-mono text-xs">
            {reveal ? (
              <>
                <Row label="tx" value={reveal.txHash} href={`https://bscscan.com/tx/${reveal.txHash}`} />
                <Row label="block" value={String(reveal.blockNumber)} />
                <Row label="revealed at" value={new Date(Number(reveal.timestamp) * 1000).toISOString()} />
                <Row label="myx tx" value={reveal.myxTxHash} href={`https://bscscan.com/tx/${reveal.myxTxHash}`} />
                <Row label="order id" value={reveal.orderId} />
                <Row label="reasoning hash" value={reveal.reasoningHash} />
              </>
            ) : (
              <p className="text-text-tertiary">No ExecutionRevealed event found for this reasoning hash.</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-1 font-mono text-[11px] text-text-tertiary">
            <div>attestation contract: <a className="text-accent-blue hover:underline" target="_blank" rel="noreferrer" href={`https://bscscan.com/address/${ATTESTATION_CONTRACT_ADDRESS}`}>{ATTESTATION_CONTRACT_ADDRESS}</a></div>
            <div>this page verifies the link from reasoning → commit → MYX execution → reveal by recomputing the keccak256 of the stored reasoning graph and matching it against the on-chain indexed events.</div>
          </CardBody>
        </Card>
      </div>
    </Shell>
  );
}

function Row({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="grid grid-cols-[130px_1fr] gap-3">
      <div className="text-[10px] uppercase tracking-wider text-text-tertiary">{label}</div>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="break-all text-accent-blue hover:underline">
          {value}
        </a>
      ) : (
        <div className="break-all text-text-secondary">{value}</div>
      )}
    </div>
  );
}
