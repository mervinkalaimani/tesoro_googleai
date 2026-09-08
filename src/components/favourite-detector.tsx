import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, AlertCircle, Search } from "lucide-react";
import { detectFavourites, TRUE_SPELLINGS, type FavouriteDetection } from "@/lib/detect-favourites";

export function FavouriteDetector() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FavouriteDetection | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await detectFavourites();
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Detection failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-medium">Detect favourite rows</div>
          <div className="text-xs text-muted-foreground">
            Re-parses the RAW sheet and scans favourite-like columns for common TRUE spellings.
          </div>
        </div>
        <Button size="sm" onClick={run} disabled={loading} className="gap-1.5 shrink-0">
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          {loading ? "Scanning" : "Run detector"}
        </Button>
      </div>

      <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Spellings tried:</span>{" "}
        {TRUE_SPELLINGS.join(", ")}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="space-y-3">
          <div
            className={`flex items-start gap-2 rounded-md border p-3 text-sm ${
              result.hasAny
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
            }`}
          >
            {result.hasAny ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            ) : (
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
            )}
            <div>
              {result.hasAny ? (
                <>
                  Found <strong>{result.totalTrueRows}</strong> row
                  {result.totalTrueRows === 1 ? "" : "s"} marked TRUE across {result.totalRows}{" "}
                  total.
                </>
              ) : (
                <>
                  No TRUE rows detected. Scanned {result.totalRows} rows across{" "}
                  {result.columnsScanned.length} favourite-like column
                  {result.columnsScanned.length === 1 ? "" : "s"}.
                </>
              )}
            </div>
          </div>

          <div className="rounded-md border border-border">
            <div className="border-b border-border bg-muted/40 px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Columns scanned
            </div>
            {result.columnsScanned.length === 0 ? (
              <div className="p-3 text-sm text-muted-foreground">
                No column with "fav" in its header was found in the RAW sheet.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {result.columnsScanned.map((label) => {
                  const info = result.perColumn[label];
                  return (
                    <li key={label} className="flex flex-col gap-1 px-3 py-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{label}</span>
                        <span
                          className={
                            info.trueCount > 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-muted-foreground"
                          }
                        >
                          {info.trueCount} TRUE
                        </span>
                      </div>
                      {info.trueCount === 0 && info.sampleValues.length > 0 && (
                        <div className="text-xs text-muted-foreground">
                          Sample non-empty values: {info.sampleValues.join(", ")}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {result.spellingsMatched.length > 0 && (
            <div className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Spellings matched:</span>{" "}
              {result.spellingsMatched.join(", ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
