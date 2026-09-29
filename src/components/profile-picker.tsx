/**
 * "Who's collecting?" — the faces that have signed in on this device.
 *
 * A household passes one tablet around, and every one of them was typing a
 * handle from scratch before they could type a password. The faces come first
 * now, and the form does not appear until one of them is chosen or somebody
 * says they are not on the row.
 *
 * The picture is the person's own: whatever they set on their account, stored
 * when they last signed in here. A face is a shortcut to the name and never to
 * the account — the password is still asked for — and each one carries its own
 * way off the screen, because a name and a picture on a shared login page is
 * something the person it belongs to should be able to take back.
 */
import { UserPlus, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { initialsOf, type KnownProfile } from "@/lib/known-profiles";

export function ProfilePicker({
  faces,
  picked,
  onPick,
  onAnother,
  onForget,
}: {
  faces: KnownProfile[];
  /** The handle currently chosen, so the tile can say so. */
  picked?: string;
  onPick: (p: KnownProfile) => void;
  onAnother: () => void;
  onForget: (handle: string) => void;
}) {
  if (faces.length === 0) return null;

  return (
    <section>
      <h2 className="mb-4 text-center text-xs uppercase tracking-wider text-muted-foreground">
        Who&apos;s collecting?
      </h2>
      <div className="flex flex-wrap items-start justify-center gap-4">
        {faces.map((f) => (
          <div key={f.handle} className="group relative w-16">
            <button
              type="button"
              onClick={() => onPick(f)}
              aria-pressed={picked?.toLowerCase() === f.handle.toLowerCase()}
              className="flex w-full flex-col items-center gap-1.5"
            >
              <Face
                face={f}
                selected={picked?.toLowerCase() === f.handle.toLowerCase()}
                className="group-hover:border-border"
              />
              <span className="w-full truncate text-center text-xs text-muted-foreground">
                {f.name.split(/\s+/)[0]}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onForget(f.handle)}
              title={`Forget ${f.name} on this device`}
              aria-label={`Forget ${f.name} on this device`}
              className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full border border-border bg-background text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
            >
              <X className="size-3" />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={onAnother}
          className="flex w-16 flex-col items-center gap-1.5"
        >
          <span className="grid size-16 place-items-center rounded-full border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground">
            <UserPlus className="size-5" />
          </span>
          <span className="w-full truncate text-center text-xs text-muted-foreground">
            Someone else
          </span>
        </button>
      </div>
    </section>
  );
}

/** The circle itself, reused above the password box once a face is chosen. */
export function Face({
  face,
  selected = false,
  className,
}: {
  face: KnownProfile;
  selected?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "grid size-16 place-items-center overflow-hidden rounded-full border-2 bg-muted text-lg font-semibold text-muted-foreground transition-all",
        selected ? "border-primary ring-2 ring-primary/30" : "border-transparent",
        className,
      )}
    >
      {face.avatar ? (
        <img
          src={face.avatar}
          alt=""
          className="size-full object-cover"
          onError={(e) => {
            // A picture replaced since is not a reason to lose the face: it
            // falls back to the initials underneath.
            e.currentTarget.style.display = "none";
          }}
        />
      ) : (
        initialsOf(face.name)
      )}
    </span>
  );
}
