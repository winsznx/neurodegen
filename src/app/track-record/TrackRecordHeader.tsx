import { Card, CardBody } from '@/components/ui';

interface TrackRecordHeaderProps {
  indexedAt: number;
  contractAddress: `0x${string}` | null;
  onChainOpens: number;
  onChainCloses: number;
  fromBlock: bigint;
  toBlock: bigint;
}

function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function TrackRecordHeader({
  indexedAt,
  contractAddress,
  onChainOpens,
  onChainCloses,
  fromBlock,
  toBlock,
}: TrackRecordHeaderProps) {
  const hasIndex = indexedAt > 0;
  const indexedLabel = hasIndex ? new Date(indexedAt).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '—';
  const blocks = toBlock > fromBlock ? (toBlock - fromBlock).toString() : '0';
  const events = onChainOpens + onChainCloses;

  return (
    <div className="space-y-3">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
          track record
        </div>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-text-primary">
          Every position the agent has taken.
        </h1>
        <p className="mt-2 max-w-3xl font-mono text-xs leading-relaxed text-text-secondary">
          No cherry-picking. No backtest. Real trades, real P&amp;L, committed on-chain before execution and revealed after.
        </p>
      </div>

      <Card>
        <CardBody>
          <div className="grid gap-4 font-mono text-xs md:grid-cols-4">
            <Field label="attestation contract">
              {contractAddress ? (
                <a
                  href={`https://bscscan.com/address/${contractAddress}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent hover:underline"
                >
                  {shortAddress(contractAddress)} ↗
                </a>
              ) : (
                <span className="text-text-tertiary">not configured</span>
              )}
            </Field>
            <Field label="on-chain events">
              <span className="tabular-nums text-text-primary">
                {onChainOpens} open · {onChainCloses} close
              </span>
            </Field>
            <Field label="blocks indexed">
              <span className="tabular-nums text-text-primary">{blocks}</span>
            </Field>
            <Field label="indexed at">
              <span className="tabular-nums text-text-primary">{indexedLabel}</span>
            </Field>
          </div>
          {hasIndex && events === 0 ? (
            <div className="mt-3 rounded-sm border border-accent-yellow/30 bg-accent-yellow/5 px-3 py-2 font-mono text-[11px] text-accent-yellow">
              No attestations found in the indexed range yet. Once the agent submits its first trade, its on-chain proof will appear here.
            </div>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] uppercase tracking-wider text-text-tertiary">{label}</div>
      <div>{children}</div>
    </div>
  );
}
