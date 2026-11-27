import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, Info } from "lucide-react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** The text colours out of a tone (a status's badge classes), for a label sitting on the tone's own fill. */
const toneText = (tone?: string) =>
  (tone || "")
    .split(/\s+/)
    .filter((c) => /^(dark:)?text-/.test(c))
    .join(" ");

function SegmentRow<T extends string>({
  value,
  onChange,
  options,
  className,
  disabled,
  clearable = false,
  fill = false,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; tone?: string }[];
  className?: string;
  disabled?: boolean;
  /**
   * Tapping the chosen option again unsets it. An optional grade needs that —
   * having picked "Damaged" by mistake there is otherwise no way back to blank —
   * and a required state like a payment status must not have it.
   */
  clearable?: boolean;
  /**
   * The options share the width equally instead of hugging their labels. For a
   * control sitting in a form field that is what reads as a field: hugging left
   * it looks like three loose buttons with a gap after them.
   */
  fill?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeBtnRef = useRef<HTMLButtonElement | null>(null);

  // The selected pill is one element that slides to the chosen option, rather than a
  // background that appears on it: where it is and how wide, measured off the button.
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  const [armed, setArmed] = useState(false);
  useLayoutEffect(() => {
    const measure = () => {
      const b = activeBtnRef.current;
      setPill(b ? { left: b.offsetLeft, width: b.offsetWidth } : null);
    };
    measure();
    const c = containerRef.current;
    if (!c) return;
    const ro = new ResizeObserver(measure);
    ro.observe(c);
    return () => ro.disconnect();
  }, [value, options.length]);
  // Slide only once it has a place to slide from: the first paint just puts it there.
  useEffect(() => {
    const id = requestAnimationFrame(() => setArmed(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // When value changes, scroll active item into view horizontally
  useEffect(() => {
    if (activeBtnRef.current && containerRef.current) {
      activeBtnRef.current.scrollIntoView({
        behavior: "smooth",
        inline: "nearest",
        block: "nearest",
      });
    }
  }, [value]);

  const activeTone = options.find((o) => o.value === value)?.tone;
  return (
    <div
      ref={containerRef}
      className={cn(
        // Flow strictly left and right: flex-nowrap, whitespace-nowrap, overflow-y-hidden, touch-pan-x
        "flex flex-nowrap min-w-0 max-w-full h-8 shrink-0 items-center snap-x overflow-x-auto overflow-y-hidden whitespace-nowrap touch-pan-x overscroll-x-contain relative glass-btn [html.dark_&]:!shadow-none scroll-px-[3px] rounded-full p-[3px] text-xs [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        fill ? "w-full" : "inline-flex w-auto",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-[3px] rounded-full",
          activeTone ? `border ${activeTone}` : "seg-glass-pill",
          armed && "transition-[left,width,opacity] duration-300 ease-out",
          pill ? "opacity-100" : "opacity-0",
        )}
        style={{ left: pill?.left ?? 0, width: pill?.width ?? 0 }}
      />
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            ref={active ? activeBtnRef : undefined}
            type="button"
            disabled={disabled}
            onClick={() => onChange(clearable && active ? ("" as T) : o.value)}
            className={cn(
              "relative z-10 h-full shrink-0 inline-flex items-center justify-center whitespace-nowrap snap-start select-none rounded-full px-3 text-center font-medium leading-none transition-colors",
              fill ? "flex-1 basis-0" : "",
              active
                ? cn("font-semibold", toneText(o.tone) || "text-foreground")
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A segment control that is one value with up/down chevrons on a phone. Each
 * tap steps to the next option and wraps round — no popup, no row to scroll
 * sideways. From sm: up it is the ordinary segment control.
 *
 * `separate` names an option that gets a button of its own beside the pill
 * ("All"), and the pill cycles through the rest. Until one of the rest is
 * chosen the pill is plain, and its first tap picks the first of them.
 */
export function CyclePill<T extends string>({
  value,
  onChange,
  options,
  className,
  separate,
  disabled,
  fill,
  phoneOnly,
  menuOnTap,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; tone?: string }[];
  className?: string;
  separate?: T;
  disabled?: boolean;
  fill?: boolean;
  /** No segment row from sm: up — for a set too long to lay out as a row. */
  phoneOnly?: boolean;
  /**
   * A tap opens the list of every choice instead of stepping to the next. For a set where
   * stepping through would be a long way round (the colours), the pill still shows one value.
   */
  menuOnTap?: boolean;
}) {
  const rest = options.filter((o) => o.value !== separate);
  // Press and hold lists every choice. The tap that follows a hold is swallowed.
  const [menu, setMenu] = useState(false);
  const holdTimer = useRef(0);
  const held = useRef(false);
  const startHold = () => {
    held.current = false;
    window.clearTimeout(holdTimer.current);
    holdTimer.current = window.setTimeout(() => {
      held.current = true;
      setMenu(true);
    }, 450);
  };
  const endHold = () => window.clearTimeout(holdTimer.current);
  // Shown once, on the first tap, so the hold is discoverable.
  const [hint, setHint] = useState(false);
  const hintTimer = useRef(0);
  const showHint = () => {
    setHint(true);
    window.clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(() => setHint(false), 3500);
  };
  const hintOnce = () => {
    try {
      if (localStorage.getItem("dg.cycleHint")) return;
      localStorage.setItem("dg.cycleHint", "1");
    } catch {
      return;
    }
    showHint();
  };
  const i = rest.findIndex((o) => o.value === value);
  const onSeparate = separate !== undefined && value === separate;
  const shown = rest[Math.max(0, i)];
  const pill = (active: boolean) =>
    cn(
      "glass-btn flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium disabled:pointer-events-none disabled:opacity-50",
      // Glass, the same whether or not it is selected: the selection shows in the
      // text alone.
      active ? "text-foreground" : "text-muted-foreground",
    );
  return (
    <>
      <div className="cycle-wrap flex min-w-0 items-center gap-2 sm:hidden">
        {separate !== undefined && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(separate)}
            aria-pressed={onSeparate}
            className={pill(onSeparate)}
          >
            {options.find((o) => o.value === separate)?.label}
          </button>
        )}
        {shown && (
          <Popover open={hint && !menu} onOpenChange={(o) => !o && setHint(false)}>
            <PopoverAnchor asChild>
              <span className="inline-flex min-w-0">
                <Popover open={menu} onOpenChange={setMenu}>
                  <PopoverAnchor asChild>
                    <button
                      type="button"
                      disabled={disabled}
                      onPointerDown={menuOnTap ? undefined : startHold}
                      onPointerUp={endHold}
                      onPointerLeave={endHold}
                      onPointerCancel={endHold}
                      onContextMenu={(e) => e.preventDefault()}
                      onClick={() => {
                        if (menuOnTap) return setMenu((o) => !o);
                        if (held.current) {
                          held.current = false;
                          return;
                        }
                        hintOnce();
                        onChange(
                          i < 0 || onSeparate ? rest[0].value : rest[(i + 1) % rest.length].value,
                        );
                      }}
                      aria-label={
                        menuOnTap
                          ? `${shown.label}. Tap to choose.`
                          : `${shown.label}. Tap for the next, press and hold for all.`
                      }
                      className={cn(
                        pill(!onSeparate),
                        !onSeparate && shown.tone && `!bg-none ${shown.tone}`,
                        "select-none pr-3 [-webkit-touch-callout:none]",
                        phoneOnly && "min-w-0 shrink",
                      )}
                    >
                      <span className={cn("truncate", phoneOnly && "max-w-[8.5rem]")}>
                        {shown.label}
                      </span>
                      <ChevronsUpDown className="size-4 shrink-0 opacity-60" />
                    </button>
                  </PopoverAnchor>
                  <PopoverContent align="start" className="w-auto min-w-40 rounded-2xl p-1.5">
                    {rest.map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => {
                          onChange(o.value);
                          setMenu(false);
                        }}
                        className="flex w-full items-center justify-between gap-4 rounded-xl px-3 py-2 text-left text-sm hover:bg-muted"
                      >
                        {o.label}
                        {o.value === value && <Check className="size-4 text-primary" />}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
              </span>
            </PopoverAnchor>
            <PopoverContent
              side="top"
              align="start"
              sideOffset={10}
              onOpenAutoFocus={(e) => e.preventDefault()}
              className="pointer-events-none w-auto max-w-[14rem] rounded-2xl border-primary/40 bg-popover px-3 py-2 text-xs"
            >
              Press and hold to see all options
              <PopoverPrimitive.Arrow asChild>
                <svg width="14" height="8" viewBox="0 0 14 8" className="-mt-px">
                  <path d="M0 0 L7 7 L14 0 Z" className="fill-popover" />
                  <path d="M0.5 0 L7 6.5 L13.5 0" fill="none" className="stroke-primary/40" />
                </svg>
              </PopoverPrimitive.Arrow>
            </PopoverContent>
          </Popover>
        )}
        {shown && !menuOnTap && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              // The (i) is a switch: the bubble it opened, it closes.
              if (hint) setHint(false);
              else showHint();
            }}
            aria-label="How this works"
            className="cycle-info grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground"
          >
            <Info className="size-4" />
          </button>
        )}
      </div>
      <div className={cn("hidden", !phoneOnly && "sm:contents")}>
        <SegmentRow
          value={value}
          onChange={onChange}
          options={options}
          className={className}
          disabled={disabled}
          fill={fill}
        />
      </div>
    </>
  );
}

/**
 * The segment control every screen uses. On a phone it is a cycle pill — one
 * value, tap for the next — and from sm: up it is the row of segments.
 *
 * A clearable control stays a row everywhere: tapping the chosen segment again
 * unsets it, and a pill that only steps forward has no way back to blank.
 */
export function SegmentControl<T extends string>(props: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; tone?: string }[];
  className?: string;
  disabled?: boolean;
  clearable?: boolean;
  fill?: boolean;
  /** Keep the row of segments on a phone too, where a form wants every choice visible. */
  row?: boolean;
  /** On a phone a tap opens the list of choices rather than stepping to the next. */
  menuOnTap?: boolean;
}) {
  const { row, ...rest } = props;
  if (row || rest.clearable || rest.options.length < 2) return <SegmentRow {...rest} />;
  return <CyclePill {...rest} />;
}
