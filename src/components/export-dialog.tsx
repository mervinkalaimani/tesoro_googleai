import { useEffect, useMemo, useState } from "react";
import {
  Download,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Loader2,
  Share2,
} from "lucide-react";
import { toast } from "sonner";
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
import { buildCsv, exportCsv, type CsvColumn } from "@/lib/csv";
import {
  canShareFiles,
  canvasToPdf,
  canvasToPng,
  downloadBlob,
  inlinePhotos,
  renderCanvas,
  shareFile,
} from "@/lib/export-share";
import { buildReportHtml, printReport } from "@/lib/pdf-report";
import type { Diecast } from "@/lib/types";

/**
 * The six that describe a casting on a shelf rather than a transaction: what it
 * is, who made it, which run it came from, its number, and where it came from.
 * That is what a collection report is for, and it is a much better opening hand
 * than every column ticked.
 */
export const DEFAULT_EXPORT_KEYS = ["name", "brand", "assortment", "series", "carNumber", "seller"];

type Format = "pdf" | "image" | "csv";

/** An image is one tall sheet; past this many cars it would outgrow what a canvas can hold. */
const IMAGE_MAX = 80;

const FORMATS = [
  { value: "pdf" as const, label: "PDF" },
  { value: "image" as const, label: "Image" },
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

  const [busy, setBusy] = useState<"" | "save" | "share">("");
  const canShare = useMemo(() => canShareFiles(), []);
  const reportMeta = {
    title: title.replace(/^export\s+/i, "") || "Collection",
    subtitle: scopeLabel,
    owner,
  };
  const stamp = new Date().toISOString().slice(0, 10);

  /** The report drawn as a picture, with photos inlined so the canvas is allowed to paint them. */
  const drawImage = async () => {
    const list = rows.slice(0, IMAGE_MAX);
    const photos = chosen.some((c) => c.key === "imageUrl")
      ? await inlinePhotos(list.map((r) => r.imageUrl || ""))
      : new Map<string, string>();
    const width = Math.min(1400, Math.max(760, 220 + chosen.length * 110));
    return renderCanvas(
      buildReportHtml(list, chosen, {
        ...reportMeta,
        mode: "image",
        width,
        photoSrc: (r) => photos.get(r.imageUrl || "") ?? "",
      }),
      width,
    );
  };

  const run = async (share: boolean) => {
    setBusy(share ? "share" : "save");
    try {
      const file = `${name}-${stamp}`;
      if (format === "csv") {
        if (share) {
          const csv = new Blob(["\ufeff" + buildCsv(rows, chosen)], { type: "text/csv" });
          if (!(await shareFile(csv, `${file}.csv`, reportMeta.title))) return;
        } else exportCsv(name, rows, chosen);
      } else if (format === "pdf" && !share) {
        // The print dialog makes a real, selectable PDF; a share sheet needs a file, below.
        printReport(buildReportHtml(rows, chosen, reportMeta));
      } else {
        const canvas = await drawImage();
        const isPdf = format === "pdf";
        const blob = isPdf ? await canvasToPdf(canvas) : await canvasToPng(canvas);
        const fileName = `${file}.${isPdf ? "pdf" : "png"}`;
        if (share) {
          if (!(await shareFile(blob, fileName, reportMeta.title))) return;
        } else downloadBlob(blob, fileName);
      }
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message || "Could not create the export.");
    } finally {
      setBusy("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
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
            ? "Opens your print dialog — choose “Save as PDF”. Landscape A4 with the VIIV letterhead. Anything the same on every car is shown once at the top."
            : format === "image"
              ? `A PNG of the same page, ready to send.${rows.length > IMAGE_MAX ? ` Shows the first ${IMAGE_MAX} cars; use PDF or CSV for all ${rows.length.toLocaleString()}.` : ""}`
              : "Downloads a .csv you can open in Sheets or Excel."}
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {canShare && (
            <Button
              variant="outline"
              disabled={chosen.length === 0 || rows.length === 0 || busy !== ""}
              onClick={() => void run(true)}
            >
              {busy === "share" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Share2 className="size-4" />
              )}
              Share
            </Button>
          )}
          <Button
            disabled={chosen.length === 0 || rows.length === 0 || busy !== ""}
            onClick={() => void run(false)}
          >
            {busy === "save" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : format === "csv" ? (
              <FileSpreadsheet className="size-4" />
            ) : format === "image" ? (
              <ImageIcon className="size-4" />
            ) : (
              <FileText className="size-4" />
            )}
            {format === "pdf"
              ? "Create report"
              : format === "image"
                ? "Download image"
                : "Download CSV"}
            <Download className="size-4 opacity-60" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
