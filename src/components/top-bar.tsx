import { useEffect, useState } from "react";
import { Plus, Undo2 } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useCarsUndo } from "@/lib/cars-store";
import type { Diecast } from "@/lib/types";
import { SearchBox } from "@/components/search-box";
import { NotificationCenter } from "@/components/notification-center";
import { CarFormDialog } from "@/components/car-form-dialog";
import { UploadCarsDialog } from "@/components/upload-cars-dialog";
import { BulkAddCarsDialog } from "@/components/bulk-add-cars-dialog";
import { BULK_DRAFT_KEY, CAR_DRAFT_KEY, hasDraft } from "@/lib/form-draft";

/** How long the undo button stays on screen after the edit it would reverse. */
const UNDO_WINDOW_MS = 30_000;

export function TopBar() {
  const { undo, undoLabel, undoAt } = useCarsUndo();
  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkSeed, setBulkSeed] = useState<Diecast[] | undefined>(undefined);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [pendingDraft, setPendingDraft] = useState(false);
  const [fresh, setFresh] = useState(false);

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

  // Restarts on every edit, and survives a remount mid-window by timing from
  // when the edit happened rather than from when this effect ran.
  useEffect(() => {
    if (!undoAt) {
      setFresh(false);
      return;
    }
    const left = UNDO_WINDOW_MS - (Date.now() - undoAt);
    if (left <= 0) {
      setFresh(false);
      return;
    }
    setFresh(true);
    const id = window.setTimeout(() => setFresh(false), left);
    return () => window.clearTimeout(id);
  }, [undoAt]);

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-background/80 px-3 backdrop-blur">
      <SidebarTrigger />
      {/* Back to a real field at every width. Export and the CSV template moved
          to the sidebar and Undo only appears when there is something to undo,
          which is the room the search box needed. */}
      <SearchBox />
      {/* No Refresh button or "Updated …" stamp: CarsProvider re-reads Supabase
          every 15s on its own, and local edits are applied optimistically, so
          there was never anything for a manual refresh to reveal. */}
      {/* Bulk add and CSV upload are reached from inside the Add car dialog,
          keeping one entry point for getting cars into the collection. */}
      <div className="ml-auto flex items-center gap-1">
        {/* Only while it means something. A button that is disabled nine visits
            out of ten is a button you stop seeing — and it was holding a slot
            the search field needed. It shows itself when there is something to
            reverse and withdraws half a minute later, which is about as long as
            "that was wrong" takes to occur to anyone. */}
        {undoLabel && fresh && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 animate-in fade-in slide-in-from-right-2"
            onClick={undo}
            title={`Undo ${undoLabel}`}
            aria-label={`Undo ${undoLabel}`}
          >
            <Undo2 className="size-4" /> <span className="hidden sm:inline">Undo</span>
          </Button>
        )}
        {/* Anything the app needs to tell you lives behind the bell — the
            pre-order launch banner used to sit on the dashboard, where it was
            only seen by someone already looking at the dashboard. It renders
            nothing at all when there is nothing to say, so Add car keeps the
            corner: the last button in the bar is the one worth putting under a
            thumb, and it is the one you press every day. */}
        <NotificationCenter />
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
        {/* The theme toggle lived here too, competing for a bar that had no
            room for a search field. It is a preference, and preferences are in
            Settings → General & Display. */}
      </div>
      <CarFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        mode="add"
        // Hand off rather than stack dialogs: close the wizard, open bulk —
        // carrying the ISO matches across when that is what sent us here.
        onSwitchToBulk={(seed) => {
          setBulkSeed(seed);
          setAddOpen(false);
          setBulkOpen(true);
        }}
        onSwitchToUpload={() => {
          setAddOpen(false);
          setUploadOpen(true);
        }}
      />
      <BulkAddCarsDialog
        open={bulkOpen}
        onOpenChange={(v) => {
          setBulkOpen(v);
          // The seed belongs to one visit; reopening bulk on its own should
          // find the table as it was left, not those cars again.
          if (!v) setBulkSeed(undefined);
        }}
        seed={bulkSeed}
      />
      <UploadCarsDialog open={uploadOpen} onOpenChange={setUploadOpen} />
    </header>
  );
}
