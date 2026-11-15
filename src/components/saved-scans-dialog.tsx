import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BulkAddCarsDialog } from "@/components/bulk-add-cars-dialog";
import { deleteSavedScan, type SavedScan } from "@/lib/saved-scans";

const nameOf = (c: SavedScan["cars"][number]) =>
  [c.make, c.model, c.variant].filter(Boolean).join(" ") || "Unnamed car";

/**
 * The scans kept from the phone, to be added here. A scan is opened in the
 * bulk table with its prices still to type, and is removed once those cars are
 * saved, so what is listed is what is still to do.
 */
export function SavedScansDialog({
  open,
  onOpenChange,
  scans,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scans: SavedScan[];
  onChanged: () => void;
}) {
  const [reviewing, setReviewing] = useState<SavedScan | null>(null);

  return (
    <>
      <Dialog open={open && !reviewing} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Saved scans</DialogTitle>
            <DialogDescription>
              Scans you kept to add later. Open one to fill in the prices and save the cars.
            </DialogDescription>
          </DialogHeader>
          {scans.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Nothing saved. Tick “Save scans” when scanning to keep them here.
            </p>
          ) : (
            <ul className="space-y-2">
              {scans.map((s) => (
                <li
                  key={s.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-border/70 p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {s.cars.length} {s.cars.length === 1 ? "car" : "cars"}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {new Date(s.created_at).toLocaleString()}
                      </span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {s.cars.map(nameOf).join(", ")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button size="sm" onClick={() => setReviewing(s)}>
                      Review
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Delete this scan"
                      onClick={async () => {
                        await deleteSavedScan(s.id);
                        onChanged();
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <BulkAddCarsDialog
        open={reviewing !== null}
        onOpenChange={(v) => {
          if (!v) setReviewing(null);
        }}
        scanned={reviewing?.cars}
        onSaved={async () => {
          if (reviewing) await deleteSavedScan(reviewing.id);
          setReviewing(null);
          onChanged();
        }}
      />
    </>
  );
}
