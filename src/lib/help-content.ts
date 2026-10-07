import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

/**
 * The Help pages — privacy policy, terms, and how to reach a human.
 *
 * These live in `deployment_settings` rather than a table of their own: the
 * shape is already exactly right. World-readable, so somebody who has not
 * signed in can still read the policy they are being asked to accept, and
 * owner-writable, so the person answering the phone number is the only person
 * who can change it. Saving publishes — there is no draft state and no second
 * step, which is what makes this worth building into the app at all rather
 * than editing text in the repository and waiting for a deploy.
 *
 * The defaults below are the text everyone sees until the owner edits it, and
 * they are never written to the database. A key with no row is not a fault.
 */

export type HelpDocKey = "privacy" | "terms" | "contact";

export type HelpContent = {
  /** Shown on Contact us, and dialled when tapped on a phone. */
  phone: string;
  email: string;
  privacy: string;
  terms: string;
  contact: string;
};

const ROW_KEY: Record<HelpDocKey, string> = {
  privacy: "legal_privacy",
  terms: "legal_terms",
  contact: "help_contact",
};

export const HELP_TITLES: Record<HelpDocKey, string> = {
  privacy: "Privacy Policy",
  terms: "Terms & Conditions",
  contact: "Contact Us",
};

export const HELP_BLURBS: Record<HelpDocKey, string> = {
  privacy: "What VIIV stores about you, and what it never does with it",
  terms: "What you can expect from VIIV, and what it expects of you",
  contact: "Phone, email and when to expect an answer",
};

/**
 * Written for what the app actually does today. Every claim here is one the
 * code keeps: collections are readable by their owner alone, the catalogue is
 * shared deliberately, photographs have their location data stripped before
 * they are uploaded, and nothing is sold to anybody.
 */
