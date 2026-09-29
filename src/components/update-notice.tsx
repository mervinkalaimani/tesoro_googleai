/**
 * "Tesoro has been updated."
 *
 * A tab left open for a week is still running last week's code, and the first
 * anyone knows about it is a bug that nobody else can reproduce. This watches
 * for a deploy and says so.
 *
 * Checked when the tab comes back to the front rather than on a busy timer:
 * somebody who left it open and came back is exactly the person running the old
 * build, and somebody staring at it has not missed anything. A slow heartbeat
 * covers the tab that is never hidden.
 */
import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { fetchFingerprint } from "@/lib/app-update";

/** Long enough that a tab nobody touches is not a request every minute. */
const HEARTBEAT_MS = 15 * 60 * 1000;
/** Two checks inside this are the same check. */
const QUIET_MS = 60 * 1000;

export function UpdateNotice() {
  const [ready, setReady] = useState(false);
  /**
   * The build this tab is measured against — read off the served page, never
   * off the live document.
   *
   * The document was the obvious baseline and the wrong one. The router adds a
   * modulepreload for every chunk it loads, so a tab that has been to the
   * catalogue and back carries a dozen scripts that the page it is compared
   * against never listed, and the answer came back "updated" every single time
   * for a deploy that never happened. Both sides come from the same request
   * now, so a difference between them is a difference in the build.
   */
  const mine = useRef("");
  const lastCheck = useRef(0);
  // Told once. Saying it again five minutes later is nagging, and the person
  // who said "later" meant it.
  const dismissed = useRef(false);

  useEffect(() => {
    // In development the document is assembled per request and nothing is
    // hashed, so there is nothing to compare and nothing to say.
    if (!import.meta.env.PROD) return;

    let alive = true;
    const ac = new AbortController();

    const check = async () => {
      if (!alive || dismissed.current) return;
      const now = Date.now();
      if (now - lastCheck.current < QUIET_MS) return;
      lastCheck.current = now;

      const theirs = await fetchFingerprint(ac.signal);
      if (!alive || !theirs) return;
      // The first answer is the baseline, not news.
      if (!mine.current) {
        mine.current = theirs;
        return;
      }
      if (theirs === mine.current) return;
      setReady(true);
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };

    // Take the baseline straight away, so the first real check has something
    // to disagree with.
    void check();

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    const timer = window.setInterval(() => void check(), HEARTBEAT_MS);

    return () => {
      alive = false;
      ac.abort();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.clearInterval(timer);
    };
  }, []);

  return (
    <Dialog
      open={ready}
      onOpenChange={(v) => {
        if (v) return;
        dismissed.current = true;
        setReady(false);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Tesoro has been updated</DialogTitle>
          <DialogDescription>
            This tab is running an older version. Refresh to pick up the new one — you may be asked
            to sign in again.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => {
              dismissed.current = true;
              setReady(false);
            }}
          >
            Later
          </Button>
          <Button className="gap-1.5" onClick={() => window.location.reload()}>
            <RefreshCw className="size-4" />
            Refresh now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
