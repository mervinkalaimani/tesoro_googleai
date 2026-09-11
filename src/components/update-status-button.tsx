import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Moving a car — or a whole batch — to its next status is one idea, so it is one
 * button everywhere it appears.
 *
 * It used to be three: "Mark shipped" on a pre-order, "Reconcile delivery" on a
 * shipment, "Mark <next>" in the details drawer. Three labels, three colours,
 * three shapes, for the same question — where is this car now? They are all this
 * button now; only what it opens differs.
 */
export function UpdateStatusButton({
  onClick,
  title,
  label = "Update status",
  className,
  disabled,
  size = "sm",
}: {
  onClick: () => void;
  title?: string;
  label?: string;
  className?: string;
  disabled?: boolean;
  /**
   * Matches whatever it is standing next to. It is `sm` in the dense rows it
   * was written for, but beside a full-size Edit button a short one reads as a
   * different kind of control rather than the other half of a pair.
   */
  size?: "sm" | "default";
}) {
  return (
    <Button
      type="button"
      size={size}
      onClick={onClick}
      disabled={disabled}
      title={title ?? "Update status"}
      className={cn(
        // The accent, not a literal green: it is the theme's second fill, it
        // moves with the accent colour in Settings, and it stays distinct from
        // the primary buttons it sits beside. The green was a colour from
        // nowhere — it belonged to no palette and changed with no setting.
        "gap-1.5 bg-accent text-accent-foreground hover:bg-accent/85",
        className,
      )}
    >
      <CheckCircle2 className={size === "sm" ? "size-3.5" : "size-4"} />
      {label}
    </Button>
  );
}
