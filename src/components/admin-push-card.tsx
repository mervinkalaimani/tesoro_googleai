import { useEffect, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";
import {
  disablePush,
  enablePush,
  readPushState,
  sendTestPush,
  type PushState,
} from "@/lib/push-client";

const HINT: Record<PushState, string> = {
  on: "This device gets a notification when someone new signs up, with Approve and Reject on it.",
  off: "Get a notification on this device when someone new signs up, with Approve and Reject on it.",
  "needs-install":
    "On iPhone and iPad, add VIIV to your Home Screen first (Share → Add to Home Screen), then open it from there and turn this on.",
  unsupported: "This browser can't receive push notifications.",
  "not-configured":
    "Push isn't set up on this deployment yet: it needs VAPID keys and the service role key in the server environment.",
  denied:
    "Notifications are blocked for VIIV. Allow them in your browser or phone settings, then come back here.",
};

/** Settings → Notifications → Admin: new-account push, per device. */
export function AdminPushCard() {
  const [state, setState] = useState<PushState | "loading">("loading");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    let live = true;
    readPushState()
      .then((s) => live && setState(s))
      .catch(() => live && setState("unsupported"));
    return () => {
      live = false;
    };
  }, []);

  const toggle = async (on: boolean) => {
    setBusy(true);
    try {
      const next = on ? await enablePush() : await disablePush();
      setState(next);
      if (on && next === "on") toast.success("Notifications are on for this device");
      if (on && next === "denied") toast.error("Notifications were blocked");
    } catch (err) {
      toast.error("Could not change notifications", { description: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      const sent = await sendTestPush();
      toast.success(sent ? "Test sent — check your notifications" : "Nothing was delivered", {
        description: sent ? undefined : "Try switching notifications off and on again.",
      });
    } catch (err) {
      toast.error("Could not send a test", { description: (err as Error).message });
    } finally {
      setTesting(false);
    }
  };

  const canToggle = state === "on" || state === "off";

  return (
    <div className="space-y-1.5">
      <div className="divide-y divide-border/60 overflow-hidden card-elevated">
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="text-[15px] font-medium text-foreground">New account requests</div>
          {busy || state === "loading" ? (
            <Loader2 className="size-5 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <Switch
              checked={state === "on"}
              disabled={!canToggle}
              onCheckedChange={(v) => void toggle(v)}
              aria-label="Push notifications for new account requests"
            />
          )}
        </div>

        {state === "on" && (
          <div className="flex items-center justify-between gap-4 px-4 py-2.5">
            <div className="text-[15px] text-foreground">Send a test</div>
            <button
              type="button"
              onClick={() => void test()}
              disabled={testing}
              className="glass-btn inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors active:scale-95 disabled:opacity-60"
            >
              {testing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Send className="size-3.5" />
              )}
              Send
            </button>
          </div>
        )}
      </div>
      {/* The detail sits under the frame, the way iOS Settings footnotes a group. */}
      <p className="px-1 pt-1 text-xs text-muted-foreground">
        {state === "loading" ? "Checking this device…" : HINT[state]}
      </p>
    </div>
  );
}
