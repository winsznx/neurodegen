'use client';

import type { ActionType, RiskClassifierOutput } from '@/types/cognition';

interface Props {
  output: RiskClassifierOutput;
  minConfidenceToAct: number;
}

const ACTION_LABEL: Record<ActionType, string> = {
  open_long: 'OPEN LONG',
  close_position: 'CLOSE POSITION',
  adjust_parameters: 'ADJUST',
  hold: 'HOLD',
};

const ACTION_COLOR: Record<ActionType, string> = {
  open_long: 'text-positive',
  close_position: 'text-accent',
  adjust_parameters: 'text-text-secondary',
  hold: 'text-text-tertiary',
};

export function ClassificationView({ output, minConfidenceToAct }: Props) {
  const confidencePct = Math.max(0, Math.min(100, output.confidence * 100));
  const thresholdPct = Math.max(0, Math.min(100, minConfidenceToAct * 100));
  const actsThreshold = output.confidence >= minConfidenceToAct;
  const wasOverridden = output.rationale.startsWith('[overridden');

  return (
    <div className="rounded-md border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-base text-text-primary">Risk · DeepSeek</h3>
        <span className={`font-mono text-[11px] uppercase tracking-[0.14em] ${ACTION_COLOR[output.action]}`}>
          {ACTION_LABEL[output.action]}
        </span>
      </div>

      {output.targetToken ? (
        <p className="mt-3 font-mono text-[12px] text-text-secondary">
          target: <span className="text-accent">{output.targetToken}</span>
        </p>
      ) : null}

      <div className="mt-4">
        <div className="flex justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary">
          <span>Confidence</span>
          <span>{confidencePct.toFixed(0)}%</span>
        </div>
        <div className="relative mt-2 h-2 overflow-hidden rounded-sm bg-background">
          <div
            className={`h-full transition-all ${actsThreshold ? 'bg-positive' : 'bg-text-tertiary'}`}
            style={{ width: `${confidencePct}%` }}
          />
          <div
            className="absolute top-0 h-2 w-px bg-accent"
            style={{ left: `${thresholdPct}%` }}
            aria-label={`threshold ${(thresholdPct).toFixed(0)}%`}
          />
        </div>
        <div className="mt-1 flex justify-between font-mono text-[9px] text-text-tertiary">
          <span>0%</span>
          <span style={{ marginLeft: `${thresholdPct - 8}%` }} className="text-accent">
            {thresholdPct.toFixed(0)}% min
          </span>
          <span>100%</span>
        </div>
      </div>

      <p className="mt-4 font-mono text-[11px] leading-relaxed text-text-secondary">
        {output.rationale}
      </p>

      {wasOverridden ? (
        <div className="mt-3 rounded-sm border border-amber-400/40 bg-amber-400/10 p-2 font-mono text-[10px] text-accent-soft">
          Safety rail overrode the model. See rationale prefix for which rule fired.
        </div>
      ) : null}

      {!actsThreshold && output.action !== 'hold' ? (
        <div className="mt-3 rounded-sm border border-red-400/40 bg-red-400/10 p-2 font-mono text-[10px] text-red-400">
          Confidence below {(minConfidenceToAct * 100).toFixed(0)}% threshold → action will be forced to HOLD downstream.
        </div>
      ) : null}
    </div>
  );
}
