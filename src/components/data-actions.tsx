import { useMemo, useState } from "react";
import { Download, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ExportDialog } from "@/components/export-dialog";
import { CAR_CSV_COLUMNS } from "@/lib/car-columns";
import { useCars } from "@/lib/cars-store";
import { downloadCsv, generateDiecastCsvTemplate } from "@/lib/csv";
import { useExportScope } from "@/lib/export-scope";
import { filterRows } from "@/lib/search";
import { useApp } from "@/lib/store";
import { useAuth, fullName } from "@/lib/auth-store";

/**
 * Getting cars out, and the shape for getting them in.
 *
 * These two lived at the bottom of the sidebar, under a "Data" heading, several
 * scroll-lengths from anything to do with cars. They belong with the other ways
 * in and out of the collection — which is the Add car dialog's header, next to
 * bulk entry and CSV upload.
 *
 * Export still follows the page you came from rather than the dialog: the scope
 * is published by the page through useExportScope, so exporting from inside this
 * dialog gives you the list you were looking at a moment ago.
 */
export function DataActions() {
  const allCars = useCars();
  const { query } = useApp();
  const { profile } = useAuth();
  const [exportOpen, setExportOpen] = useState(false);

  const allMatching = useMemo(() => filterRows(allCars, query), [allCars, query]);
  const scope = useExportScope();
  const exportRows = scope?.rows ?? allMatching;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        disabled={exportRows.length === 0}
        onClick={() => setExportOpen(true)}
        title={
          exportRows.length
            ? `Export ${exportRows.length.toLocaleString()} cars${scope ? ` — ${scope.label}` : ""}`
            : "Nothing to export yet"
        }
      >
        <FileText className="size-4" />
        Export
        {exportRows.length > 0 && (
          <span className="tabular-nums text-muted-foreground">
            {exportRows.length.toLocaleString()}
          </span>
        )}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => downloadCsv("template.csv", generateDiecastCsvTemplate())}
        title="Download the CSV template"
      >
        <Download className="size-4" />
        CSV template
      </Button>

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        name={scope?.name ?? "collection"}
        rows={exportRows}
        columns={CAR_CSV_COLUMNS}
        title={scope?.label ?? "Collection"}
        scopeLabel={query.trim() ? `matching “${query.trim()}”` : undefined}
        owner={fullName(profile) || undefined}
      />
    </>
  );
}
