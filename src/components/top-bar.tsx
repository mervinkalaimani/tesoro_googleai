import { useState } from "react";
import { Sun, Moon, MonitorSmartphone, Plus, Download } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/store";
import { SearchBox } from "@/components/search-box";
import { CarFormDialog } from "@/components/car-form-dialog";
import { UploadCarsDialog } from "@/components/upload-cars-dialog";
import { BulkAddCarsDialog } from "@/components/bulk-add-cars-dialog";
import { downloadCsv, generateDiecastCsvTemplate } from "@/lib/csv";

const THEME_LABEL = {
  light: "Theme: light. Switch to dark.",
  dark: "Theme: dark. Switch to auto.",
  system: "Theme: auto. Switch to light.",
} as const;

export function TopBar() {
  const { theme, themePreference, toggleTheme } = useApp();
  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

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
        <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5">
          <Plus className="size-4" /> <span className="hidden sm:inline">Add car</span>
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
