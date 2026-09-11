"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

/** How far the sheet has to be pushed down before letting go dismisses it. */
const DISMISS_PX = 110;

/** Phone width. Matches the `sm:` breakpoint the layout below switches at. */
const isPhone = () => typeof window !== "undefined" && window.innerWidth < 640;

/**
 * Any scroller between the touch and the sheet that is not already at its top.
 * Without this the drag competes with reading a long dialog: every attempt to
 * scroll back up would start dragging the sheet away instead.
 */
function scrolledWithin(target: EventTarget | null, root: HTMLElement) {
  let el = target as HTMLElement | null;
  while (el) {
    if (el.scrollTop > 0) return true;
    if (el === root) break;
    el = el.parentElement;
  }
  return false;
}

/**
 * Push-down-to-close, on phones only.
 *
 * The sheet follows the finger so it is obvious what the gesture is doing, and
 * springs back if it was not pushed far enough. Dismissal goes through a real
 * Close button rather than an onOpenChange of its own, so every dialog closes by
 * the same route whether it was swiped, tapped or escaped.
 */
function useSheetDismiss() {
  const closeRef = React.useRef<HTMLButtonElement>(null);
  const [offset, setOffset] = React.useState(0);
  const startY = React.useRef<number | null>(null);
  const latest = React.useRef(0);

  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isPhone() || e.touches.length !== 1) return;
    if (scrolledWithin(e.target, e.currentTarget)) return;
    startY.current = e.touches[0].clientY;
  };

  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (startY.current === null) return;
    const dy = e.touches[0].clientY - startY.current;
    // Upward movement means they are scrolling, not dismissing: hand the
    // gesture back rather than fighting it.
    if (dy < 0 && latest.current === 0) {
      startY.current = null;
      return;
    }
    latest.current = Math.max(0, dy);
    setOffset(latest.current);
  };

  const onTouchEnd = () => {
    if (startY.current === null) return;
    startY.current = null;
    if (latest.current > DISMISS_PX) closeRef.current?.click();
    latest.current = 0;
    setOffset(0);
  };

  return {
    closeRef,
    dragging: offset > 0,
    handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd },
    style: offset > 0 ? { transform: `translateY(${offset}px)`, transition: "none" } : undefined,
  };
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => {
  const sheet = useSheetDismiss();

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        style={sheet.style}
        {...sheet.handlers}
        className={cn(
          "fixed z-50 grid gap-4 border bg-background shadow-lg duration-200",
          // Phone: a sheet that comes up from the bottom of the screen and can
          // be pushed back down. Every dialog behaves this way, so a modal is
          // one gesture to leave wherever you meet it.
          "inset-x-0 bottom-0 max-h-[92svh] w-full rounded-t-2xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))]",
          "max-sm:transition-transform",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
          // Tablet and up: the centred dialog it has always been.
          //
          // The default width is `sm:`-scoped because the centred layout is. A
          // caller that wants a wider dialog has to say `sm:max-w-4xl` and not
          // `max-w-4xl`: tailwind-merge only drops a class when the one
          // replacing it carries the same modifier, so an unprefixed width
          // survives the merge and then loses to this one inside the media
          // query. Several dialogs asked for 5xl that way and rendered at 32rem.
          "sm:inset-x-auto sm:bottom-auto sm:left-[50%] sm:top-[50%] sm:max-w-lg sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg sm:p-6",
          "sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95 sm:data-[state=closed]:slide-out-to-bottom-2 sm:data-[state=open]:slide-in-from-bottom-2",
          className,
        )}
        {...props}
      >
        {/* The affordance for the gesture: without it a sheet that can be
            pushed away looks exactly like one that cannot. */}
        <div
          aria-hidden
          className="mx-auto -mt-1 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/30 sm:hidden"
        />
        {children}
        {/* Desktop only. On a phone the sheet is pushed down or the page behind
            it tapped, and an X in the corner of a full-width sheet was a third
            way out sitting where a thumb rests. It is still in the tree when
            hidden — the swipe dismisses by clicking it, which works on a
            display:none button and keeps every close on one path. */}
        <DialogPrimitive.Close
          ref={sheet.closeRef}
          className="absolute right-4 top-4 cursor-pointer rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground max-sm:hidden"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
