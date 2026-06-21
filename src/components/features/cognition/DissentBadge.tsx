'use client';

import type { DissentResult } from '@/types/cognition';

interface Props {
  result: DissentResult;
}

export function DissentBadge({ result }: Props) {
  if (!result.dissentDetected) {
    return (
      <div className="rounded-md border border-positive/40 bg-positive/10 px-3 py-2 font-mono text-[11px] text-positive">
        Committee unanimous, narrative {result.narrativeDirection} · quant {result.quantDirection}
      </div>
    );
  }
  const severityColor =
    result.dissentSeverity === 'strong'
      ? 'border-red-400/40 bg-red-400/10 text-red-400'
      : 'border-accent/40 bg-accent/10 text-accent-soft';
  return (
    <div className={`rounded-md border px-3 py-2 font-mono text-[11px] ${severityColor}`}>
      <p className="font-semibold uppercase tracking-[0.14em]">
        {result.dissentSeverity} dissent
      </p>
      <p className="mt-1">
        narrative {result.narrativeDirection} · quant {result.quantDirection} · size ×
        {result.positionSizeModifier.toFixed(2)}
      </p>
      <p className="mt-1 text-[10px] opacity-80">{result.rationale}</p>
    </div>
  );
}
