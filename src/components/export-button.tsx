import { useState } from "react";
import { FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ExportDialog } from "@/components/export-dialog";
import { CAR_CSV_COLUMNS } from "@/lib/car-columns";
import { useAuth, fullName } from "@/lib/auth-store";
import type { Diecast } from "@/lib/types";

/**
 * Export, for a specific set of cars.
 *
 * The top bar's Export follows whichever page you are on, which is right for a
 * page and useless for one order out of thirty — "export" there has to mean
 * *this* parcel, not the list it happens to be sitting in. So this takes its
 * rows directly rather than reading the page scope, and the same component
 * serves the inventory toolbar and every order card on the orders pages.
 */
export function ExportButton({
  rows,
  name,
  label,
  iconOnly = false,
  size = "sm",
  variant = "outline",
  className = "",
}: {
  rows: Diecast[];
  /** Filename stem, e.g. "order-SHLL-2026-06-001". */
  name: string;
  /** What this set of rows is. Shown in the dialog and printed on the report. */
  label: string;
  /** Drop the word, keep the icon — for a crowded card footer. */
  iconOnly?: boolean;
  size?: "sm" | "default" | "icon";
  variant?: "outline" | "ghost" | "default";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const { profile } = useAuth();
  const empty = rows.length === 0;

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={`gap-1.5 ${className}`}
        disabled={empty}
        onClick={() => setOpen(true)}
        title={
          empty
            ? "Nothing to export"
            : `Export ${rows.length} car${rows.length === 1 ? "" : "s"} — ${label}`
        }
        aria-label={`Export ${label}`}
      >
        <FileText className="size-3.5" />
        {!iconOnly && "Export"}
      </Button>

      {/* Mounted only once opened. An orders page can hold thirty of these, and
          thirty dialogs' worth of column checkboxes is a lot of DOM for a
          button nobody has pressed. */}
      {open && (
        <ExportDialog
          open={open}
          onOpenChange={setOpen}
          name={name}
          rows={rows}
          columns={CAR_CSV_COLUMNS}
          title={label}
          owner={fullName(profile) || undefined}
        />
      )}
    </>
  );
}
