'use client';

import { useState } from 'react';
import Link from 'next/link';
import { DEFAULT_MANDATE, type MandateConfig } from '@/types/mandate';

export function MandateForm() {
  const [mandate, setMandate] = useState<MandateConfig>(DEFAULT_MANDATE);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  function update<K extends keyof MandateConfig>(key: K, value: MandateConfig[K]): void {
    setMandate((m) => ({ ...m, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/mandate/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mandate),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      // Persist locally for the dashboard. Real TWAK connect flow is
      // wired into Phase 5 / Phase 7 demo prep.
      window.localStorage.setItem('neurodegen-v2-mandate', JSON.stringify(mandate));
      setAccepted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (accepted) {
    return (
      <div className="mt-10 rounded-lg border border-border bg-surface p-6">
        <h2 className="font-display text-xl text-text-primary">Mandate saved</h2>
        <p className="mt-2 text-text-secondary">
          Your mandate is saved locally. Connect Trust Wallet to grant the agent
          its execution scope — coming in the live trading window.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/agent"
            className="rounded-md bg-accent px-4 py-2 font-mono text-[12px] text-black hover:bg-accent/90"
          >
            View the live committee
          </Link>
          <Link
            href="/journal"
            className="rounded-md border border-border px-4 py-2 font-mono text-[12px] text-text-secondary hover:border-accent hover:text-text-primary"
          >
            Browse past sessions
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-10 space-y-6 rounded-lg border border-border bg-surface p-6">
      <Slider
        label="Max drawdown"
        suffix="%"
        value={mandate.maxDrawdownPct * 100}
        min={5}
        max={28}
        step={1}
        onChange={(v) => update('maxDrawdownPct', v / 100)}
      />
      <Slider
        label="Max per token"
        suffix="%"
        value={mandate.maxPositionPct * 100}
        min={1}
        max={20}
        step={1}
        onChange={(v) => update('maxPositionPct', v / 100)}
      />
      <Slider
        label="Daily loss cap"
        suffix="%"
        value={mandate.dailyLossCapPct * 100}
        min={1}
        max={15}
        step={1}
        onChange={(v) => update('dailyLossCapPct', v / 100)}
      />
      <Select
        label="Risk level"
        value={mandate.riskLevel}
        onChange={(v) => update('riskLevel', v as MandateConfig['riskLevel'])}
        options={[
          { value: 'conservative', label: 'Conservative (0.5×)' },
          { value: 'moderate', label: 'Moderate (1.0×)' },
          { value: 'aggressive', label: 'Aggressive (1.5×)' },
        ]}
      />
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-accent px-4 py-3 font-mono text-[12px] text-black hover:bg-accent/90 disabled:opacity-50"
      >
        {submitting ? 'Saving…' : 'Save mandate'}
      </button>
    </form>
  );
}

function Slider({
  label,
  suffix,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  suffix: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <div className="flex justify-between font-mono text-[11px] uppercase tracking-[0.16em] text-text-tertiary">
        <span>{label}</span>
        <span>
          {value.toFixed(0)}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-accent"
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-tertiary">
        {label}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-[12px] text-text-primary"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
