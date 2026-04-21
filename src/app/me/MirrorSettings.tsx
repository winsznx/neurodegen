'use client';

import { useMemo, useState } from 'react';
import type { Subscription } from '@/types/users';
import { Card, CardBody, CardHeader, CardTitle, Button, Badge } from '@/components/ui';

export interface MirrorSettingsProps {
  subscription: Subscription | null;
  onSave: (update: {
    leverageMultiplier: number;
    maxPositionUsd: number;
    minConfidence: number;
  }) => Promise<void>;
}

const DEFAULTS = {
  leverageMultiplier: 1.0,
  maxPositionUsd: 25,
  minConfidence: 0.3,
};

export function MirrorSettings({ subscription, onSave }: MirrorSettingsProps) {
  const initial = useMemo(
    () => ({
      leverageMultiplier: subscription?.leverageMultiplier ?? DEFAULTS.leverageMultiplier,
      maxPositionUsd: subscription?.maxPositionUsd ?? DEFAULTS.maxPositionUsd,
      minConfidence: subscription?.minConfidence ?? DEFAULTS.minConfidence,
    }),
    [subscription?.leverageMultiplier, subscription?.maxPositionUsd, subscription?.minConfidence]
  );

  const [leverage, setLeverage] = useState(initial.leverageMultiplier);
  const [maxPosition, setMaxPosition] = useState(initial.maxPositionUsd);
  const [minConfidence, setMinConfidence] = useState(initial.minConfidence);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    leverage !== initial.leverageMultiplier ||
    maxPosition !== initial.maxPositionUsd ||
    minConfidence !== initial.minConfidence;

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      await onSave({
        leverageMultiplier: leverage,
        maxPositionUsd: maxPosition,
        minConfidence: minConfidence,
      });
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = (): void => {
    setLeverage(initial.leverageMultiplier);
    setMaxPosition(initial.maxPositionUsd);
    setMinConfidence(initial.minConfidence);
    setError(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mirror settings</CardTitle>
        {savedAt && Date.now() - savedAt < 3000 ? (
          <Badge tone="green" dot>saved</Badge>
        ) : dirty ? (
          <Badge tone="yellow">unsaved</Badge>
        ) : (
          <Badge tone="neutral">synced</Badge>
        )}
      </CardHeader>
      <CardBody className="space-y-5">
        <Slider
          label="Leverage multiplier"
          hint="Relative to the agent's leverage. 1.0 = match agent; 0.5 = half; 2.0 = double. Capped at protocol max."
          value={leverage}
          min={0.1}
          max={2.0}
          step={0.1}
          displayValue={`${leverage.toFixed(1)}x`}
          onChange={setLeverage}
        />
        <Slider
          label="Max collateral per trade"
          hint="Hard cap per mirrored position. The mirror is always ≤ agent collateral, and always ≤ this cap."
          value={maxPosition}
          min={1}
          max={500}
          step={1}
          displayValue={`$${maxPosition}`}
          onChange={setMaxPosition}
        />
        <Slider
          label="Minimum agent confidence"
          hint="Skip mirrors when the agent's decision is less than this confident. 30% is the agent-wide minimum."
          value={minConfidence}
          min={0.3}
          max={1.0}
          step={0.05}
          displayValue={`${Math.round(minConfidence * 100)}%`}
          onChange={setMinConfidence}
        />

        {error ? (
          <div className="font-mono text-[11px] text-accent-red">{error}</div>
        ) : null}

        <div className="flex items-center gap-2 border-t border-border/60 pt-3">
          <Button variant="primary" onClick={handleSave} disabled={!dirty || saving}>
            {saving ? 'saving…' : 'Save'}
          </Button>
          <Button variant="ghost" onClick={handleReset} disabled={!dirty || saving}>
            reset
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

interface SliderProps {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  displayValue: string;
  onChange: (value: number) => void;
}

function Slider({ label, hint, value, min, max, step, displayValue, onChange }: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-xs font-semibold text-text-primary">{label}</span>
        <span className="font-mono text-sm font-semibold tabular-nums text-accent">{displayValue}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full cursor-pointer appearance-none bg-transparent [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-border [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:-translate-y-[5px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:shadow-[0_0_8px_var(--color-accent)] [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-accent [&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-border"
        style={{
          background: `linear-gradient(to right, var(--color-accent) 0%, var(--color-accent) ${pct}%, var(--color-border) ${pct}%, var(--color-border) 100%)`,
          height: '6px',
          borderRadius: '9999px',
        }}
      />
      <p className="font-mono text-[10px] leading-relaxed text-text-tertiary">{hint}</p>
    </div>
  );
}
