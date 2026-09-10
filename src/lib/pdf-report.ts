import type { Diecast } from "@/lib/types";
import type { CsvColumn } from "@/lib/csv";
import { inrFull } from "@/lib/format";

/**
 * A printable collection report.
 *
 * Rendered as a styled HTML document and handed to the browser's print dialog,
 * where "Save as PDF" produces the file. No PDF library: the two that would do
 * this ship their own font stack, and the standard PDF fonts have no rupee
 * glyph — every price in this app would print as a box or vanish. Printing uses
 * the system's own fonts, and gets real CSS for the layout, page breaks and
 * repeating table headers into the bargain.
 */

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Top `n` values of one field, with counts. */
function top(rows: Diecast[], pick: (r: Diecast) => string, n: number) {
  const m = new Map<string, number>();
  for (const r of rows) {
    const v = (pick(r) || "").trim();
    if (!v) continue;
    m.set(v, (m.get(v) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

export type ReportMeta = {
  /** "Inventory", "Favourites" — what this list is. */
  title: string;
  /** Filters or search in force, so the page says what it is a report *of*. */
  subtitle?: string;
  /** Shown in the letterhead. */
  owner?: string;
};

export function buildReportHtml(
  rows: Diecast[],
  columns: CsvColumn<Diecast>[],
  meta: ReportMeta,
): string {
  const spend = rows.reduce((s, r) => s + (r.spent || 0), 0);
  const mrp = rows.reduce((s, r) => s + (r.mrp || 0), 0);
  const brands = new Set(rows.map((r) => (r.brand || "").trim()).filter(Boolean)).size;
  const generated = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Numeric columns sit right so the digits line up down the page.
  const numeric = new Set(["spent", "mrp", "paid"]);

  const stat = (label: string, value: string) =>
    `<div class="stat"><div class="stat-label">${esc(label)}</div><div class="stat-value">${esc(value)}</div></div>`;

  const topBrands = top(rows, (r) => r.brand, 5);
  const topSeries = top(rows, (r) => r.series, 5);

  const chartRow = (entries: [string, number][], heading: string) => {
    if (!entries.length) return "";
    const max = entries[0][1] || 1;
    return `<section class="panel">
      <h2>${esc(heading)}</h2>
      ${entries
        .map(
          ([name, n]) => `<div class="bar-row">
            <span class="bar-name">${esc(name)}</span>
            <span class="bar-track"><span class="bar-fill" style="width:${Math.round((n / max) * 100)}%"></span></span>
            <span class="bar-count">${n}</span>
          </div>`,
        )
        .join("")}
    </section>`;
  };

  const head = columns
    .map((c) => `<th class="${numeric.has(c.key) ? "num" : ""}">${esc(c.label)}</th>`)
    .join("");

  const body = rows
    .map((r, i) => {
      const cells = columns
        .map((c) => {
          const raw = c.get(r);
          const value = numeric.has(c.key) ? (Number(raw) ? inrFull(Number(raw)) : "—") : raw;
          return `<td class="${numeric.has(c.key) ? "num" : ""}">${esc(value || "—")}</td>`;
        })
        .join("");
      return `<tr class="${i % 2 ? "alt" : ""}">${cells}</tr>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(meta.title)} — Tesoro</title>
<style>
  @page { size: A4 landscape; margin: 14mm 12mm 16mm; }

  :root {
    --ink: #16181d;
    --muted: #6b7280;
    --line: #e3e6ea;
    --accent: #b3123a;
    --tint: #fbf3f5;
  }

  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    color: var(--ink);
    background: #fff;
    font: 10pt/1.45 "Segoe UI", -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  header.masthead {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    border-bottom: 2.5pt solid var(--accent);
    padding-bottom: 8px;
  }
  .brand { font-size: 20pt; font-weight: 700; letter-spacing: -0.4pt; }
  .brand span { color: var(--accent); }
  .masthead h1 { margin: 2px 0 0; font-size: 11pt; font-weight: 600; color: var(--muted); }
  .masthead .meta { text-align: right; font-size: 8.5pt; color: var(--muted); line-height: 1.5; }

  .stats { display: flex; gap: 8px; margin: 12px 0; }
  .stat {
    flex: 1;
    border: 0.75pt solid var(--line);
    border-top: 2pt solid var(--accent);
    border-radius: 3pt;
    padding: 7px 10px;
    background: var(--tint);
  }
  .stat-label {
    font-size: 7pt; text-transform: uppercase; letter-spacing: 0.6pt; color: var(--muted);
  }
  .stat-value { font-size: 13pt; font-weight: 700; margin-top: 2px; }

  .panels { display: flex; gap: 8px; margin-bottom: 12px; }
  .panel {
    flex: 1; border: 0.75pt solid var(--line); border-radius: 3pt; padding: 8px 10px;
  }
  .panel h2 {
    margin: 0 0 6px; font-size: 7pt; text-transform: uppercase;
    letter-spacing: 0.6pt; color: var(--muted); font-weight: 600;
  }
  .bar-row { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; font-size: 8.5pt; }
  .bar-name { width: 34%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bar-track { flex: 1; height: 5pt; background: var(--line); border-radius: 3pt; overflow: hidden; }
  .bar-fill { display: block; height: 100%; background: var(--accent); }
  .bar-count { width: 22pt; text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; }

  table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
  /* Repeat the header on every printed page rather than only the first. */
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; break-inside: avoid; }
  th {
    text-align: left; font-size: 7pt; text-transform: uppercase; letter-spacing: 0.5pt;
    color: #fff; background: var(--ink); padding: 5px 7px; font-weight: 600;
  }
  td { padding: 4px 7px; border-bottom: 0.5pt solid var(--line); vertical-align: top; }
  tr.alt td { background: #f7f8f9; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  td:first-child { font-weight: 600; }

  footer {
    margin-top: 10px; padding-top: 6px; border-top: 0.75pt solid var(--line);
    font-size: 7.5pt; color: var(--muted);
    display: flex; justify-content: space-between;
  }

  .empty { padding: 30px; text-align: center; color: var(--muted); }
</style>
</head>
<body>
  <header class="masthead">
    <div>
      <div class="brand">Tes<span>o</span>ro</div>
      <h1>${esc(meta.title)}${meta.subtitle ? ` · ${esc(meta.subtitle)}` : ""}</h1>
    </div>
    <div class="meta">
      ${meta.owner ? `<div><strong>${esc(meta.owner)}</strong></div>` : ""}
      <div>${esc(generated)}</div>
    </div>
  </header>

  <div class="stats">
    ${stat("Castings", rows.length.toLocaleString())}
    ${stat("Total spend", inrFull(spend))}
    ${stat("Total MRP", inrFull(mrp))}
    ${stat("Average spend", inrFull(rows.length ? spend / rows.length : 0))}
    ${stat("Brands", String(brands))}
  </div>

  ${
    topBrands.length || topSeries.length
      ? `<div class="panels">
          ${chartRow(topBrands, "Leading brands")}
          ${chartRow(topSeries, "Leading series")}
        </div>`
      : ""
  }

  ${
    rows.length
      ? `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
      : `<p class="empty">No cars matched this selection.</p>`
  }

  <footer>
    <span>Tesoro collection report</span>
    <span>${rows.length.toLocaleString()} castings · ${esc(generated)}</span>
  </footer>
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
