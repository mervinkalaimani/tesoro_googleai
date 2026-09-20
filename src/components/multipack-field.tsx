import { useMemo, useState } from "react";
import { Package, Plus, X } from "lucide-react";

import type { CatalogCar } from "@/lib/catalog";
import { useCatalog } from "@/lib/catalog-store";
import { carSubLine } from "@/lib/car-subline";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

/**
 * A casting that is a box of cars rather than one car.
 *
 * Both forms that describe a casting need this — the catalogue's own dialog and
 * Add a car, which files a new casting on the way past — so it is one component
 * rather than two that drift. The cars inside are ordinary catalogue entries in
 * their own right; all this records is that they come in one package, bought
 * once, for one price.
 *
 * The contents are a separate table, and only admins may write it. Everyone
 * else can still say a casting *is* a pack and how big it is, which is the part
 * that travels with the entry itself.
 */

/** A catalogue entry's secondary line, in the spelling carSubLine expects. */
const subLineOf = (c: CatalogCar) =>
  carSubLine({
    brand: c.brand,
    assortment: c.assortment,
    series: c.series,
    subSeries: c.sub_series,
    carNumber: c.car_number,
  });

export function MultipackField({
  isPack,
  packSize,
  members,
  onPackChange,
  onSizeChange,
  onMembersChange,
  disabled = false,
  canEditMembers = true,
  selfCarId = "",
}: {
  isPack: boolean;
  /** The declared unit count, so "3 of 5 listed" can be said while part-filled. */
  packSize: number;
  /** What is in the box, as car_ids in the order they should read. */
  members: string[];
  onPackChange: (v: boolean) => void;
  onSizeChange: (v: number | null) => void;
  onMembersChange: (ids: string[]) => void;
  disabled?: boolean;
  /**
   * Whether this person may write the contents. The membership table is
   * admin-only, so offering the picker to anyone else is offering a save that
   * will be refused.
   */
  canEditMembers?: boolean;
  /** The entry being edited, which cannot be inside itself. */
  selfCarId?: string;
}) {
  const { catalog } = useCatalog();
  const [query, setQuery] = useState("");

  const byId = useMemo(() => {
    const m = new Map<string, CatalogCar>();
    for (const c of catalog) m.set(c.car_id.toUpperCase(), c);
    return m;
  }, [catalog]);

  /**
   * What can go in the box: anything in the catalogue that is not this entry
   * and is not itself a box, minus what is already in. The database refuses
   * both, but a list that offers them and then fails is a worse way to say so.
   */
  const choices = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const chosen = new Set(members.map((id) => id.toUpperCase()));
    const self = selfCarId.toUpperCase();
    const out: CatalogCar[] = [];
    for (const c of catalog) {
      const id = c.car_id.toUpperCase();
      if (c.is_multipack || chosen.has(id) || (self && id === self)) continue;
      const hay = `${c.name} ${c.make} ${c.model} ${c.variant ?? ""} ${c.brand} ${c.series}`;
      if (hay.toLowerCase().includes(q)) out.push(c);
      if (out.length >= 8) break;
    }
    return out;
  }, [query, members, catalog, selfCarId]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label className="flex cursor-pointer select-none items-center gap-2">
          <input
            type="checkbox"
            disabled={disabled}
            checked={isPack}
            onChange={(e) => onPackChange(e.target.checked)}
            className="size-4 rounded border-input accent-primary"
          />
          <span className="flex items-center gap-1.5 text-xs font-semibold">
            <Package className="size-3.5 text-primary" />
            This is a multipack
          </span>
        </label>
        <span className="flex-1 text-[11px] text-muted-foreground">
          A box of cars sold together, bought once, for one price.
        </span>
        {isPack && (
          <div className="flex items-center gap-2">
            <Label className="text-[11px] text-muted-foreground">Cars in the box</Label>
            <Input
              type="number"
              min={2}
              max={24}
              disabled={disabled}
              value={packSize || ""}
              onChange={(e) => onSizeChange(Number(e.target.value) || null)}
              className="h-8 w-16 bg-background text-center tabular-nums"
              aria-label="Cars in the box"
            />
          </div>
        )}
      </div>

      {isPack && (
        <div className="space-y-2 border-t border-border/50 pt-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold">What&rsquo;s inside</span>
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-primary">
              {packSize ? `${members.length} of ${packSize} listed` : `${members.length} listed`}
            </span>
          </div>

          {members.map((id, i) => {
            const m = byId.get(id.toUpperCase());
            return (
              <div
                key={id}
                className="flex items-center gap-2 rounded-md border border-border bg-background/60 p-1.5"
              >
                <span className="w-5 shrink-0 text-center text-[11px] font-semibold tabular-nums text-muted-foreground">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium">{m?.name || id}</div>
                  <div className="truncate text-[10px] text-muted-foreground">
                    {m ? subLineOf(m) : "Not in the catalogue"}
                  </div>
                </div>
                {canEditMembers && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    disabled={disabled}
                    onClick={() => onMembersChange(members.filter((x) => x !== id))}
                    aria-label={`Remove ${m?.name || id} from the pack`}
                    className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </Button>
                )}
              </div>
            );
          })}

          {canEditMembers ? (
            <div className="space-y-1">
              <Input
                disabled={disabled}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search the catalogue to add a car…"
                className="h-8 bg-background"
                aria-label="Add a car to the pack"
              />
              {/* In the flow rather than floating over it. Floating, the list
                  was clipped away to nothing: this sits inside a section with
                  `overflow-hidden` and inside the dialog's own scroller, and
                  either one is enough to hide an absolutely-positioned panel.
                  Pushing the rest of the form down costs nothing here. */}
              {choices.length > 0 && (
                <div className="max-h-56 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-lg">
                  {choices.map((c) => (
                    <button
                      key={c.car_id}
                      type="button"
                      onClick={() => {
                        onMembersChange([...members, c.car_id]);
                        setQuery("");
                      }}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium">{c.name}</div>
                        <div className="truncate text-[10px] text-muted-foreground">
                          {subLineOf(c)}
                        </div>
                      </div>
                      <Plus className="size-3.5 shrink-0 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              What is in the box is part of the shared catalogue, so it is listed there rather than
              here. The pack saves either way.
            </p>
          )}

          {packSize > 0 && members.length !== packSize && canEditMembers && (
            <p className="text-[11px] text-muted-foreground">
              {members.length < packSize
                ? `${packSize - members.length} still to add — you can finish this later.`
                : `${members.length - packSize} more than the box holds.`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
