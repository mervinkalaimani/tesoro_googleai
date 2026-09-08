import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { exportCsv, type CsvColumn } from "@/lib/csv";

export function ExportDialog<T>({
  open,
  onOpenChange,
  name,
  rows,
  columns,
  title = "Export CSV",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  name: string;
  rows: T[];
  columns: CsvColumn<T>[];
  title?: string;
}) {
  const allKeys = useMemo(() => columns.map((c) => c.key), [columns]);
  const [selected, setSelected] = useState<string[]>(allKeys);

  const toggle = (key: string) =>
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const chosen = columns.filter((c) => selected.includes(c.key));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {rows.length.toLocaleString()} row{rows.length === 1 ? "" : "s"} with your current
            filters and sort. Pick the columns to include.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => setSelected(allKeys)}
          >
            Select all
          </button>
          <span className="text-muted-foreground">·</span>
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => setSelected([])}
          >
            Clear
          </button>
        </div>

        <div className="grid max-h-[45vh] grid-cols-2 gap-2 overflow-auto rounded-md border border-border p-3 sm:grid-cols-3">
          {columns.map((c) => (
            <label key={c.key} className="flex min-w-0 cursor-pointer items-center gap-2 text-xs">
              <Checkbox checked={selected.includes(c.key)} onCheckedChange={() => toggle(c.key)} />
              <span className="truncate">{c.label}</span>
            </label>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={chosen.length === 0 || rows.length === 0}
            onClick={() => {
              exportCsv(name, rows, chosen);
              onOpenChange(false);
            }}
          >
            <Download className="size-4" />
            Export {rows.length.toLocaleString()} rows
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
