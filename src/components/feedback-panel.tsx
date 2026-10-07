import { useState } from "react";
import { Check, Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-store";
import { LATEST_BUILD } from "@/lib/whats-new";

/**
 * Telling us what is missing, or what is broken.
 *
 * One box and one button. The account is already signed in, so asking for a
 * name or an address again would be asking somebody to type what the app
 * knows — and the copy they typed is the one that goes stale. The row carries
 * the account; the address is read from it when an admin opens the list.
 *
 * The build and the page go along silently. "It does not work" is a different
 * sentence on build 290 than on 295, and nobody writing a bug report thinks to
 * mention which screen they were on.
 */

const MAX = 4000;

const COPY = {
  feature: {
    label: "What would you like VIIV to do?",
    placeholder:
      "Describe it in your own words — what you are trying to do, and where the app gets in the way.",
    button: "Send the request",
    thanks: "Request sent",
    thanksBody: "It goes straight to the people who build this. Thank you.",
  },
  bug: {
    label: "What went wrong?",
    placeholder:
      "What you did, what you expected, and what happened instead. The screen you were on is sent with it.",
    button: "Send the report",
    thanks: "Report sent",
    thanksBody: "The screen and the build number went with it. Thank you.",
  },
} as const;

export function FeedbackPanel({ kind }: { kind: "feature" | "bug" }) {
  const { user, isGuest } = useAuth();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const copy = COPY[kind];

  if (isGuest || !user) {
    return (
      <section className="card-elevated p-5">
        <p className="text-sm text-muted-foreground">
          Sign in to send this — a message with nobody attached is one nobody can answer.
        </p>
      </section>
    );
  }

  const send = async () => {
    const text = body.trim();
    if (!text) {
      toast.error("Write something first");
      return;
    }
    setBusy(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("tesoro_feedback").insert({
      auth_uid: user.id,
      kind,
      body: text.slice(0, MAX),
      build: String(LATEST_BUILD),
      // Where they were when they pressed it, not where they are now.
      path: typeof window === "undefined" ? null : window.location.pathname,
    });
    setBusy(false);

    if (error) {
      toast.error("Could not send that", {
        description: error.message || "Try again in a moment.",
      });
      return;
    }
    setBody("");
    setSent(true);
    toast.success(copy.thanks, { description: copy.thanksBody });
  };

  return (
    <section className="card-elevated space-y-3 p-5">
      <label className="block text-sm font-medium" htmlFor={`feedback-${kind}`}>
        {copy.label}
      </label>

      <Textarea
        id={`feedback-${kind}`}
        rows={6}
        maxLength={MAX}
        value={body}
        placeholder={copy.placeholder}
        onChange={(e) => {
          setBody(e.target.value);
          setSent(false);
        }}
        className="resize-y"
      />

      <div className="flex flex-wrap items-center gap-2">
        {/* What is sent besides the words, said rather than hidden: it is their
            account and their address, and a form that collects quietly is a
            form that collected something somebody did not expect. */}
        <p className="min-w-0 flex-1 text-[11px] text-muted-foreground">
          Sent from your account, so we can reply. Nothing else about your collection goes with it.
        </p>
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {body.length}/{MAX}
        </span>
        <Button type="button" disabled={busy || !body.trim()} onClick={() => void send()}>
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : sent ? (
            <Check className="size-4" />
          ) : (
            <Send className="size-4" />
          )}
          {copy.button}
        </Button>
      </div>

      {sent && (
        <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 text-[12px]">
          {copy.thanks}. {copy.thanksBody}
        </p>
      )}
    </section>
  );
}
