import type { Diecast } from "@/lib/types";
import type { CsvColumn } from "@/lib/csv";
import { inrFull, inrPriceFull } from "@/lib/format";
import { SITE_ORIGIN } from "@/lib/site";
import logoSvg from "../../public/viiv_icon.svg?raw";

/**
 * A printable collection report, and the same page as an image.
 *
 * Rendered as a styled HTML document and handed to the browser's print dialog,
 * where "Save as PDF" produces the file. No PDF library: the two that would do
 * this ship their own font stack, and the standard PDF fonts have no rupee
 * glyph — every price in this app would print as a box or vanish. Printing uses
 * the system's own fonts, and gets real CSS for the layout, page breaks and
 * repeating table headers into the bargain. export-share.ts draws the same HTML
 * to a PNG for sharing.
 */

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export type ReportMeta = {
  /** "Inventory", "Favourites" — what this list is. */
  title: string;
  /** Filters or search in force, so the page says what it is a report *of*. */
  subtitle?: string;
  /** Shown in the letterhead. */
  owner?: string;
  /** "image" lays the page out as one tall sheet of a fixed width instead of A4 pages. */
  mode?: "pdf" | "image";
  /** Width of the image sheet in CSS pixels. */
  width?: number;
  /** A photo URL (or data URL) for a car; the Photo column is blank without it. */
  photoSrc?: (r: Diecast) => string;
};

/** Money columns: right-aligned, formatted, and totalled at the foot. */
const MONEY = new Set(["spent", "mrp", "paid", "balance", "shippingCost"]);
/** Never lifted to the top: they identify a row rather than describe a group. */
const PER_ROW = new Set(["name", "id", "imageUrl", "transitInfo", "trackingId"]);

/**
 * The columns whose value is the same on every row, with that value.
 *
 * A seller shared by the whole export is said once, at the top, instead of down
 * a column. Only when every car has it: one different seller, or one car with
 * none, and the column stays. At least one column is always left for the table.
 */
export function commonFields(
  rows: Diecast[],
  columns: CsvColumn<Diecast>[],
): { common: { label: string; value: string }[]; rest: CsvColumn<Diecast>[] } {
  if (rows.length < 2) return { common: [], rest: columns };
  const common: { label: string; value: string }[] = [];
  const rest: CsvColumn<Diecast>[] = [];
  for (const c of columns) {
    const first = String(c.get(rows[0]) ?? "").trim();
    const shared =
      !MONEY.has(c.key) &&
      !PER_ROW.has(c.key) &&
      first !== "" &&
      first !== "-" &&
      rows.every((r) => String(c.get(r) ?? "").trim() === first);
    if (shared) common.push({ label: c.label, value: first });
    else rest.push(c);
  }
  return rest.length ? { common, rest } : { common: [], rest: columns };
}

const CSS = `
  :root { --ink:#16181d; --muted:#6b7280; --line:#e6e8ec; --accent:#EF6413; --tint:#fff6f0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { color:var(--ink); background:#fff; font:10pt/1.45 -apple-system,"Segoe UI",Helvetica,Arial,sans-serif;
    -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .top { display:flex; justify-content:space-between; align-items:center; padding-bottom:12px; border-bottom:3px solid var(--accent); }
  .brand { display:flex; align-items:center; gap:12px; }
  .logo svg { width:100%; height:100%; display:block; }
  .logo { width:46px; height:46px; display:block; } .logo.sm { width:30px; height:30px; }
  .word { font-size:24pt; font-weight:800; letter-spacing:2px; line-height:1; }
  .sub { font-size:9pt; color:var(--muted); margin-top:4px; }
  .meta { text-align:right; font-size:9pt; color:var(--muted); } .meta b { color:var(--ink); font-size:12pt; }
  .chips { display:flex; flex-wrap:wrap; gap:8px; margin:14px 0 0; }
  .chip { display:flex; gap:8px; align-items:baseline; background:#f1f2f4; border-radius:999px; padding:5px 14px; font-size:9.5pt; }
  .chip span { font-size:7pt; text-transform:uppercase; letter-spacing:.6px; color:var(--muted); } .chip b { font-weight:700; }
  .stats { display:flex; gap:8px; margin:14px 0; }
  .stat { flex:1; background:var(--tint); border-radius:8px; padding:8px 12px; }
  .sl { font-size:7pt; text-transform:uppercase; letter-spacing:.7px; color:var(--muted); } .sv { font-size:14pt; font-weight:700; }
  table { width:100%; border-collapse:collapse; font-size:9pt; }
  thead { display:table-header-group; } tr { break-inside:avoid; page-break-inside:avoid; }
  th { background:var(--ink); color:#fff; text-align:left; font-size:7pt; text-transform:uppercase; letter-spacing:.6px; padding:7px 8px; }
  th:first-child { border-radius:6px 0 0 0; } th:last-child { border-radius:0 6px 0 0; }
  td { padding:5px 8px; border-bottom:1px solid var(--line); vertical-align:middle; }
  tbody tr:nth-child(even) td { background:#f8f9fa; }
  .n { text-align:right; font-variant-numeric:tabular-nums; } .nm { font-weight:600; }
  .ph { width:48px; height:30px; object-fit:contain; background:#f1f2f4; border-radius:4px; display:block; }
  tfoot td { font-weight:700; border-top:2px solid var(--ink); background:#fff; }
  .vf { margin-top:16px; padding-top:10px; border-top:3px solid var(--accent); display:flex; justify-content:space-between;
    align-items:center; font-size:8.5pt; color:var(--muted); break-inside:avoid; }
  .vl { display:flex; gap:10px; align-items:center; } .vl b { color:var(--ink); font-size:10pt; letter-spacing:1.5px; }
  .vr { text-align:right; } .empty { padding:30px; text-align:center; color:var(--muted); }
`;

