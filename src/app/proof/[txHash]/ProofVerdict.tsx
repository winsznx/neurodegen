import { Card, CardBody } from '@/components/ui';

interface Props {
  hashMatch: boolean;
  revealPresent: boolean;
  commitPresent: boolean;
  revealMatchesInput: boolean;
  deltaSec: number | null;
}

export function ProofVerdict({
  hashMatch,
  revealPresent,
  commitPresent,
  revealMatchesInput,
  deltaSec,
}: Props) {
  const verified = hashMatch && revealPresent && commitPresent && revealMatchesInput;
  const tone = verified ? 'accent-green' : 'accent-red';

  const delta = deltaSec !== null ? formatDelta(deltaSec) : '—';

  const headline = verified
    ? `Reasoning was committed ${delta} before execution. Hash verified.`
    : failureHeadline(commitPresent, revealPresent, hashMatch, revealMatchesInput);

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-center gap-3">
          <div
            className={`h-2 w-2 rounded-full bg-${tone}`}
            aria-hidden
          />
          <div className={`font-mono text-[10px] uppercase tracking-wider text-${tone}`}>
            {verified ? 'verified' : 'verification failed'}
          </div>
        </div>
        <p className="font-mono text-lg text-text-primary">{headline}</p>
        <div className="grid gap-2 pt-2 sm:grid-cols-4">
          <Flag label="commit on-chain" pass={commitPresent} />
          <Flag label="reveal on-chain" pass={revealPresent} />
          <Flag label="hash match" pass={hashMatch} />
          <Flag label="myx tx match" pass={revealMatchesInput} />
        </div>
      </CardBody>
    </Card>
  );
}

function Flag({ label, pass }: { label: string; pass: boolean }) {
  return (
    <div
      className={`rounded border px-3 py-2 ${
        pass ? 'border-accent-green/40 bg-accent-green/10' : 'border-accent-red/40 bg-accent-red/10'
      }`}
    >
      <div className={`font-mono text-[10px] uppercase tracking-wider ${pass ? 'text-accent-green' : 'text-accent-red'}`}>
        {pass ? 'ok' : 'fail'}
      </div>
      <div className="mt-1 font-mono text-xs text-text-secondary">{label}</div>
    </div>
  );
}

function formatDelta(sec: number): string {
  if (sec < 0) return `${sec}s (reveal before commit?)`;
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

function failureHeadline(
  commit: boolean,
  reveal: boolean,
  hashMatch: boolean,
  revealMatchesInput: boolean
): string {
  if (!commit) return 'No on-chain reasoning commit for this trade.';
  if (!reveal) return 'No on-chain execution reveal for this trade.';
  if (!hashMatch) return 'The reasoning graph stored in our database does not match the hash that was committed on-chain.';
  if (!revealMatchesInput) return 'The revealed MYX transaction hash does not match the one requested.';
  return 'Verification failed.';
}
