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
}: {
  onClick: () => void;
  title?: string;
  label?: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      title={title ?? "Update status"}
      className={cn(
        // Literal green rather than a token: the primary colour is the app's red,
        // and this is the affirmative action on pages where something else is
        // already primary. Darker in light mode so white text stays readable.
        "gap-1.5 bg-emerald-600 text-white hover:bg-emerald-500 dark:bg-[#00c57d] dark:hover:bg-[#00b070]",
        className,
      )}
    >
      <CheckCircle2 className="size-3.5" />
      {label}
    </Button>
  );
}