export const HELP_DEFAULTS: HelpContent = {
  phone: "",
  email: "",

  privacy: `VIIV is a tracker for a diecast collection. It is run by one person,
not by a company, and it does not sell anything about you to anybody.

Last updated: October 2026.

## What is stored
Your account holds your name, email address, and anything you choose to add to
your profile — a phone number, a date of birth, a picture. Your collection
holds what you have told it: the cars, what you paid, who you bought from, the
dates, your notes, and your photographs.

If you are on a paid plan, the account also holds which plan, when it started,
how long it runs for, whether you have asked for one, whether you have said you
are not renewing, and whether you have used your free trial. No card number,
expiry date or billing address is ever held, because none is ever typed into
this app — see Paying in the terms.

Two counts are kept because they are limits: how many card scans you have used
this month, and the day a collection first went over the free car limit.

## Who can see it
Your collection is yours. It is readable and editable by your account alone,
enforced by the database itself rather than by the app being polite about it.

Two things are shared on purpose, because the app would not work otherwise. The
catalogue — what a casting is: brand, make, model, colour, series, car number,
retail price — is visible to everybody, so nobody has to type the same car
twice. And a pre-order you place tells other collectors that the casting is
coming, and later that it has been released. Neither of those carries what you
paid, who you bought from, when it arrived, or your photographs.

Administrators can see the list of accounts — name, email, when you joined,
when you last signed in, how many cars you hold and which plan you are on — so
that accounts can be approved and plans granted. They cannot read your
collection.

## Photographs
Pictures you upload are resized and have their embedded metadata removed before
they leave your device, so the location your camera recorded is not stored. A
photo you set on your own car stays on your car.

## Card scanning
If you scan a card, that photograph is sent to the machine-learning provider
configured for this deployment, which reads the text off it and returns the
fields. It is sent for that one request and nothing else about you goes with
it — not your name, not your collection, not your other cars. Your monthly
scan count is kept so the allowance can be enforced.

If you would rather no photograph of yours left the app, do not use the
scanner. Every field it fills can be typed by hand.

## Looking up a photo
Searching for a picture of a casting sends the search words — make, model and
so on — to a web search engine. Your account is not named in that request. A
picture you then choose is copied into this app's own storage rather than
linked, so the site it came from is not told every time somebody opens the page.

## Feature requests and bug reports
If you send one, it stores what you wrote, which build you were running and
which screen you were on, attached to your account so it can be answered. It is
read by administrators and by nobody else.

## Notifications
If you turn notifications on, your browser gives this app a subscription
address for that device, which is stored so something can be sent to it.
Turning them off removes it.

## What is not done
Your data is not sold, rented, or handed to advertisers. There is no tracking
pixel, no analytics account following you between sites, and no third-party
advertising code anywhere in the app.

## Services this depends on
The app runs on hosting and database services provided by third parties, who
store the data on their machines under their own security terms. Card scanning
and photo lookup, when you use them, send the image or the search words to the
provider configured for that feature, and nothing else.

## How long it is kept
For as long as you keep the account. Cars put away because a free collection is
over the limit are not deleted — they are hidden, and they come back in full if
the account goes onto a paid plan. Feature requests and bug reports are kept so
there is a record of what was asked for.

## Your choices
You can correct anything about yourself from Settings, and you can export your
collection at any time. Ask and your account and everything in it will be
deleted — that removal is permanent and cannot be walked back.

Anything about your own data — a correction, an export, or deletion — reaches
the same person who runs the app, through Contact Us.`,

  terms: `VIIV is offered to collectors as-is, and these terms are meant to be
read once and then forgotten.

Last updated: October 2026.

## Your account
Accounts are approved by hand. Keep your password to yourself, and tell the
owner if you think somebody else has it. You are responsible for what is done
from your account.

## What you record
What you put in your collection is yours. Keep it accurate if you want the
figures to mean anything — the spend totals, the counts, and the duplicate
warnings are only as honest as what is typed into them.

Do not upload anything you do not have the right to upload, and do not upload
anything about other people.

## The shared catalogue
The catalogue is edited by everybody and used by everybody. Filing a casting
adds it for all of us, so file it as it is on the card rather than as you would
like it to read. An admin may correct, merge or remove an entry that is wrong
or duplicated.

## Plans
There is a free plan and there are paid ones. What each includes — how many
cars you may add, how many card scans a month, and which sections are open — is
shown on the plans screen in the app, and that screen is the current answer
rather than anything written here.

## Paying
Nothing is charged inside this app. Asking for a plan tells the administrators,
and a payment link is sent to you by email; the payment itself happens with
whoever provides that link, under their terms, and this app never sees or holds
your card details.

A plan runs for the length it was bought for and then ends. It does not renew
itself and nothing is taken automatically, so there is nothing to cancel in the
billing sense — telling us you are not renewing simply means nobody asks you
for the next one.

## The trial
One free trial per account, once, for fifteen days. It opens the paid sections
and leaves the car limit exactly where it was, so nothing you add during it can
be over the line when it ends. On the sixteenth day the account is a free one
again.

## When a plan ends
You keep everything until the last day you have paid for. After that the paid
sections close and the free car limit applies again. Anything above that limit
is put away rather than deleted: it is hidden from the app after fifteen days,
and every car comes back in full the moment the account is on a paid plan
again. Your cars, the catalogue and everything you have logged stay yours
either way.

## Refunds
Ask. This is run by one person, and a request made in good faith — a plan
bought by mistake, or something that did not work — is answered rather than
argued with. A plan already largely used is not usually refunded.

## Prices
Prices can change. A change applies to what you buy next, never to a plan you
have already paid for.

## What this is not
VIIV is a record of what you own, not a valuation, not an insurance document,
and not financial advice. Retail prices in the catalogue are a reference figure
somebody typed in, not an appraisal, and nothing here is an offer to buy or
sell anything.

## Availability
This is a personal project. It may be offline, it may lose a feature you liked,
and it may change without notice. Keep your own export if the data matters to
you — there is one in the app, and using it now and then is a good habit.

Being unable to use the app for a time does not by itself extend a plan,
though a long outage is the kind of thing worth asking about.

## Liability
The app is provided without warranty of any kind. The owner is not liable for
loss or damage arising from using it, or from being unable to use it.

## Changes to these terms
They will change as the app does. The date at the top says when they last did,
and continuing to use the app is how you accept the current ones.

## Ending it
You can stop using VIIV at any time and ask for your account to be deleted.
An account may be closed if it is used to harm somebody else or to damage the
shared catalogue.`,

  contact: `VIIV is looked after by one person, so an answer usually arrives
within a day or two rather than within minutes.

## Worth getting in touch about
A car or a casting the catalogue has wrong. A duplicate entry that wants
merging. Something that broke, ideally with what you were doing when it did.
Anything about your own data — a correction, an export, or deleting the account
altogether.

## Before you write
If a car looks wrong in your collection but right in the catalogue, try opening
it once and closing it again; that resolves most of it. If the app looks stale,
pull down to refresh.`,
};

