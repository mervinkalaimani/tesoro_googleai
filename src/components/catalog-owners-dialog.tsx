import { useState, useMemo } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Calendar,
  Search,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import type { CatalogCarOwner } from "@/lib/catalog";
import { formatDayMonthYear } from "@/lib/format";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type SortCol = "name" | "date";
type SortDir = "asc" | "desc";

export function parseDateVal(val: string): number {
  if (!val || val === "—") return 0;
  // Try ISO / standard date parse
  const t = Date.parse(val);
  if (!Number.isNaN(t)) return t;

  // Try DD/MM/YYYY or DD-MM-YYYY
  const m = val.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) {
    const d = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10) - 1;
    const y = parseInt(m[3], 10);
    return new Date(y, mo, d).getTime();
  }

  return 0;
}

export function CatalogOwnersDialog({
  open,
  onClose,
  carName,
  owners,
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  carName?: string;
  owners: CatalogCarOwner[];
  loading?: boolean;
}) {
  const [search, setSearch] = useState("");
  // Default: sort by date added
  const [sortCol, setSortCol] = useState<SortCol>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const toggleSort = (col: SortCol) => {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      // Default to desc for date, asc for name
      setSortDir(col === "date" ? "desc" : "asc");
    }
  };

  /** People, not rows: somebody with two boxes of it is one collector. */
  const people = useMemo(() => new Set(owners.map((o) => o.auth_uid)).size, [owners]);

  /** Whether the casting is owned in more than one box between these people. */
  const mixedAssortments = useMemo(
    () => new Set(owners.map((o) => o.assortment || "")).size > 1,
    [owners],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return owners;
    return owners.filter(
      (o) =>
        o.display_name.toLowerCase().includes(q) ||
        o.user_id.toLowerCase().includes(q) ||
        (o.assortment || "").toLowerCase().includes(q) ||
        o.date_added.toLowerCase().includes(q),
    );
  }, [owners, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const flip = sortDir === "desc" ? -1 : 1;
      if (sortCol === "name") {
        const na = a.display_name || a.user_id || "";
        const nb = b.display_name || b.user_id || "";
        return flip * na.localeCompare(nb, undefined, { numeric: true, sensitivity: "base" });
      } else {
        const da = parseDateVal(a.date_added);
        const db = parseDateVal(b.date_added);
        if (da !== db) return flip * (da - db);
        return (a.display_name || "").localeCompare(b.display_name || "");
      }
    });
  }, [filtered, sortCol, sortDir]);

  const displayDate = (raw: string) => {
    if (!raw || raw === "—") return "—";
    const formatted = formatDayMonthYear(raw);
    return formatted || raw;
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        id="catalog-owners-dialog"
        className="max-w-lg sm:max-w-xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl border-border bg-background shadow-2xl"
      >
        <DialogHeader className="p-4 sm:p-5 pb-3 border-b border-border/80">
          <div className="flex items-center gap-2 text-primary font-semibold text-xs tracking-wider uppercase">
            <Users className="size-4" />
            <span>People who own this car</span>
          </div>
          <DialogTitle className="text-lg sm:text-xl font-bold tracking-tight text-foreground truncate mt-1">
            {carName || "Casting Owners"}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {people} {people === 1 ? "collector has" : "collectors have"} added this car to their
            collection.
          </DialogDescription>

          {owners.length > 5 && (
            <div className="relative mt-2">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter by user name..."
                className="h-8 pl-8 text-xs bg-muted/30"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          )}
        </DialogHeader>

        {/* Table header with sort buttons */}
        <div className="flex items-center justify-between border-b border-border/60 bg-muted/40 px-4 py-2 text-xs font-semibold text-muted-foreground">
          <button
            type="button"
            onClick={() => toggleSort("name")}
            className="flex items-center gap-1.5 hover:text-foreground transition-colors cursor-pointer"
            title="Sort by User Name"
          >
            <span>User Name</span>
            {sortCol === "name" ? (
              sortDir === "asc" ? (
                <ArrowUp className="size-3.5 text-primary" />
              ) : (
                <ArrowDown className="size-3.5 text-primary" />
              )
            ) : (
              <ArrowUpDown className="size-3 opacity-40" />
            )}
          </button>

          <button
            type="button"
            onClick={() => toggleSort("date")}
            className="flex items-center gap-1.5 hover:text-foreground transition-colors cursor-pointer text-right"
            title="Sort by Date Added"
          >
            <span>Date Added</span>
            {sortCol === "date" ? (
              sortDir === "asc" ? (
                <ArrowUp className="size-3.5 text-primary" />
              ) : (
                <ArrowDown className="size-3.5 text-primary" />
              )
            ) : (
              <ArrowUpDown className="size-3 opacity-40" />
            )}
          </button>
        </div>

        {/* List Body */}
        <div className="flex-1 overflow-y-auto min-h-[160px] max-h-[50vh] divide-y divide-border/40 p-1 sm:p-2">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-sm text-muted-foreground gap-2">
              <Users className="size-6 animate-pulse text-muted-foreground/60" />
              <span>Loading collectors...</span>
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-sm text-muted-foreground">
              <UserCheck className="size-8 text-muted-foreground/40 mb-2" />
              <p className="font-medium text-foreground">
                {search ? "No matching collectors found" : "No collectors have added this car yet"}
              </p>
              <p className="text-xs text-muted-foreground/80 mt-0.5">
                {search
                  ? "Try a different search term"
                  : "When a user adds this casting, they will appear here."}
              </p>
            </div>
          ) : (
            sorted.map((u) => (
              <div
                key={`${u.auth_uid}@${u.assortment ?? ""}`}
                className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/30 transition-colors"
              >
                <div className="min-w-0 flex items-center gap-2.5">
                  <div className="size-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold uppercase shrink-0">
                    {(u.display_name || u.user_id || "U").charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {u.display_name}
                    </p>
                    {u.user_id && u.display_name !== u.user_id && (
                      <p className="text-[11px] text-muted-foreground font-mono truncate">
                        @{u.user_id}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0 font-medium">
                  {/* Which box theirs came in, when the casting is catalogued in
                      more than one. Everybody owning the same one says nothing,
                      so it only appears where the answers differ. */}
                  {mixedAssortments && u.assortment && (
                    <span className="rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-[11px]">
                      {u.assortment}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="size-3.5 text-muted-foreground/60" />
                    {displayDate(u.date_added)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-border/80 flex items-center justify-between bg-muted/20">
          <span className="text-xs text-muted-foreground">
            Sorted by {sortCol === "date" ? "Date Added" : "User Name"} (
            {sortDir === "asc" ? "Ascending" : "Descending"})
          </span>
          <Button size="sm" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
