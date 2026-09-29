/**
 * Leaving, and taking the collection with you.
 *
 * Two screens rather than one button: what is about to happen, spelled out,
 * with the CSV of the collection offered first — and then a confirmation that
 * has to be typed, because a tap is too small an action for something nothing
 * can undo.
 *
 * What stays is as much the point as what goes. The castings filed in the
 * shared catalogue are what other people's cars point at; removing those would
 * take cars out of eleven other collections. They remain, without a name on
 * them.
 */
import { useState } from "react";
import { AlertTriangle, Download, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ExportDialog } from "@/components/export-dialog";
import { CAR_CSV_COLUMNS } from "@/lib/car-columns";
import { useCars } from "@/lib/cars-store";
import { useAuth } from "@/lib/auth-store";
import { deleteMyData } from "@/lib/delete-account";

/** Typed out in full, so it cannot be a slip of the thumb. */
const PHRASE = "DELETE";

export function DeleteMyData({ blocked = false }: { blocked?: boolean }) {
  const cars = useCars();
  const { profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    const res = await deleteMyData();
    if ("error" in res) {
      setBusy(false);
      toast.error(res.error);
      return;
    }
    toast.success("Your data is gone", {
      description: `${res.cars} car${res.cars === 1 ? "" : "s"} and your profile were deleted.`,
    });
    // There is no account behind this session any more, so the only honest next
    // screen is the signed-out one.
    await signOut();
  };

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-destructive/40 bg-card shadow-xs">
        <div className="flex items-start gap-3 px-4 py-3.5">
          <div className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-destructive/12 text-destructive">
            <Trash2 className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-medium text-foreground">Delete my data</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Your {cars.length.toLocaleString()} car{cars.length === 1 ? "" : "s"}, your profile
              and your login, removed from the database. Castings you added to the shared catalogue
              stay, without your name on them.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-border/60 px-4 py-3">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setExporting(true)}
          >
            <Download className="size-3.5" />
            Export my collection first
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={blocked}
            title={
              blocked
                ? "The catalogue would have nobody to keep it. Make another admin the owner first."
                : undefined
            }
            className="gap-1.5 border-destructive/50 text-destructive hover:bg-destructive/10"
            onClick={() => {
              setTyped("");
              setOpen(true);
            }}
          >
            <Trash2 className="size-3.5" />
            Delete my data
          </Button>
        </div>
        {blocked && (
          <p className="border-t border-border/60 px-4 py-2.5 text-[11px] text-muted-foreground">
            You are the owner of this catalogue, so this is switched off: deleting it would leave
            the shared catalogue with nobody to keep it. Make another admin the owner first.
          </p>
        )}
      </div>

      <ExportDialog
        open={exporting}
        onOpenChange={setExporting}
        name={`tesoro-${profile?.user_id || "collection"}`}
        rows={cars}
        columns={CAR_CSV_COLUMNS}
        title="Export your collection"
      />

      <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-5" />
              Delete everything?
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>This cannot be undone. Nobody can get it back for you — not even an admin.</p>
                <ul className="space-y-1 text-muted-foreground">
                  <li>
                    <b className="text-foreground">Goes:</b> your {cars.length.toLocaleString()} car
                    {cars.length === 1 ? "" : "s"}, your profile, your settings and your login.
                  </li>
                  <li>
                    <b className="text-foreground">Stays:</b> castings you added to the shared
                    catalogue, so nobody else&apos;s cars break. Your name comes off them.
                  </li>
                  <li>
                    Your user ID{profile?.user_id ? ` (${profile.user_id})` : ""} is retired rather
                    than reused, so it is never handed to somebody else. Signing up again gives you
                    a new one.
                  </li>
                </ul>
                <p className="text-muted-foreground">
                  Export your collection as a CSV first if you want to keep it.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <label htmlFor="delete-confirm" className="text-xs text-muted-foreground">
              Type <b className="font-mono text-foreground">{PHRASE}</b> to confirm
            </label>
            <Input
              id="delete-confirm"
              value={typed}
              autoComplete="off"
              onChange={(e) => setTyped(e.target.value)}
              placeholder={PHRASE}
              className="font-mono"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              Keep my data
            </Button>
            <Button
              variant="destructive"
              className="gap-1.5"
              disabled={busy || typed.trim().toUpperCase() !== PHRASE}
              onClick={() => void run()}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              {busy ? "Deleting…" : "Delete my data"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
