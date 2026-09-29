/**
 * What changed, in the words of somebody who uses the app.
 *
 * Hand-written rather than generated from commits: a commit subject is written
 * for whoever is reading the log, and half of them are about a file. One entry
 * per push, the build number being the commit count that built it, so two
 * people comparing screens can say which one is behind.
 *
 * `key` marks the two or three things in a release worth stopping on. If
 * everything is marked, nothing is.
 */
export type Change = { text: string; key?: boolean };

export type Release = {
  /** Commits at the time of the build. Monotonic, and it matches the deploy. */
  build: number;
  /** Local time of the push, ISO without a zone. */
  at: string;
  changes: Change[];
};

/** Newest first. */
export const RELEASES: Release[] = [
  {
    build: 223,
    at: "2026-09-29T16:53",
    changes: [
      {
        key: true,
        text: "Delete my data, in Settings → Account: your cars, your profile and your login go. Castings you added to the shared catalogue stay, with your name off them. Export a CSV first — nothing can bring it back.",
      },
      {
        key: true,
        text: "A Merge button beside a casting's name in the catalogue. It finds the other copies by brand, car number, make, model and series, shows how closely each one agrees, and folds one in — or keeps it as another box.",
      },
      {
        key: true,
        text: "The app now notices when it has been deployed again and offers to refresh, so a tab left open all week stops running last week's code.",
      },
      {
        text: "Metadata editor in Settings → Advanced: rename brands, makes, models and colours across the whole catalogue. Assortments, catalogue entries and brand logos are tabs of it.",
      },
      {
        text: "Duplicates in the edit window are the same casting only — same brand, make, model and number — each with a percentage match, closest first.",
      },
      { text: "A password reset can be asked for from the login page." },
      {
        text: "Paid moved out of the boxes and into Seller & payment, where it appears when payment is Partial or Pending.",
      },
      {
        text: "Picking diorama, a 2–10 pack, team transport or super rigs ticks multipack and fills in how many cars are in it.",
      },
      { text: "A photo can be added by link on a phone, not only on a computer." },
      { text: "A box can leave its casting and stand on its own, or join another." },
      { text: "The close button sits in line with the title in every dialog." },
      {
        text: "Fixed: the filters on the catalogue stopped taking clicks once the page had been scrolled.",
      },
      { text: "Fixed: an assortment row can be removed, not only emptied." },
    ],
  },
  {
    build: 210,
    at: "2026-09-28T23:36",
    changes: [
      {
        key: true,
        text: "A brand shelf on the catalogue: round brand marks under the filters, ordered by how many castings each brand has. Pick one and the rest dim.",
      },
      {
        key: true,
        text: "Sellers is a page of its own — what you bought from whom, what it cost and what is still owed — and it is on the phone's navigation bar.",
      },
      {
        text: "Collection and Duplicates read as tables that open a row at a time, rather than a column of cards.",
      },
      {
        text: "Brand logos can be uploaded as a PNG, SVG, JPG or WebP, or pointed at a link (Settings → Metadata).",
      },
      {
        text: "Prices read Rs 350 · MRP 250 (+1.4×) everywhere — over MRP in red, under in green.",
      },
      { text: "Hot Wheels was respelled Hotwheels: 27 cars and 24 catalogue entries." },
      { text: "A seller's name is a door to everything bought from them." },
    ],
  },
  {
    build: 198,
    at: "2026-09-28T16:19",
    changes: [
      {
        key: true,
        text: "A casting can come in more than one box, and Add a car asks which one yours came in rather than guessing.",
      },
      { text: "Assortments read as a table, and a pack counts as one box by definition." },
      {
        text: "The calendar is a Tesoro page now: it carries what each day cost and reads as a month when you want one.",
      },
      { text: "A pre-order is due in a month rather than on a day it was never promised on." },
      { text: "A casting says what it typically sold for, or its MRP." },
    ],
  },
];

export const LATEST_BUILD = RELEASES[0].build;

/** Where the last build read is remembered. Per browser, not per account. */
export const SEEN_KEY = "dg.whatsNewSeen";

/** What has landed since the build last read. */
export function releasesSince(seen: number): Release[] {
  return RELEASES.filter((r) => r.build > seen);
}

/** The build last read, or 0 — a browser that has never looked has news. */
export function readSeen(): number {
  try {
    return Number(localStorage.getItem(SEEN_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function writeSeen(build: number): void {
  try {
    localStorage.setItem(SEEN_KEY, String(build));
  } catch {
    // A browser that will not keep it shows the news again. No worse than that.
  }
}

/** "29 Sep 2026, 4:53 pm" in the reader's own locale. */
export function stamp(at: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return at;
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
