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
      variant="outline"
      onClick={onClick}
      disabled={disabled}
      title={title ?? "Update status"}
      className={cn(
        // Styled like the Pay button beside it: glass with its plain edge, the text in the theme colour.
        "gap-1.5 !border-primary/40 !text-primary hover:!bg-primary/10",
        className,
      )}
    >
      <CheckCircle2 className={cn("text-primary", size === "sm" ? "size-3.5" : "size-4")} />
      {label}
    </Button>
  );
}
