import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { useApp } from "@/lib/store";
import { useCars } from "@/lib/cars-store";
import { suggestFor } from "@/lib/search";

/** Replace the segment after the last comma with `insert`. */
function applySuggestion(query: string, insert: string, kind: "field" | "value") {
  const idx = query.lastIndexOf(",");
  const head = idx >= 0 ? query.slice(0, idx + 1) + " " : "";
  const seg = idx >= 0 ? query.slice(idx + 1) : query;

  if (kind === "field") return head + insert;

  // Keep any "field = " prefix and previous "+" values in the segment
  const eq = seg.match(/^(\s*[A-Za-z#][A-Za-z0-9\s_#.-]*?\s*(?:=|:)\s*)(.*)$/);
  const prefix = eq ? eq[1].trimStart() : "";
  const rest = eq ? eq[2] : seg.trimStart();
  const plus = rest.lastIndexOf("+");
  const kept = plus >= 0 ? rest.slice(0, plus + 1) : "";
  return head + prefix + kept + insert;
}

export function SearchBox() {
  const { query, setQuery } = useApp();
  const cars = useCars();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fragment = useMemo(() => {
    const idx = query.lastIndexOf(",");
    return idx >= 0 ? query.slice(idx + 1) : query;
  }, [query]);

  const suggestions = useMemo(
    () => (open ? suggestFor(fragment, cars).slice(0, 10) : []),
    [open, fragment, cars],
  );

  useEffect(() => setActive(0), [fragment]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const choose = (i: number) => {
    const s = suggestions[i];
    if (!s) return;
    setQuery(applySuggestion(query, s.insert, s.kind));
    inputRef.current?.focus();
  };

  return (
    <div ref={wrapRef} className="relative ml-2 flex-1 max-w-2xl">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (!open || suggestions.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => (a + 1) % suggestions.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (a - 1 + suggestions.length) % suggestions.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            choose(active);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder="Search cars, series, sub series, car # — try “minigt 1133” or “car # = 1133”"
        className={query ? "pl-9 pr-9" : "pl-9"}
      />
      {query && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setQuery("");
            setOpen(false);
            inputRef.current?.focus();
          }}
          className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      )}
      {open && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-md border border-border bg-popover shadow-lg">
          <ul className="max-h-72 overflow-y-auto py-1 text-sm">
            {suggestions.map((s, i) => (
              <li key={s.kind + s.label}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(i)}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left ${
                    i === active ? "bg-muted" : ""
                  }`}
                >
                  <span className="truncate">{s.label}</span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {s.hint}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
            Use <b>+</b> for “or” (red+yellow) · <b>,</b> to add another filter · <b>&gt;</b> /{" "}
            <b>&lt;</b> for cost &amp; year
          </div>
        </div>
      )}
    </div>
  );
}
