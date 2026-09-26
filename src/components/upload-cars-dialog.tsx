import { normaliseStatus } from "@/lib/status";
import { useState, useRef, useId, useMemo, type ChangeEvent, type DragEvent } from "react";
import {
  Upload,
  FileSpreadsheet,
  FileCode,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Database,
  ArrowRight,
  RotateCcw,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { importDelta, parseCsvToDiecast } from "@/lib/csv";
import { CAR_CSV_COLUMNS } from "@/lib/car-columns";
import { assignCarIds, findCatalogEntry } from "@/lib/car-id";
import {
  useCars,
  useCarsActions,
  useCarsRefresh,
  useCarsUndo,
  withRenumbering,
} from "@/lib/cars-store";
import { tesoroRawToDiecast } from "@/lib/supabase-cars";
import type { Diecast } from "@/lib/types";

/**
 * Rows drawn before the "show all" button appears.
 *
 * ponytail: plain rows, no virtualisation. A 1,500-car file is 1,500 × 35 cells
 * if you ask for all of it, which is a visible pause. Reach for a windowed list
 * only if that pause starts to matter.
 */
const PREVIEW_CHUNK = 100;

interface UploadCarsDialogProps {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function UploadCarsDialog({
  trigger,
  open: controlledOpen,
  onOpenChange,
}: UploadCarsDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (val: boolean) => {
    if (isControlled) {
      onOpenChange?.(val);
    } else {
      setInternalOpen(val);
    }
  };

  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileInfo, setFileInfo] = useState<{
    name: string;
    size: string;
    type: "csv" | "json";
  } | null>(null);
  const [parsedCars, setParsedCars] = useState<Diecast[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  /**
   * How to put the collection back. `created` are ids the file brought that were
   * not there before; `overwritten` are the cars it replaced, as they were — an
   * import upserts on Car ID, so a re-import of an edited export changes rows
   * rather than adding them, and removing those would be the wrong reversal.
   */
  const [undoable, setUndoable] = useState<{
    mode: "local" | "remote";
    created: string[];
    overwritten: Diecast[];
  } | null>(null);
  const [undoing, setUndoing] = useState(false);
  /** How much of the preview is on screen; the rest is a click away. */
  const [rowsShown, setRowsShown] = useState(PREVIEW_CHUNK);

  const cars = useCars();
  const { bulkAddCars } = useCarsActions();
  const { undo } = useCarsUndo();
  const { refresh } = useCarsRefresh();

  const resetState = () => {
    setFileInfo(null);
    setParsedCars([]);
    setParseErrors([]);
    setUploading(false);
    setProgress(null);
    setSuccessMessage(null);
    setUndoable(null);
    setUndoing(false);
    setRowsShown(PREVIEW_CHUNK);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  /**
   * The rows as they will actually be written.
   *
   * A file carries what somebody typed; the three IDs are the app's to derive —
   * the Car ID from the casting, the shipping and order IDs from the seller and
   * the dates, counted against the collection the rows are joining. Deriving
   * them here rather than on the way in means the preview shows the numbers the
   * import will use, not blanks and a placeholder.
   */
  const previewCars = useMemo(() => {
    if (!parsedCars.length) return [];
    const identified = assignCarIds(parsedCars, cars);
    const numbered = withRenumbering(identified, cars);
    const byId = new Map(numbered.map((c) => [c.id, c]));
    // Only the imported rows; withRenumbering also returns neighbours whose own
    // numbers shift to make room, and those are not part of this file.
    return identified.map((c) => byId.get(c.id) ?? c);
  }, [parsedCars, cars]);

  /**
   * Which rows land on a casting the catalogue already holds.
   *
   * Every row gets a catalogue ID either way; the difference is whether it joins
   * an entry that exists or files a new one, and that is worth seeing before an
   * import of a hundred rows quietly adds forty castings.
   */
  const linkedIds = useMemo(
    () => new Set(previewCars.filter((c) => findCatalogEntry(c)).map((c) => c.id)),
    [previewCars],
  );

  /** What an import of these rows would add, and what it would replace. */
  const importEffect = () => importDelta(previewCars, cars);

  const handleFile = (file: File) => {
    resetState();
    const isJson = file.name.endsWith(".json");
    const isCsv =
      file.name.endsWith(".csv") || file.type.includes("csv") || file.type.includes("text/plain");

    if (!isJson && !isCsv) {
      setParseErrors(["Unsupported file format. Please upload a .csv or .json file."]);
      return;
    }

    const sizeFormatted =
      file.size > 1024 * 1024
        ? `${(file.size / (1024 * 1024)).toFixed(2)} MB`
        : `${Math.round(file.size / 1024)} KB`;

    setFileInfo({
      name: file.name,
      size: sizeFormatted,
      type: isJson ? "json" : "csv",
    });

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (!content) {
        setParseErrors(["File was empty."]);
        return;
      }

      if (isJson) {
        try {
          const raw = JSON.parse(content);
          if (!Array.isArray(raw)) {
            setParseErrors(["JSON must contain an array of cars."]);
            return;
          }
          // Convert if raw rows or already Diecast
          const cars: Diecast[] = raw.map((item, idx) => {
            if ("Car ID" in item) {
              return tesoroRawToDiecast(item);
            }
            return {
              id: item.id || `car-json-${Date.now().toString(36)}-${idx}`,
              name:
                item.name ||
                `${item.year || ""} ${item.make || ""} ${item.model || ""}`.trim() ||
                `Car #${idx + 1}`,
              make: item.make || "",
              model: item.model || "",
              variant: item.variant || "",
              year: item.year ? String(item.year) : "",
              brand: item.brand || item.manufacturer || "Hot Wheels",
              series: item.series || "",
              // Absent until now, so a JSON import quietly discarded all four.
              subSeries: item.subSeries || item.sub_series || "",
              carNumber: item.carNumber || item.car_number || "",
              colour: item.colour || item.color || "",
              type: item.type || "",
              assortment: item.assortment || "",
              size: item.size || "1/64",
              spent: Number(item.spent || item.cost || item.price || 0),
              mrp: Number(item.mrp || 0),
              seller: item.seller || "",
              status: normaliseStatus(item.status) || "In Hand",
              payment: item.payment || "Paid",
              paid: Number(item.paid || item.spent || 0),
              date: item.date || "",
              month: item.month || "",
              orderDate: item.orderDate || item.order_date || "",
              orderMonth: item.orderMonth || item.order_month || "",
              expectedDate: item.expectedDate || item.date || "",
              transitInfo: item.transitInfo || item.transit_info || "",
              shippingId: item.shippingId || item.shipping_id || "",
              orderId: item.orderId || item.order_id || "",
              deliveryPartner: item.deliveryPartner || item.delivery_partner || undefined,
              trackingId: item.trackingId || item.tracking_id || undefined,
              balance: Number(item.balance || 0),
              chase: Boolean(item.chase),
              favourite: Boolean(item.favourite || item.favorite),
              official: Boolean(item.official),
            };
          });

          setParsedCars(cars);
        } catch (err) {
          setParseErrors([`Failed to parse JSON: ${(err as Error).message}`]);
        }
      } else {
        const res = parseCsvToDiecast(content);
        if (res.errors.length > 0) {
          setParseErrors(res.errors);
        }
        setParsedCars(res.cars);
      }
    };

    reader.onerror = () => {
      setParseErrors(["Error reading file."]);
    };

    reader.readAsText(file);
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleImportLocal = () => {
    if (previewCars.length === 0) return;
    setUndoable({ mode: "local", ...importEffect() });
    bulkAddCars(previewCars);
    setSuccessMessage(
      `Added ${previewCars.length.toLocaleString()} ${previewCars.length === 1 ? "car" : "cars"} to your collection.`,
    );
  };

  /**
   * Put the collection back where the import found it.
   *
   * The offline import goes through the store, which already recorded how to
   * reverse itself, and undoing there is what the rest of the app uses. The
   * database upload writes past the store, so that one is reversed by hand.
   */
  const handleUndo = async () => {
    if (!undoable) return;
    setUndoing(true);
    try {
      if (undoable.mode === "local") {
        undo();
      } else {
        const { deleteCarsFromSupabase, seedCarsToSupabase } = await import("@/lib/supabase-cars");
        const removed = await deleteCarsFromSupabase(undoable.created);
        if (!removed.success) {
          setParseErrors([`Undo failed: ${removed.error || "Unknown error"}`]);
          return;
        }
        if (undoable.overwritten.length) {
          const restored = await seedCarsToSupabase(undoable.overwritten);
          if (!restored.success) {
            setParseErrors([`Undo restored nothing: ${restored.error || "Unknown error"}`]);
            return;
          }
        }
        await refresh();
      }
      setUndoable(null);
      setSuccessMessage(null);
      setOpen(false);
      resetState();
    } finally {
      setUndoing(false);
    }
  };

  const handleUploadToSupabase = async () => {
    if (previewCars.length === 0) return;
    setUploading(true);
    setProgress({ current: 0, total: previewCars.length });
    const effect = importEffect();

    try {
      const { seedCarsToSupabase } = await import("@/lib/supabase-cars");
      const res = await seedCarsToSupabase(previewCars, (curr, tot) => {
        setProgress({ current: curr, total: tot });
      });

      if (!res.success) {
        setParseErrors([`Supabase upload failed: ${res.error || "Unknown error"}`]);
        setUploading(false);
        return;
      }

      setUndoable({ mode: "remote", ...effect });
      setSuccessMessage(`Uploaded ${res.count.toLocaleString()} cars to the database.`);
      // Refresh live collection store
      await refresh();
    } catch (err) {
      setParseErrors([`Upload error: ${(err as Error).message}`]);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!uploading) {
          setOpen(v);
          if (!v) resetState();
        }
      }}
    >
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      {/* A column, not the default grid: the body scrolls and the footer stays
          put, so the import buttons are reachable however many rows the file
          brought. `gap-0` because the three bands carry their own borders. */}
      <DialogContent className="flex max-h-[92svh] flex-col gap-0 overflow-hidden p-0 max-w-[min(1100px,95vw)] sm:max-h-[90svh] sm:max-w-[min(1100px,95vw)] sm:p-0">
        <DialogHeader className="shrink-0 border-b border-border bg-muted/20 px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary">
              <Upload className="size-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">Upload & Import Cars</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Upload a CSV or JSON file to batch import or sync 1490+ cars to your Supabase
                collection.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {/* Dropzone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-all ${
              isDragging
                ? "border-primary bg-primary/5 shadow-inner"
                : "border-border/80 bg-muted/10 hover:border-primary/50 hover:bg-muted/30"
            }`}
          >
            <input
              id={fileInputId}
              ref={fileInputRef}
              type="file"
              accept=".csv,.json,text/csv,application/json"
              onChange={handleInputChange}
              className="hidden"
            />
            <div className="mb-2 grid size-12 place-items-center rounded-full bg-background shadow-sm border border-border">
              {fileInfo?.type === "json" ? (
                <FileCode className="size-6 text-primary" />
              ) : (
                <FileSpreadsheet className="size-6 text-primary" />
              )}
            </div>
            <p className="text-sm font-medium text-foreground">
              {fileInfo ? (
                <span>
                  Selected: <span className="font-semibold text-primary">{fileInfo.name}</span> (
                  {fileInfo.size})
                </span>
              ) : (
                <span>Click to browse or drag and drop your file here</span>
              )}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Supports CSV from Google Sheets / Excel, or JSON export
            </p>

            {/* The Template download now lives in the top bar, next to Add car,
                where it can be reached without opening this dialog first. */}
            <div className="mt-3 flex items-center gap-2">
              <Badge variant="outline" className="text-[11px] font-normal">
                .CSV format
              </Badge>
              <Badge variant="outline" className="text-[11px] font-normal">
                .JSON format
              </Badge>
            </div>
          </div>

          {/* Progress or status */}
          {uploading && progress && (
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="flex items-center gap-1.5 text-primary">
                  <Loader2 className="size-3.5 animate-spin" />
                  Uploading to Supabase database...
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {progress.current.toLocaleString()} / {progress.total.toLocaleString()} cars
                </span>
              </div>
              <Progress
                value={Math.round((progress.current / Math.max(1, progress.total)) * 100)}
                className="h-2"
              />
            </div>
          )}

          {successMessage && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
              <span>{successMessage}</span>
            </div>
          )}

          {parseErrors.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Notice</p>
                <ul className="list-disc pl-4 mt-1 space-y-0.5">
                  {parseErrors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Every field the import will write, not a chosen handful: a column
              left blank here is a column the file did not carry, which is the
              thing worth seeing before importing. */}
          {previewCars.length > 0 && !uploading && !successMessage && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Preview ({previewCars.length.toLocaleString()}{" "}
                  {previewCars.length === 1 ? "car" : "cars"} · {CAR_CSV_COLUMNS.length} fields)
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {linkedIds.size.toLocaleString()} linked to the catalogue ·{" "}
                  {(previewCars.length - linkedIds.size).toLocaleString()} new{" "}
                  {previewCars.length - linkedIds.size === 1 ? "casting" : "castings"} ·{" "}
                  {rowsShown >= previewCars.length
                    ? "all rows"
                    : `first ${rowsShown.toLocaleString()} rows`}
                </span>
              </div>
              <div className="max-h-[55vh] w-full min-w-0 overflow-auto rounded-lg border border-border bg-muted/10 text-xs">
                <table className="text-left">
                  <thead className="sticky top-0 bg-muted text-[11px] font-medium text-muted-foreground border-b border-border">
                    <tr>
                      <th className="whitespace-nowrap px-2.5 py-1.5">Catalogue ID</th>
                      {CAR_CSV_COLUMNS.map((col) => (
                        <th key={col.key} className="whitespace-nowrap px-2.5 py-1.5">
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {previewCars.slice(0, rowsShown).map((car, i) => (
                      <tr key={`${car.id}-${i}`} className="hover:bg-muted/30">
                        <td className="whitespace-nowrap px-2.5 py-1.5">
                          <span className="font-mono text-[11px] text-foreground">
                            {car.catalogId || "—"}
                          </span>
                          {!linkedIds.has(car.id) && (
                            <Badge
                              variant="outline"
                              className="ml-1.5 px-1 py-0 text-[10px] font-normal"
                            >
                              New
                            </Badge>
                          )}
                        </td>
                        {CAR_CSV_COLUMNS.map((col) => {
                          const value = String(col.get(car) ?? "");
                          return (
                            <td
                              key={col.key}
                              className="max-w-[220px] truncate whitespace-nowrap px-2.5 py-1.5 text-muted-foreground"
                              title={value}
                            >
                              {value || "—"}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rowsShown < previewCars.length && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setRowsShown(previewCars.length)}
                  className="w-full text-xs"
                >
                  Show all {previewCars.length.toLocaleString()} rows
                </Button>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t border-border bg-muted/20 px-6 py-3 sm:justify-between">
          {!undoable && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={uploading}
              className="text-xs"
            >
              Cancel
            </Button>
          )}

          <div className="flex items-center gap-2">
            {/* The import stays reversible until this dialog is closed, which is
                why it no longer closes itself on success. */}
            {undoable && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleUndo}
                  disabled={undoing}
                  className="text-xs gap-1.5"
                >
                  {undoing ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="size-3.5" />
                  )}
                  Undo import
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setOpen(false);
                    resetState();
                  }}
                  disabled={undoing}
                  className="text-xs"
                >
                  Done
                </Button>
              </>
            )}
            {previewCars.length > 0 && !successMessage && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleImportLocal}
                  disabled={uploading}
                  className="text-xs gap-1.5"
                >
                  Import Offline
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleUploadToSupabase}
                  disabled={uploading}
                  className="text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {uploading ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Database className="size-3.5" />
                  )}
                  Upload {previewCars.length.toLocaleString()} to Supabase
                  <ArrowRight className="size-3" />
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
