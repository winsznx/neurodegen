import type { PerceptionEvent } from '@/types/perception';
import { Badge } from '@/components/ui';

interface EventCardProps {
  event: PerceptionEvent;
}

const SOURCE_TONE = {
  fourmeme: 'blue',
  myx: 'green',
  pyth: 'yellow',
} as const;

function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function truncateAddress(addr: string): string {
  return addr.length > 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

function describeEvent(event: PerceptionEvent): string {
  switch (event.eventType) {
    case 'token_create':
      return `Launch ${event.tokenSymbol} by ${truncateAddress(event.creatorAddress)}`;
    case 'token_purchase':
      return `Buy ${Number(event.bnbAmount) / 1e18} BNB → ${truncateAddress(event.tokenAddress)}`;
    case 'liquidity_added':
    case 'pair_created':
    case 'pool_created':
      return `${event.eventType.replace(/_/g, ' ')} ${truncateAddress(event.tokenAddress)}`;
    case 'market_snapshot':
      return `${event.pair} · ${(Number(event.lastPrice) / 1e30).toFixed(2)}`;
    case 'price_update':
      return `${event.pair} @ ${event.publishTime}`;
  }
}

export function EventCard({ event }: EventCardProps) {
  return (
    <div className="group animate-fade-in flex items-center gap-3 border-b border-border/60 px-4 py-2.5 font-mono text-xs hover:bg-surface-hover/40">
      <span className="w-20 shrink-0 tabular-nums text-text-tertiary">
        {formatTimestamp(event.timestamp)}
      </span>
      <Badge tone={SOURCE_TONE[event.source]}>{event.source}</Badge>
      <span className="flex-1 truncate text-text-primary">{describeEvent(event)}</span>
    </div>
  );
}
