import { cn } from '@/lib/utils';

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={cn('skeleton rounded-md', className)} aria-hidden />;
}

/**
 * Loading placeholders are decorative: the shapes are aria-hidden and the
 * wrapper carries a single polite status message instead, so a screen reader
 * hears "Loading…" once rather than a run of empty boxes.
 */
function Loading({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">Loading…</span>
      {children}
    </div>
  );
}

export function SkeletonTiles({ count = 4 }: { count?: number }) {
  return (
    <Loading className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-24 rounded-2xl" />
      ))}
    </Loading>
  );
}

export function SkeletonRows({ count = 5, height = 'h-9' }: { count?: number; height?: string }) {
  return (
    <Loading className="flex flex-col gap-2.5">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className={cn(height, 'rounded-lg')} />
      ))}
    </Loading>
  );
}

export function SkeletonCards({ count = 6 }: { count?: number }) {
  return (
    <Loading className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-44 rounded-2xl" />
      ))}
    </Loading>
  );
}
