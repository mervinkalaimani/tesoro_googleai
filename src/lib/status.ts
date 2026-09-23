import {
  CalendarClock,
  CircleDot,
  CirclePause,
  PackageCheck,
  Search,
  Truck,
  Hourglass,
  type LucideIcon,
} from "lucide-react";

/**
 * What state a car is in — the six, and nothing else.
 *
 * There used to be eleven, spelled out separately in a dozen files: "Available"
 * and "Available (In Hand)", "Transit" and "Out for Delivery", "Waiting" and
 * "On Hold" and "Delayed", "PO" and "Pre Order", "Lost" and "Wrong Item" and
 * "ISO". Most of those pairs were the same thing typed twice, and every list,
 * filter, tab and colour map had its own copy of whichever ones it knew about.
 *
 * Six now, each answering a question actually worth asking:
 *
 *   In Hand     you physically have it
 *   In Transit  it is moving
 *   Ordered     you bought it and it is coming
 *   On Hold     you paid and the seller is keeping it until you ask
 *   PO          you reserved it before release
 *   ISO         you don't have it and you're looking
 *
 * "Delayed" is deliberately absent. Being late is not a stage of a car's life,
 * it is an Ordered or In Transit car whose expected day has gone by — derived
 * in delivery-watch.ts, so it can never disagree with the date the way a
 * hand-set status did. All three cars marked Delayed when this was written were
 * expecting a date in the future.
 */
export const STATUSES = ["In Hand", "In Transit", "Ordered", "On Hold", "PO", "ISO"] as const;

export type Status = (typeof STATUSES)[number];

/** Case, punctuation and spacing are not part of a status. */
const key = (s: string | null | undefined) =>
  (s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, "");

/**
 * Every spelling that has ever been written into the Status column, and what it
 * means now.
 *
 * This outlives the migration on purpose. Old bookmarks carry `?status=Available`,
 * the CSV importer takes whatever a spreadsheet says, and the guest seed is
 * fixed text — all of them arrive spelling a status the way it used to be
 * spelled, and all of them land here.
 */
const ALIASES: Record<string, Status> = {
  // In Hand
  inhand: "In Hand",
  available: "In Hand",
  availableinhand: "In Hand",
  delivered: "In Hand",
  received: "In Hand",
  // In Transit
  intransit: "In Transit",
  transit: "In Transit",
  transitintransit: "In Transit",
  outfordelivery: "In Transit",
  shipped: "In Transit",
  // Ordered
  ordered: "Ordered",
  waiting: "Ordered",
  delayed: "Ordered",
  // On Hold
  onhold: "On Hold",
  hold: "On Hold",
  // PO
  po: "PO",
  preorder: "PO",
  // ISO
  iso: "ISO",
  lost: "ISO",
  wrongitem: "ISO",
  insearchof: "ISO",
};

/**
 * The status this row is really in. Empty string for a blank; an unrecognised
 * value is handed back trimmed rather than guessed at, so a status nobody
 * planned for shows itself instead of silently becoming In Hand.
 */
export function normaliseStatus(s: string | null | undefined): Status | "" | string {
  const k = key(s);
  if (!k) return "";
  return ALIASES[k] ?? (s || "").trim();
}

/** True when the value is one of the six, after normalising. */
export function isStatus(s: string | null | undefined): s is Status {
  return (STATUSES as readonly string[]).includes(normaliseStatus(s));
}

/**
 * The order cars are listed in: closest to your hands first. Within a status,
 * cars keep their SNO (insertion) order.
 */
const RANK: Record<Status, number> = {
  "In Hand": 0,
  "In Transit": 1,
  Ordered: 2,
  "On Hold": 3,
  PO: 4,
  ISO: 5,
};

/** Anything unrecognised sorts after every known status rather than first. */
export function statusRank(s: string | null | undefined): number {
  const n = normaliseStatus(s);
  return isStatus(n) ? RANK[n] : STATUSES.length;
}

export const isInHand = (s: string | null | undefined) => normaliseStatus(s) === "In Hand";
export const isPreOrder = (s: string | null | undefined) => normaliseStatus(s) === "PO";
export const isIso = (s: string | null | undefined) => normaliseStatus(s) === "ISO";
export const isOnHold = (s: string | null | undefined) => normaliseStatus(s) === "On Hold";

