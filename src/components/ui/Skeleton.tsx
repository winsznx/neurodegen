import { cn } from '@/lib/utils/cn';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded bg-surface-hover',
        'before:absolute before:inset-0 before:-translate-x-full',
        'before:bg-linear-to-r before:from-transparent before:via-border before:to-transparent',
        "before:content-[''] before:animate-[shimmer_1.6s_infinite]",
        className
      )}
    />
  );
}