export function buildReportHtml(
  rows: Diecast[],
  columns: CsvColumn<Diecast>[],
  meta: ReportMeta,
): string {
  const spend = rows.reduce((s, r) => s + (r.spent || 0), 0);
  const mrp = rows.reduce((s, r) => s + (r.mrp || 0), 0);
  const generated = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const logo = logoSvg.replace(/\s(width|height)="\d+"/g, "");
  const picked = commonFields(rows, columns);
  const { common } = picked;
  // Photo and name lead the table whatever order the columns are declared in.
  const lead = (c: CsvColumn<Diecast>) => (c.key === "imageUrl" ? 0 : c.key === "name" ? 1 : 2);
  const rest = [...picked.rest].sort((a, b) => lead(a) - lead(b));

  const stat = (label: string, value: string) =>
    `<div class="stat"><div class="sl">${esc(label)}</div><div class="sv">${esc(value)}</div></div>`;

  const head = rest
    .map((c) => `<th class="${MONEY.has(c.key) ? "n" : ""}">${esc(c.label)}</th>`)
    .join("");

  const cell = (c: CsvColumn<Diecast>, r: Diecast) => {
    if (c.key === "imageUrl") {
      const src = meta.photoSrc?.(r) ?? r.imageUrl ?? "";
      return src ? `<img class="ph" src="${esc(src)}" alt="">` : "";
    }
    const raw = c.get(r);
    if (MONEY.has(c.key))
      return Number(raw)
        ? esc(c.key === "mrp" ? inrPriceFull(Number(raw)) : inrFull(Number(raw)))
        : "—";
    return c.key === "name" ? `<span class="nm">${esc(raw || "—")}</span>` : esc(raw || "—");
  };

  const body = rows
    .map(
      (r) =>
        `<tr>${rest.map((c) => `<td class="${MONEY.has(c.key) ? "n" : ""}">${cell(c, r)}</td>`).join("")}</tr>`,
    )
    .join("");

  // A total under every money column that is shown; the first cell carries the label.
  const foot = rest.some((c) => MONEY.has(c.key))
    ? `<tfoot><tr>${rest
        .map((c, i) => {
          if (!MONEY.has(c.key)) return `<td>${i === 0 ? `Total · ${rows.length} cars` : ""}</td>`;
          const sum = rows.reduce((s, r) => s + (Number(c.get(r)) || 0), 0);
          return `<td class="n">${sum ? esc(c.key === "mrp" ? inrPriceFull(sum) : inrFull(sum)) : "—"}</td>`;
        })
        .join("")}</tr></tfoot>`
    : "";

  const sheet =
    meta.mode === "image"
      ? `body{width:${meta.width ?? 900}px;padding:32px;font-size:10pt}`
      : "@page{size:A4 landscape;margin:12mm}";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(meta.title)} — VIIV</title>
<style>${CSS}${sheet}</style>
</head>
<body>
  <div class="top">
    <div class="brand"><span class="logo">${logo}</span>
      <div><div class="word">VIIV</div><div class="sub">Collection report</div></div></div>
    <div class="meta"><b>${esc(meta.title)}${meta.subtitle ? ` · ${esc(meta.subtitle)}` : ""}</b><br>
      ${meta.owner ? `${esc(meta.owner)} · ` : ""}${esc(generated)} · ${rows.length.toLocaleString()} car${rows.length === 1 ? "" : "s"}</div>
  </div>
  ${
    common.length
      ? `<div class="chips">${common.map((f) => `<div class="chip"><span>${esc(f.label)}</span><b>${esc(f.value)}</b></div>`).join("")}</div>`
      : ""
  }
  <div class="stats">
    ${stat("Cars", rows.length.toLocaleString())}
    ${mrp ? stat("Total MRP", inrPriceFull(mrp)) : ""}
    ${spend ? stat("Total paid", inrFull(spend)) : ""}
    ${mrp && spend && mrp > spend ? stat("Saved", inrFull(mrp - spend)) : ""}
  </div>
  ${
    rows.length
      ? `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot}</table>`
      : `<p class="empty">No cars matched this selection.</p>`
  }
  <div class="vf">
    <div class="vl"><span class="logo sm">${logo}</span><div><b>VIIV</b><br>Your diecast collection, catalogued.</div></div>
    <div class="vr">${esc(SITE_ORIGIN.replace(/^https?:\/\//, ""))}<br>Report generated by VIIV</div>
  </div>
</body>
</html>`;
}

/**
 * Render the report into an off-screen frame and open the print dialog.
 *
 * A hidden iframe rather than a new window: a popup blocker cannot swallow it,
 * and nothing about the current page — scroll position, open dialog, unsaved
 * form — is disturbed. The frame is torn down once printing has been dismissed.
 */
export function printReport(html: string) {
  if (typeof document === "undefined") return;

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);

  const cleanup = () => {
    // A beat after the dialog closes: removing the frame while the print job is
    // still reading from it cancels the job in some browsers.
    window.setTimeout(() => frame.remove(), 1000);
  };

  frame.onload = () => {
    const win = frame.contentWindow;
    if (!win) {
      cleanup();
      return;
    }
    win.addEventListener("afterprint", cleanup, { once: true });
    try {
      win.focus();
      win.print();
    } catch {
      cleanup();
    }
  };

  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
}