/**
 * Money is committed and the car is not here: everything except In Hand, which
 * has arrived, and ISO, which was never bought.
 */
export function isOpenOrder(s: string | null | undefined): boolean {
  const n = normaliseStatus(s);
  return n === "In Transit" || n === "Ordered" || n === "On Hold" || n === "PO";
}

/**
 * The two statuses a Late badge can attach to.
 *
 * On Hold is excluded, and that exclusion is the reason it survived the merge
 * into Ordered: a held car's date passing is you keeping it held, not a seller
 * missing a promise. Folded into Ordered, every held car would have flagged
 * late forever.
 */
export const CAN_BE_LATE: readonly Status[] = ["Ordered", "In Transit"];

export const canBeLate = (s: string | null | undefined) =>
  (CAN_BE_LATE as readonly string[]).includes(normaliseStatus(s));

/**
 * Every one of these means the car has been bought or committed to, so the
 * purchase has to be recorded: who from, what it cost, when it was ordered and
 * when it is due. ISO is not one — it means the purchase is off.
 */
export const needsPurchase = (s: string | null | undefined) => !isIso(s);

/** Only a car actually moving has a courier and a consignment number. */
export const needsTransit = (s: string | null | undefined) => normaliseStatus(s) === "In Transit";

/**
 * The order a car normally travels in, used only to preselect the likely next
 * step. Every status stays one click away, because cars go backwards too.
 *
 * On Hold sits beside this line rather than on it — a held car leaves at
 * Ordered and rejoins whenever you tell the seller to send it — so its next
 * step is In Transit, the same as Ordered's.
 */
const FLOW: Status[] = ["ISO", "PO", "Ordered", "In Transit", "In Hand"];

export function nextInFlow(current: string | null | undefined): Status {
  const n = normaliseStatus(current);
  if (n === "On Hold") return "In Transit";
  const i = FLOW.indexOf(n as Status);
  if (i < 0 || i >= FLOW.length - 1) return "In Hand";
  return FLOW[i + 1];
}

/** Pill colours with proper contrast and support for light and dark modes. */
export const STATUS_STYLES: Record<Status, string> = {
  "In Hand":
    "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800/60",
  "In Transit":
    "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/70 dark:text-blue-300 dark:border-blue-800/60",
  Ordered:
    "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-800/60",
  "On Hold":
    "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950/70 dark:text-orange-300 dark:border-orange-800/60",
  PO: "bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-950/70 dark:text-violet-300 dark:border-violet-800/60",
  ISO: "bg-zinc-100 text-zinc-800 border-zinc-300 dark:bg-zinc-800/70 dark:text-zinc-300 dark:border-zinc-700/60",
};

/** The Late badge is not a status, so it keeps its colour here beside them. */
export const LATE_STYLE =
  "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/70 dark:text-rose-300 dark:border-rose-800/60";

export const STATUS_ICON: Record<Status, LucideIcon> = {
  "In Hand": PackageCheck,
  "In Transit": Truck,
  Ordered: Hourglass,
  "On Hold": CirclePause,
  PO: CalendarClock,
  ISO: Search,
};

/** A status outside the six (an older spelling) gets a plain dot. */
export const iconFor = (s: string | null | undefined): LucideIcon => {
  const n = normaliseStatus(s);
  return isStatus(n) ? STATUS_ICON[n] : CircleDot;
};

export const styleFor = (s: string | null | undefined): string => {
  const n = normaliseStatus(s);
  return isStatus(n) ? STATUS_STYLES[n] : "border-border bg-muted/40 text-muted-foreground";
};

/** Icon tints for the status dialog's list, which shows them on a plain row. */
export const STATUS_TONE: Record<Status, string> = {
  "In Hand": "text-emerald-500",
  "In Transit": "text-blue-500",
  Ordered: "text-amber-500",
  "On Hold": "text-orange-500",
  PO: "text-violet-500",
  ISO: "text-zinc-500",
};

export const toneFor = (s: string | null | undefined): string => {
  const n = normaliseStatus(s);
  return isStatus(n) ? STATUS_TONE[n] : "text-muted-foreground";
};
