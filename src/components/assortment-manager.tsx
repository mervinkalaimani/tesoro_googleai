import { useEffect, useMemo, useState } from "react";
import { Check, EyeOff, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addAssortment,
  deleteAssortment,
  fetchAssortmentUsage,
  fetchAssortments,
  renameAssortment,
  setAssortmentRetired,
  type Assortment,
  type AssortmentUsage,
} from "@/lib/assortments";

/**
 * The assortment vocabulary, kept by hand.
 *
 * Renaming is the interesting one: it rewrites every car and catalogue entry
 * that used the old spelling, so renaming "Acrylic" to "Acrylic case" is also
 * how the two become one line instead of two. Deleting is refused while
 * anything uses the name — retiring hides it from the pickers and leaves the
 * cars that carry it alone.
 */
export function AssortmentManager() {
  const [rows, setRows] = useState<Assortment[]>([]);
  const [usage, setUsage] = useState<AssortmentUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [adding, setAdding] = useState("");

  const load = async () => {
    setLoading(true);
    const [list, used] = await Promise.all([fetchAssortments(), fetchAssortmentUsage()]);
    setRows(list);
    setUsage(used);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const usedBy = useMemo(() => {
    const map = new Map<string, number>();
    for (const u of usage) map.set(u.name.toLowerCase(), Number(u.cars) + Number(u.entries));
    return map;
  }, [usage]);

  const countFor = (name: string) => usedBy.get(name.trim().toLowerCase()) ?? 0;

  const add = async () => {
    const name = adding.trim();
    if (!name) return;
    setBusy("add");
    const res = await addAssortment(name);
    setBusy(null);
    if (!res.success) {
      toast.error("Could not add it", { description: res.error });
      return;
    }
    setAdding("");
    toast.success(`Added ${name}`);
    void load();
  };

  const rename = async () => {
    if (!editing) return;
    const row = rows.find((r) => r.id === editing.id);
    if (!row) return;
    const to = editing.name.trim();
    if (!to || to === row.name) {
      setEditing(null);
      return;
    }
    setBusy(editing.id);
    const res = await renameAssortment(row.name, to);
    setBusy(null);
    setEditing(null);
    if (!res.success) {
      toast.error("Could not rename it", { description: res.error });
      return;
    }
    toast.success(`${row.name} is now ${to}`, {
      description: res.moved
        ? `${res.moved} ${res.moved === 1 ? "car" : "cars"} moved with it.`
        : "Nothing was using the old name.",
    });
    void load();
  };

  const retire = async (row: Assortment) => {
    setBusy(row.id);
    const res = await setAssortmentRetired(row.id, !row.retired);
    setBusy(null);
    if (!res.success) {
      toast.error("Could not change it", { description: res.error });
      return;
    }
    void load();
  };

  const remove = async (row: Assortment) => {
    const used = countFor(row.name);
    if (used > 0) {
      toast.error(`${row.name} is in use`, {
        description: `${used} cars and entries still carry it. Rename it onto another name to merge them, or retire it.`,
      });
      return;
    }
    setBusy(row.id);
    const res = await deleteAssortment(row.id);
    setBusy(null);
    if (!res.success) {
      toast.error("Could not delete it", { description: res.error });
      return;
    }
    toast.success(`Deleted ${row.name}`);
    void load();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-xs">
        <p className="text-sm font-medium text-foreground">Add an assortment</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Everything here is what the pickers offer. Nobody can type one that is not on this list.
        </p>
        <div className="mt-3 flex gap-2">
          <Input
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void add()}
            placeholder="Team Transport, Qube Carz, Acrylic case…"
            className="h-9 text-sm"
          />
          <Button
            type="button"
            size="sm"
            onClick={() => void add()}
            disabled={!adding.trim() || busy === "add"}
            className="gap-1.5"
          >
            {busy === "add" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Plus className="size-3.5" />
            )}
            Add
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xs">
        <div className="border-b border-border/70 bg-muted/30 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {loading ? "Loading…" : `${rows.length} assortments`}
        </div>
        <div className="divide-y divide-border/50">
          {rows.map((row) => {
            const used = countFor(row.name);
            const isEditing = editing?.id === row.id;
            return (
              <div key={row.id} className="flex items-center gap-2 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  {isEditing ? (
                    <Input
                      autoFocus
                      value={editing.name}
                      onChange={(e) => setEditing({ id: row.id, name: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void rename();
                        if (e.key === "Escape") setEditing(null);
                      }}
                      className="h-8 text-sm"
                    />
                  ) : (
                    <>
                      <p
                        className={`truncate text-sm font-medium ${
                          row.retired ? "text-muted-foreground line-through" : "text-foreground"
                        }`}
                      >
                        {row.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {used === 0 ? "Not used yet" : `${used.toLocaleString()} cars and entries`}
                        {row.retired && " · hidden from pickers"}
                      </p>
                    </>
                  )}
                </div>

                {busy === row.id ? (
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                ) : isEditing ? (
                  <>
                    <Button type="button" size="sm" variant="ghost" onClick={() => void rename()}>
                      <Check className="size-4 text-emerald-500" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditing(null)}
                    >
                      <X className="size-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      title="Rename everywhere it is written — this is also how two spellings merge"
                      onClick={() => setEditing({ id: row.id, name: row.name })}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      title={row.retired ? "Offer it again" : "Hide it from the pickers"}
                      onClick={() => void retire(row)}
                    >
                      <EyeOff className={`size-3.5 ${row.retired ? "text-amber-500" : ""}`} />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      title={used > 0 ? "In use — rename or retire it instead" : "Delete"}
                      onClick={() => void remove(row)}
                      className={used > 0 ? "opacity-40" : ""}
                    >
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
