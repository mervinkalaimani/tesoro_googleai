import { cn } from "@/lib/utils";
import { usePersona, type Persona } from "@/lib/persona";

const ALL: { value: Persona; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "buyer", label: "Buyer" },
  { value: "seller", label: "Seller" },
];

/** The three hats, as a segmented control. Admin is offered only to admins. */
export function PersonaPicker({ className }: { className?: string }) {
  const { persona, setPersona, canAdmin } = usePersona();
  return (
    <div className={className}>
      <p className="mb-1 text-xs font-medium text-muted-foreground">Persona</p>
      <div role="radiogroup" aria-label="Persona" className="flex rounded-lg bg-muted/60 p-0.5">
        {ALL.filter((o) => o.value !== "admin" || canAdmin).map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={persona === o.value}
            onClick={() => setPersona(o.value)}
            className={cn(
              "flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
              persona === o.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
