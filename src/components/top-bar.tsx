import { useEffect, useState } from "react";
import { Sun, Moon, MonitorSmartphone, Plus, Download, Undo2 } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/store";
import { useCarsUndo } from "@/lib/cars-store";
import { SearchBox } from "@/components/search-box";
import { CarFormDialog } from "@/components/car-form-dialog";
import { UploadCarsDialog } from "@/components/upload-cars-dialog";
import { BulkAddCarsDialog } from "@/components/bulk-add-cars-dialog";
import { downloadCsv, generateDiecastCsvTemplate } from "@/lib/csv";
import { BULK_DRAFT_KEY, CAR_DRAFT_KEY, hasDraft } from "@/lib/form-draft";

const THEME_LABEL = {
  light: "Theme: light. Switch to dark.",
  dark: "Theme: dark. Switch to auto.",
  system: "Theme: auto. Switch to light.",
} as const;

export function TopBar() {
  const { theme, themePreference, toggleTheme } = useApp();
  const { undo, undoLabel } = useCarsUndo();
  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [pendingDraft, setPendingDraft] = useState(false);

  // A tab that was evicted mid-form comes back to the inventory, not to the
  // dialog, so the rescued draft needs saying so — otherwise it is safe but
  // invisible, and the person concludes their typing was lost after all.
  // Re-read after each dialog closes and whenever the tab is looked at again.
  useEffect(() => {
    const check = () => setPendingDraft(hasDraft(CAR_DRAFT_KEY) || hasDraft(BULK_DRAFT_KEY));
    check();
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [addOpen, bulkOpen]);

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-background/80 px-3 backdrop-blur">
      <SidebarTrigger />
      <SearchBox />
      {/* No Refresh button or "Updated …" stamp: CarsProvider re-reads Supabase
          every 15s on its own, and local edits are applied optimistically, so
          there was never anything for a manual refresh to reveal. */}
      {/* Bulk add and CSV upload are reached from inside the Add car dialog,
          keeping one entry point for getting cars into the collection. */}
      <div className="ml-auto flex items-center gap-1">
        {/* Always rendered, disabled when there is nothing to reverse: a button
            that appears only once you have made a mistake is one nobody knows
            about until they need it and cannot find it. */}
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={undo}
          disabled={!undoLabel}
          title={undoLabel ? `Undo ${undoLabel}` : "Nothing to undo yet"}
          aria-label={undoLabel ? `Undo ${undoLabel}` : "Nothing to undo yet"}
        >
          <Undo2 className="size-4" /> <span className="hidden sm:inline">Undo</span>
        </Button>
        {/* Straight to the file: the template is what you need *before* you have
            anything to upload, so it shouldn't be buried behind the CSV dialog. */}
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => downloadCsv("template.csv", generateDiecastCsvTemplate())}
          title="Download the CSV template"
        >
          <Download className="size-4" /> <span className="hidden sm:inline">Template</span>
        </Button>
        <Button
          size="sm"
          onClick={() => setAddOpen(true)}
          className="relative gap-1.5"
          title={
            pendingDraft ? "You have an unfinished car — pick up where you left off" : undefined
          }
        >
          <Plus className="size-4" /> <span className="hidden sm:inline">Add car</span>
          {pendingDraft && (
            <span
              aria-label="Unfinished car saved"
              className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-background bg-amber-400"
            />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label={THEME_LABEL[themePreference]}
          title={THEME_LABEL[themePreference]}
        >
          {themePreference === "system" ? (
            <MonitorSmartphone className="size-4" />
          ) : theme === "dark" ? (
            <Sun className="size-4" />
          ) : (
            <Moon className="size-4" />
          )}
        </Button>
      </div>
      <CarFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        mode="add"
        // Hand off rather than stack dialogs: close the wizard, open bulk.
        onSwitchToBulk={() => {
          setAddOpen(false);
          setBulkOpen(true);
        }}
        onSwitchToUpload={() => {
          setAddOpen(false);
          setUploadOpen(true);
        }}
      />
      <BulkAddCarsDialog open={bulkOpen} onOpenChange={setBulkOpen} />
      <UploadCarsDialog open={uploadOpen} onOpenChange={setUploadOpen} />
    </header>
  );
}
