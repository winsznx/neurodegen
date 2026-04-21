'use client';

import Link from 'next/link';
import { Card, CardBody, Badge } from '@/components/ui';
import { cn } from '@/lib/utils/cn';

export interface OnboardingProgressProps {
  connected: boolean;
  funded: boolean;
  signerGranted: boolean;
  active: boolean;
  usdtBalance: number | null;
  onToggleActive: () => void;
  togglingActive: boolean;
}

type StepId = 'connect' | 'fund' | 'signer' | 'active';

interface Step {
  id: StepId;
  title: string;
  description: string;
  done: boolean;
  current: boolean;
  cta: null | { label: string; onClick?: () => void; href?: string; disabled?: boolean };
}

export function OnboardingProgress(props: OnboardingProgressProps) {
  const { connected, funded, signerGranted, active } = props;

  const steps: Step[] = [
    {
      id: 'connect',
      title: 'Connect',
      description: 'Privy-managed embedded wallet on BNB Chain.',
      done: connected,
      current: !connected,
      cta: null,
    },
    {
      id: 'fund',
      title: 'Fund wallet',
      description:
        props.usdtBalance === null
          ? 'Send USDT to your wallet to mirror trades.'
          : `$${props.usdtBalance.toFixed(2)} USDT available — mirror minimum is whatever ratio you set.`,
      done: funded,
      current: connected && !funded,
      cta: connected && !funded ? { label: 'Fund ↓', href: '#wallet' } : null,
    },
    {
      id: 'signer',
      title: 'Grant session signer',
      description: 'One-time consent so the agent can submit MYX orders on your behalf. Revocable any time.',
      done: signerGranted,
      current: connected && funded && !signerGranted,
      cta: connected && !signerGranted ? { label: 'Grant →', href: '/onboard' } : null,
    },
    {
      id: 'active',
      title: 'Start mirroring',
      description: active
        ? 'Active. The next agent entry that passes your filters will mirror.'
        : 'Your subscription is paused. Flip it on when you\'re ready.',
      done: active,
      current: connected && funded && signerGranted && !active,
      cta: connected && signerGranted
        ? {
            label: props.togglingActive ? '…' : active ? 'Pause' : 'Activate',
            onClick: props.onToggleActive,
            disabled: props.togglingActive,
          }
        : null,
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const complete = doneCount === steps.length;

  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
              getting started
            </span>
            <Badge tone={complete ? 'green' : 'yellow'}>
              {doneCount}/{steps.length} complete
            </Badge>
          </div>
          {complete ? (
            <span className="font-mono text-[10px] uppercase tracking-wider text-accent-green">
              all set — mirrors will appear below as the agent trades.
            </span>
          ) : null}
        </div>

        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <StepCard key={step.id} index={index + 1} step={step} />
          ))}
        </ol>
      </CardBody>
    </Card>
  );
}

function StepCard({ index, step }: { index: number; step: Step }) {
  const state = step.done ? 'done' : step.current ? 'current' : 'pending';
  return (
    <li
      className={cn(
        'relative flex flex-col gap-2 rounded-sm border p-3',
        state === 'done' && 'border-accent-green/40 bg-accent-green/5',
        state === 'current' && 'border-accent/50 bg-accent/5',
        state === 'pending' && 'border-border/70 bg-surface/30 opacity-80'
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'grid size-5 place-items-center rounded-full font-mono text-[10px] font-bold',
              state === 'done'
                ? 'bg-accent-green text-background'
                : state === 'current'
                ? 'bg-accent text-background'
                : 'bg-border text-text-tertiary'
            )}
          >
            {state === 'done' ? '✓' : index}
          </span>
          <span className="font-mono text-xs font-semibold text-text-primary">{step.title}</span>
        </div>
      </div>
      <p className="font-mono text-[11px] leading-relaxed text-text-secondary">{step.description}</p>
      {step.cta && state === 'current' ? (
        <div className="pt-1">
          {step.cta.href ? (
            <Link
              href={step.cta.href}
              className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-accent hover:underline"
            >
              {step.cta.label}
            </Link>
          ) : (
            <button
              type="button"
              onClick={step.cta.onClick}
              disabled={step.cta.disabled}
              className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-accent hover:underline disabled:opacity-60"
            >
              {step.cta.label}
            </button>
          )}
        </div>
      ) : null}
    </li>
  );
}
