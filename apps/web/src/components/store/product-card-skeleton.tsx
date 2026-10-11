import { Skeleton } from '@/components/ui/skeleton';

/** Mirrors the real card's shape so the swap doesn't shift the grid. */
export function ProductCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-panel border border-line">
      <Skeleton className="aspect-4/5 rounded-none" />
      <div className="space-y-2.5 p-4">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
        <div className="flex gap-1.5">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="size-5 rounded-full" />
          ))}
        </div>
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-10 w-full rounded-pill" />
      </div>
    </div>
  );
}
