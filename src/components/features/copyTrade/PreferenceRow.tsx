interface PreferenceRowProps {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  suffix: string;
}

export function PreferenceRow({ label, hint, value, min, max, step, onChange, suffix }: PreferenceRowProps) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-xs uppercase tracking-wider text-text-secondary">
          {label}
        </span>
        <span className="font-mono text-lg font-bold tabular-nums text-text-primary">
          {value}{suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="mt-2 w-full accent-accent-green"
      />
      <p className="mt-1 font-mono text-[10px] text-text-muted">{hint}</p>
    </div>
  );
}
