import { useEffect, useState } from "react";
import { AtSign, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-store";
import { handleError, isValidHandle, normaliseHandle, suggestHandle } from "@/lib/handle";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/**
 * The one screen somebody on an old user ID sees until they pick a new one.
 *
 * The rule changed under accounts that already existed: six letters and two
 * numbers, where `mervin` and `sam` used to be fine. Those handles no longer
 * sign anybody in, so this is not a nag — it is the way back to being able to
 * sign in by user ID at all, and it does not close until it is done.
 *
 * Email sign-in never stopped working, which is how the person in front of
 * this dialog got here.
 */
export function HandleFixDialog() {
  const { profile, status, isGuest, reloadProfile } = useAuth();
  const current = profile?.user_id ?? "";
  // Nothing to fix for a guest, for a session still loading, or for anybody
  // whose handle already qualifies -- which is everybody who signs up from
  // now on, because signup cannot produce one that does not.
  const needed = status === "ready" && !isGuest && Boolean(profile) && !isValidHandle(current);

  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (needed) setValue(suggestHandle(current));
  }, [needed, current]);

  if (!needed) return null;

  const problem = handleError(value);

  const save = async () => {
    setBusy(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc("tesoro_set_handle", { _handle: value });
    setBusy(false);
    if (error) {
      toast.error("Could not change your user ID", { description: error.message });
      return;
    }
    await reloadProfile();
    toast.success("User ID changed", { description: `You sign in as ${normaliseHandle(value)}.` });
  };

  return (
    // No onOpenChange and no close button: there is one way out of this.
    <Dialog open>
      <DialogContent className="w-full max-w-md [&>button]:hidden">
        <div className="flex items-center gap-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <AtSign className="size-4" />
          </span>
          <div className="min-w-0">
            <DialogTitle className="text-base font-semibold">Pick a new user ID</DialogTitle>
            <DialogDescription className="text-xs">
              User IDs now need at least six letters and two numbers. Yours —{" "}
              <span className="font-mono">{current || "none"}</span> — no longer signs you in.
            </DialogDescription>
          </div>
        </div>

        <div className="space-y-1.5">
          <Input
            value={value}
            autoFocus
            spellCheck={false}
            autoCapitalize="none"
            // The same characters the database keeps, so what is typed is what
            // is saved rather than something quietly rewritten on the way.
            onChange={(e) => setValue(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !problem && !busy) void save();
            }}
            placeholder="mervink99"
            aria-label="New user ID"
            className="font-mono"
          />
          <p className="text-[11px] text-muted-foreground">
            {problem ?? "Looks good. Lowercase letters, numbers and underscores."}
          </p>
        </div>

        <Button
          type="button"
          className="w-full gap-1.5 font-semibold"
          disabled={Boolean(problem) || busy}
          onClick={() => void save()}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Save it
        </Button>

        <p className="text-center text-[11px] text-muted-foreground">
          Your email still signs you in either way. Nothing else about the account changes.
        </p>
      </DialogContent>
    </Dialog>
  );
}
