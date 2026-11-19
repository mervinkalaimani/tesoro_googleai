import { useNavigate, useRouterState } from "@tanstack/react-router";

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
  const navigate = useNavigate();
  const onSeller = useRouterState({ select: (r) => r.location.pathname.startsWith("/seller") });
  // Seller is its own site: picking it goes there, picking anything else comes back.
  const pick = (p: Persona) => {
    setPersona(p);
    if (p === "seller") void navigate({ to: "/seller" });
    else if (onSeller) void navigate({ to: "/" });
  };
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
            onClick={() => pick(o.value)}
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
