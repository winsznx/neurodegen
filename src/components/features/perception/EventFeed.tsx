import type { PerceptionEvent } from '@/types/perception';
import { Card, CardHeader, CardTitle, Badge } from '@/components/ui';
import { EventCard } from './EventCard';

interface EventFeedProps {
  events: PerceptionEvent[];
  maxItems?: number;
}

export function EventFeed({ events, maxItems = 50 }: EventFeedProps) {
  const displayed = events.slice(0, maxItems);

  return (
    <Card className="flex flex-col h-[500px]">
      <CardHeader>
        <CardTitle>Event Feed</CardTitle>
        <Badge tone="neutral">{events.length} events</Badge>
      </CardHeader>
      <div className="flex-1 overflow-y-auto" aria-live="polite">
        {displayed.length === 0 ? (
          <div className="flex h-full items-center justify-center font-mono text-xs text-text-tertiary">
            No events yet — agent is initializing
          </div>
        ) : (
          displayed.map((event) => <EventCard key={event.eventId} event={event} />)
        )}
      </div>
    </Card>
  );
}
