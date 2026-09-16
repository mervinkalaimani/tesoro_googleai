import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Plus, Store, Undo2 } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useCarsUndo } from "@/lib/cars-store";
import type { Diecast } from "@/lib/types";
import { HomeScreenMark } from "@/components/brand-mark";
import { SearchBox } from "@/components/search-box";
import { NotificationCenter } from "@/components/notification-center";
import { AccountButton } from "@/components/account-button";
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
    <header className="sticky top-0 z-40 flex h-14 transform-gpu items-center gap-2 bg-background/80 px-3 backdrop-blur">
      {/* Desktop only. The bottom bar carries every destination the sidebar
          holds, so on a phone this opened a second copy of the navigation that
          was already under your thumb. Swiping in from the edge still works for
          anyone who has learned it. */}
      <SidebarTrigger className="hidden md:inline-flex" />
      {/* A phone's wordmark. On a desktop it lives in the sidebar's header. */}
      <Link to="/" aria-label="Tesoro home" className="shrink-0 md:hidden">
        <HomeScreenMark className="w-[80px]" />
      </Link>
      {/* Desktop searches here, live. A phone searches from the bottom bar. */}
      <SearchBox className="hidden md:block" />
      {/* No Refresh button or "Updated …" stamp: CarsProvider re-reads Supabase
          every 15s on its own, and local edits are applied optimistically, so
          there was never anything for a manual refresh to reveal. */}
      <div className="ml-auto flex items-center gap-1.5">
        {/* Only while it means something: it shows itself when there is
            something to reverse and withdraws half a minute later. */}
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

        <NotificationCenter />
        {/* Reading right to left from the corner: who you are, then the thing
            you came to do. */}
        <Button
          size="icon"
          onClick={() => setAddOpen(true)}
          aria-label="Add car"
          className="relative size-8 rounded-full"
          title={
            pendingDraft ? "You have an unfinished car — pick up where you left off" : "Add car"
          }
        >
          <Plus className="size-4" />
          {pendingDraft && (
            <span
              aria-label="Unfinished car saved"
              className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-background bg-amber-400"
            />
          )}
        </Button>
        {/* The shared catalogue: every casting, ready to add. */}
        <Button
          asChild
          variant="outline"
          size="icon"
          className="size-8 rounded-full"
          title="Catalog"
        >
          <Link to="/catalog" aria-label="Catalog">
            <Store className="size-4" />
          </Link>
        </Button>
        <AccountButton />
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
