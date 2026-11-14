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
    <div className="card-elevated flex min-w-0 flex-col overflow-hidden p-4" aria-busy="true">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="space-y-2">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-3 w-20" />
        </div>
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-7 w-28 rounded-md" />
          <Skeleton className="h-7 w-24 rounded-md" />
        </div>
      </div>
      <ul className="flex min-h-[260px] flex-1 flex-col justify-between gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <li key={i} className="flex flex-1 flex-col justify-center gap-1.5">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-3 w-12" />
            </div>
            <Skeleton className="h-2 w-full rounded-full" />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A column of bordered rows: a thumbnail or avatar, two lines, and a trailing control. */
export function RowListSkeleton({ rows = 6, thumb = true }: { rows?: number; thumb?: boolean }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="card-elevated flex items-center gap-3 p-3">
          {thumb && <Skeleton className="size-10 shrink-0 rounded-lg" />}
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="h-7 w-20 shrink-0 rounded-md" />
        </div>
      ))}
    </div>
  );
}

/** Table body rows for a table whose header is already on screen. */
export function TableRowsSkeleton({ cols, rows = 6 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} className="border-t border-border/60" aria-busy="true">
          {Array.from({ length: cols }, (_, c) => (
            <td key={c} className="px-3 py-3">
              <Skeleton className={c === 0 ? "h-4 w-32" : "h-4 w-16"} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** Tiles for a card grid; the caller supplies the grid classes so the columns match. */
export function TileGridSkeleton({ className, tiles = 12 }: { className: string; tiles?: number }) {
  return (
    <div className={className} aria-busy="true" aria-label="Loading">
      {Array.from({ length: tiles }, (_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="aspect-[3/4] w-full rounded-xl" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      ))}
    </div>
  );
}