type LooseClient = {
  from: (table: string) => {
    select: (cols: string) => {
      in: (col: string, vals: string[]) => Promise<{ data: unknown; error: unknown }>;
    };
    upsert: (
      row: Record<string, unknown>,
      opts: { onConflict: string },
    ) => Promise<{ error: { message: string } | null }>;
  };
};
const db = () => supabase as unknown as LooseClient;

const TABLE = "deployment_settings";

const str = (v: unknown, fallback: string) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s || fallback;
};

/** Cached for the tab: the Help menu and each document both ask. */
let cached: HelpContent | null = null;

/**
 * Everything the Help section shows. A missing row, a missing table and a
 * refused read all mean the same thing — nobody has edited this yet — and the
 * answer in every case is the default text rather than an empty page.
 */
export async function fetchHelpContent(): Promise<HelpContent> {
  try {
    const { data, error } = await db()
      .from(TABLE)
      .select("key, value")
      .in("key", Object.values(ROW_KEY));
    if (error || !Array.isArray(data)) return HELP_DEFAULTS;

    const rows = new Map<string, Record<string, unknown>>();
    for (const row of data as { key?: string; value?: unknown }[]) {
      if (typeof row.key === "string") {
        rows.set(row.key, (row.value ?? {}) as Record<string, unknown>);
      }
    }
    const contact = rows.get(ROW_KEY.contact) ?? {};
    const next: HelpContent = {
      phone: str(contact.phone, HELP_DEFAULTS.phone),
      email: str(contact.email, HELP_DEFAULTS.email),
      contact: str(contact.body, HELP_DEFAULTS.contact),
      privacy: str((rows.get(ROW_KEY.privacy) ?? {}).body, HELP_DEFAULTS.privacy),
      terms: str((rows.get(ROW_KEY.terms) ?? {}).body, HELP_DEFAULTS.terms),
    };
    cached = next;
    return next;
  } catch {
    return HELP_DEFAULTS;
  }
}

/**
 * Publish one document. Owner only — the database policy is what enforces
 * that, so a refusal here is reported rather than guessed at.
 */
export async function saveHelpDoc(
  key: HelpDocKey,
  patch: { body: string; phone?: string; email?: string },
): Promise<{ error?: string }> {
  const value =
    key === "contact"
      ? { body: patch.body, phone: patch.phone ?? "", email: patch.email ?? "" }
      : { body: patch.body };

  const { error } = await db().from(TABLE).upsert(
    { key: ROW_KEY[key], value, updated_at: new Date().toISOString() },
    {
      onConflict: "key",
    },
  );
  if (error) return { error: error.message };

  cached = null;
  return {};
}

/** The Help text, starting from whatever this tab already read. */
export function useHelpContent() {
  const [content, setContent] = useState<HelpContent>(cached ?? HELP_DEFAULTS);
  const [loaded, setLoaded] = useState(cached !== null);

  const reload = useCallback(async () => {
    const next = await fetchHelpContent();
    setContent(next);
    setLoaded(true);
    return next;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchHelpContent().then((next) => {
      if (cancelled) return;
      setContent(next);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { content, loaded, reload };
}
