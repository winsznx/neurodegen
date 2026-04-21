import type { OrderLifecycleState } from '@/types/execution';
import { Badge } from '@/components/ui';

interface OrderStatusBadgeProps {
  status: OrderLifecycleState;
}

const STATUS_TONE: Record<OrderLifecycleState, 'yellow' | 'blue' | 'green' | 'purple' | 'neutral' | 'red'> = {
  submitted: 'yellow',
  pending: 'yellow',
  filled: 'blue',
  managed: 'green',
  closed: 'neutral',
  expired: 'red',
  liquidated: 'red',
};

export function OrderStatusBadge({ status }: OrderStatusBadgeProps) {
  const active = status === 'submitted' || status === 'pending' || status === 'managed';
  return (
    <Badge tone={STATUS_TONE[status]} dot={active}>
      {status}
    </Badge>
  );
}
