import type { UserPosition } from '@/types/users';
import { Card, CardBody, CardHeader, CardTitle, Badge } from '@/components/ui';

export interface SkipReasonsProps {
  positions: UserPosition[];
  maxItems?: number;
}

interface ReasonGuide {
  label: string;
  hint: string;
}

const REASON_GUIDE: Record<string, ReasonGuide> = {
  subscription_inactive: {
    label: 'paused',
    hint: 'Your subscription was paused at the time this entry fired.',
  },
  signer_not_granted: {
    label: 'signer missing',
    hint: 'The session signer hasn\'t been granted — re-run the onboarding step.',
  },
  no_wallet_id: {
    label: 'wallet not linked',
    hint: 'Your Privy wallet id isn\'t recorded server-side. Log out and reconnect.',
  },
  zero_collateral: {
    label: 'collateral cap too low',
    hint: 'Your max-position cap is below the minimum viable mirror size.',
  },
  zero_leverage: {
    label: 'leverage cap too low',
    hint: 'Your leverage multiplier would produce zero effective leverage.',
  },
  invalid_index_price: {
    label: 'price feed stale',
    hint: 'MYX index price was unavailable at execution time. The next entry should be fine.',
  },
};

function describeReason(raw: string | null): ReasonGuide {
  if (!raw) return { label: 'skipped', hint: 'No reason recorded.' };
  if (raw in REASON_GUIDE) return REASON_GUIDE[raw];
  const confidence = /^confidence_below_user_threshold\(([\d.]+)\)$/.exec(raw);
  if (confidence) {
    return {
      label: `below ${Math.round(Number(confidence[1]) * 100)}% confidence`,
      hint: `The agent's confidence was below your configured minimum. Lower the threshold if you want more entries to qualify.`,
    };
  }
  return { label: raw, hint: 'See logs for more detail.' };
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}

export function SkipReasons({ positions, maxItems = 5 }: SkipReasonsProps) {
  const skips = positions
    .filter((p) => p.status === 'skipped')
    .slice(0, maxItems);

  if (skips.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>recent skips</CardTitle>
        <Badge tone="neutral">{skips.length}</Badge>
      </CardHeader>
      <CardBody>
        <p className="mb-3 font-mono text-[11px] text-text-tertiary">
          The agent entered these trades, but your filters or session state blocked the mirror. You lost no funds — these are informational.
        </p>
        <ul className="space-y-2 font-mono text-xs">
          {skips.map((p) => {
            const reason = describeReason(p.skipReason);
            return (
              <li
                key={p.userPositionId}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2 last:border-b-0 last:pb-0"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                      p.isLong ? 'bg-accent-green/15 text-accent-green' : 'bg-accent-red/15 text-accent-red'
                    }`}
                  >
                    {p.isLong ? 'long' : 'short'}
                  </span>
                  <span className="text-text-primary">{p.pair}</span>
                  <span className="text-text-tertiary">{formatRelative(p.openedAt)}</span>
                </div>
                <div className="flex items-center gap-2" title={reason.hint}>
                  <Badge tone="yellow">{reason.label}</Badge>
                </div>
              </li>
            );
          })}
        </ul>
      </CardBody>
    </Card>
  );
}
