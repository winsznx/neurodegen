import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

type BadgeTone = 'neutral' | 'green' | 'red' | 'blue' | 'yellow' | 'purple';

interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
  dot?: boolean;
}

const TONE_STYLES: Record<BadgeTone, string> = {
  neutral: 'bg-border/40 text-text-primary',
  green: 'bg-accent-green/15 text-accent-green',
  red: 'bg-accent-red/15 text-accent-red',
  blue: 'bg-accent-blue/15 text-accent-blue',
  yellow: 'bg-accent-yellow/15 text-accent-yellow',
  purple: 'bg-accent-purple/15 text-accent-purple',
};

const DOT_STYLES: Record<BadgeTone, string> = {
  neutral: 'bg-text-secondary',
  green: 'bg-accent-green',
  red: 'bg-accent-red',
  blue: 'bg-accent-blue',
  yellow: 'bg-accent-yellow',
  purple: 'bg-accent-purple',
};

export function Badge({ tone = 'neutral', children, className, dot }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider',
        TONE_STYLES[tone],
        className
      )}
    >
      {dot && <span className={cn('size-1.5 rounded-full', DOT_STYLES[tone])} />}
      {children}
    </span>
  );
}
