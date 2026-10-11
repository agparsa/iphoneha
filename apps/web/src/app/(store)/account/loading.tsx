import { Skeleton } from '@/components/ui/skeleton';

/** Personal pages are rendered per request; a skeleton while they load, instead of a blank screen. */
export default function AccountLoading() {
  return (
    <div className="container-page grid gap-6 py-8">
      <Skeleton className="h-64 rounded-panel" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-52 rounded-panel" />
        ))}
      </div>
    </div>
  );
}
