import { Skeleton } from "@/components/ui/skeleton";

export function TransitTrackerSkeleton({ wide = true }: { wide?: boolean }) {
  return (
    <div
      className={`card-elevated flex min-w-0 flex-col overflow-hidden ${wide ? "lg:col-span-2" : "lg:col-span-3"}`}
      aria-busy="true"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border p-4">
        <div className="min-w-0 space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-28" />
        </div>
        <Skeleton className="h-4 w-28" />
      </div>
      <ul className="divide-y divide-border/60">
        {[0, 1, 2, 3].map((i) => (
          <li key={i} className="space-y-2 p-4">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-10" />
            </div>
            <div className="flex gap-1">
              <Skeleton className="h-4 w-14 rounded-full" />
              <Skeleton className="h-4 w-16 rounded-full" />
            </div>
            <Skeleton className="h-3 w-2/3" />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PeakPurchaseSkeleton() {
  return (
    <div className="card-elevated flex min-w-0 flex-col overflow-hidden p-4" aria-busy="true">
      <div className="mb-3 flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-7 w-28 rounded-md" />
      </div>
      <ul className="flex min-h-[260px] flex-1 flex-col justify-between gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <li key={i} className="flex flex-1 flex-col justify-center gap-1.5">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-12" />
            </div>
            <Skeleton className="h-2 w-full rounded-full" />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TopListSkeleton() {
  return (
    <div className="card-elevated min-w-0 overflow-hidden p-4" aria-busy="true">
      <div className="mb-3 flex items-center justify-between">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-3 w-12" />
      </div>
      <ul className="space-y-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <li key={i} className="space-y-1">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-3 w-8" />
            </div>
            <Skeleton className="h-1 w-full rounded-full" />
          </li>
        ))}
      </ul>
    </div>
  );
}
