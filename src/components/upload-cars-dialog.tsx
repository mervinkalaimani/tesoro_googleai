import { useState, useRef, useId, type ChangeEvent, type DragEvent } from "react";
import {
  Upload,
  FileSpreadsheet,
  FileCode,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Database,
  ArrowRight,
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
import { parseCsvToDiecast } from "@/lib/csv";
import { useCarsActions, useCarsRefresh, useCarsSource } from "@/lib/cars-store";
import { tesoroRawToDiecast } from "@/lib/supabase-cars";
import type { Diecast } from "@/lib/types";
import { inr } from "@/lib/format";

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

  const { bulkAddCars } = useCarsActions();
  const { syncAllToSupabase } = useCarsSource();
  const { refresh } = useCarsRefresh();

  const resetState = () => {
    setFileInfo(null);
    setParsedCars([]);
    setParseErrors([]);
    setUploading(false);
    setProgress(null);
    setSuccessMessage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

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
              status: item.status || "Available",
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
              open: Boolean(item.open),
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
    if (parsedCars.length === 0) return;
    bulkAddCars(parsedCars);
    setSuccessMessage(
      `Successfully added ${parsedCars.length.toLocaleString()} cars to your collection.`,
    );
    setTimeout(() => {
      setOpen(false);
      resetState();
    }, 1500);
  };

  const handleUploadToSupabase = async () => {
    if (parsedCars.length === 0) return;
    setUploading(true);
    setProgress({ current: 0, total: parsedCars.length });

    try {
      const { seedCarsToSupabase } = await import("@/lib/supabase-cars");
      const res = await seedCarsToSupabase(parsedCars, (curr, tot) => {
        setProgress({ current: curr, total: tot });
      });

      if (!res.success) {
        setParseErrors([`Supabase upload failed: ${res.error || "Unknown error"}`]);
        setUploading(false);
        return;
      }

      setSuccessMessage(
        `Successfully uploaded ${res.count.toLocaleString()} cars to Supabase database!`,
      );
      // Refresh live collection store
      await refresh();
      setTimeout(() => {
        setOpen(false);
        resetState();
      }, 1800);
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
      <DialogContent className="max-w-2xl overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border bg-muted/20 px-6 py-4">
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

        <div className="space-y-4 px-6 py-4">
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

          {/* Parsed Preview */}
          {parsedCars.length > 0 && !uploading && !successMessage && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Data Preview ({parsedCars.length.toLocaleString()} cars parsed)
                </span>
                <span className="text-[11px] text-muted-foreground">Showing first 5 rows</span>
              </div>
              <div className="max-h-48 overflow-auto rounded-lg border border-border bg-muted/10 text-xs">
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-muted/80 text-[11px] font-medium text-muted-foreground border-b border-border">
                    <tr>
                      <th className="px-2.5 py-1.5">ID</th>
                      <th className="px-2.5 py-1.5">Name</th>
                      <th className="px-2.5 py-1.5">Brand</th>
                      <th className="px-2.5 py-1.5">Cost</th>
                      <th className="px-2.5 py-1.5">Status</th>
                      <th className="px-2.5 py-1.5">Received date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {parsedCars.slice(0, 5).map((car) => (
                      <tr key={car.id} className="hover:bg-muted/30">
                        <td className="px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground">
                          {car.id}
                        </td>
                        <td className="px-2.5 py-1.5 font-medium text-foreground truncate max-w-[180px]">
                          {car.name}
                        </td>
                        <td className="px-2.5 py-1.5 text-muted-foreground">{car.brand}</td>
                        <td className="px-2.5 py-1.5 tabular-nums">{inr(car.spent)}</td>
                        <td className="px-2.5 py-1.5">
                          <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-medium bg-muted text-foreground">
                            {car.status}
                          </span>
                        </td>
                        <td className="px-2.5 py-1.5 text-muted-foreground">{car.date || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-border bg-muted/20 px-6 py-3 sm:justify-between">
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

          <div className="flex items-center gap-2">
            {parsedCars.length > 0 && !successMessage && (
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
                  Upload {parsedCars.length.toLocaleString()} to Supabase
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
