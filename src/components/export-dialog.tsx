import { useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
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
import { SegmentControl } from "@/components/segment-control";
import { exportCsv, type CsvColumn } from "@/lib/csv";
import { buildReportHtml, printReport } from "@/lib/pdf-report";
import type { Diecast } from "@/lib/types";

/**
 * The six that describe a casting on a shelf rather than a transaction: what it
 * is, who made it, which run it came from, its number, and where it came from.
 * That is what a collection report is for, and it is a much better opening hand
 * than every column ticked.
 */
export const DEFAULT_EXPORT_KEYS = ["name", "brand", "assortment", "series", "carNumber", "seller"];

type Format = "pdf" | "csv";

const FORMATS = [
  { value: "pdf" as const, label: "PDF report" },
  { value: "csv" as const, label: "CSV" },
];

export function ExportDialog({
  open,
  onOpenChange,
  name,
  rows,
  columns,
  title = "Export",
  scopeLabel,
  owner,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  name: string;
  rows: Diecast[];
  columns: CsvColumn<Diecast>[];
  title?: string;
  /** What this set of rows is, printed on the report. */
  scopeLabel?: string;
  owner?: string;
}) {
  const allKeys = useMemo(() => columns.map((c) => c.key), [columns]);
  const defaults = useMemo(() => allKeys.filter((k) => DEFAULT_EXPORT_KEYS.includes(k)), [allKeys]);
  const [selected, setSelected] = useState<string[]>(defaults);
  const [format, setFormat] = useState<Format>("pdf");

  // Reopening starts from the defaults again rather than from whatever was
  // last ticked — the default is the recommendation, not a memory.
  useEffect(() => {
    if (open) setSelected(defaults);
  }, [open, defaults]);

  const toggle = (key: string) =>
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  // Kept in the order the columns are declared, so ticking them in a different
  // order does not shuffle the report's columns.
  const chosen = columns.filter((c) => selected.includes(c.key));

  const run = () => {
    if (format === "csv") {
      exportCsv(name, rows, chosen);
    } else {
      printReport(
        buildReportHtml(rows, chosen, {
          title: title.replace(/^export\s+/i, "") || "Collection",
          subtitle: scopeLabel,
          owner,
        }),
      );
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {rows.length.toLocaleString()} car{rows.length === 1 ? "" : "s"}
            {scopeLabel ? ` · ${scopeLabel}` : ""}. Pick the columns to include.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <SegmentControl value={format} onChange={setFormat} options={FORMATS} className="h-8" />
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() => setSelected(defaults)}
            >
              Reset
            </button>
            <span className="text-muted-foreground">·</span>
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
        </div>

        <div className="grid max-h-[45vh] grid-cols-2 gap-2 overflow-auto rounded-md border border-border p-3 sm:grid-cols-3">
          {columns.map((c) => (
            <label key={c.key} className="flex min-w-0 cursor-pointer items-center gap-2 text-xs">
              <Checkbox checked={selected.includes(c.key)} onCheckedChange={() => toggle(c.key)} />
              <span className="truncate">{c.label}</span>
            </label>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          {format === "pdf"
            ? "Opens your print dialog — choose “Save as PDF” as the destination. Landscape A4, with a summary and the leading brands and series."
            : "Downloads a .csv you can open in Sheets or Excel."}
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={chosen.length === 0 || rows.length === 0} onClick={run}>
            {format === "pdf" ? (
              <FileText className="size-4" />
            ) : (
              <FileSpreadsheet className="size-4" />
            )}
            {format === "pdf" ? "Create report" : "Download CSV"}
            <Download className="size-4 opacity-60" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
