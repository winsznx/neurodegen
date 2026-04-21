'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useSSE } from '@/hooks/useSSE';

export function LiveRefresh() {
  const router = useRouter();

  const handlers = useMemo(
    () => ({
      position_update: () => router.refresh(),
      reasoning_complete: () => router.refresh(),
    }),
    [router]
  );

  useSSE('/api/events/stream', handlers);
  return null;
}
