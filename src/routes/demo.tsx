import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { SplashMark } from "@/components/brand-mark";
import { useAuth } from "@/lib/auth-store";

/**
 * A link that opens the demo, for handing to somebody who has no account.
 *
 * Guest mode already existed behind a button at the bottom of the sign-in
 * page, which is a fine place for it and a useless thing to put in a message.
 * This is the same switch with an address: /demo turns it on and sends you to
 * the home page, so the link in a post or an email lands on the app rather
 * than on a form.
 *
 * Deliberately not indexed. It is a door for a person who was given the
 * address, and a search result that drops a stranger into sample data would
 * have them reviewing somebody else's cars believing they were real.
 */
export const Route = createFileRoute("/demo")({
  head: () => ({
    meta: [{ title: "Demo | VIIV" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: DemoEntry,
});

function DemoEntry() {
  const { enterGuest, isGuest } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Only the plain demo. The full one unlocks on a local machine alone, and
    // a URL anybody can type is not the way to hand it out.
    if (!isGuest) enterGuest("guest");
    void navigate({ to: "/", replace: true });
  }, [enterGuest, isGuest, navigate]);

  // On screen for the moment it takes, and the same mark the app boots with
  // rather than a spinner that says nothing.
  return (
    <div className="grid min-h-svh place-items-center bg-background p-6">
      <div className="text-center">
        <SplashMark className="mx-auto w-[min(60vw,220px)]" />
        <p className="mt-4 text-sm text-muted-foreground">Opening the demo…</p>
      </div>
    </div>
  );
}
