import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-store";
import { ACCEPT_ATTR } from "@/lib/car-photos";
import { resolveCatalogUserId } from "@/lib/catalog";
import { hasPendingPhoto, submitCataloguePhoto } from "@/lib/photo-submissions";
import { cn } from "@/lib/utils";

/** The polaroid every car with no picture shows: a car silhouette, asking for a photograph of it. */
export const NO_PHOTO_SRC = "/no-photo-polaroid.png";

/**
 * The polaroid as a plain picture. For tiles and rows, where the whole tile already opens the car:
 * the photograph is sent from the car's own page, so nothing here takes a click.
 */
export function NoPhotoImage({ className }: { className?: string }) {
  return (
    <img
      src={NO_PHOTO_SRC}
      alt="No photo yet"
      draggable={false}
      className={cn("size-full select-none object-contain", className)}
    />
  );
}

/**
 * The polaroid as the way to send a photograph. Tap it, pick a picture, and it goes to an admin for
 * approval; once approved it is the catalogue entry's picture, with the sender's name on it, for
 * everyone who has the car. Until then it says so, rather than inviting a second one.
 */
export function NoPhotoUpload({ carId, className }: { carId: string; className?: string }) {
  const { user } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  // Already sent one for this casting, on this or another device.
  useEffect(() => {
    let live = true;
    setSent(false);
    void hasPendingPhoto(carId, user?.id).then((p) => live && setSent(p));
    return () => {
      live = false;
    };
  }, [carId, user?.id]);

  const pick = () => {
    if (busy || sent) return;
    if (!user) {
      toast.error("Sign in to add a photo");
      return;
    }
    input.current?.click();
  };

  const onFile = async (file: File | undefined) => {
    if (!file || !user) return;
    setBusy(true);
    // The name on the tag: the first name the catalogue knows them by, else the front of their email.
    const known = resolveCatalogUserId(user.id);
    const name =
      known && known !== "System" ? known : (user.email ?? "").split("@")[0] || "A collector";
    const res = await submitCataloguePhoto(carId, file, name);
    setBusy(false);
    if ("error" in res) {
      toast.error("Could not send the photo", { description: res.error });
      return;
    }
    setSent(true);
    toast.success("Photo sent", { description: "An admin will look at it before it goes up." });
  };

  return (
    <div className={cn("relative size-full", className)}>
      <button
        type="button"
        onClick={pick}
        disabled={busy || sent}
        aria-label={sent ? "Your photo is waiting for approval" : "Add a photo of this car"}
        className="group relative block size-full cursor-pointer disabled:cursor-default"
      >
        <NoPhotoImage className="transition-transform duration-200 group-enabled:group-hover:scale-[1.02] group-enabled:group-active:scale-[0.98]" />
        {(busy || sent) && (
          <span className="absolute inset-x-0 bottom-[9%] mx-auto flex w-fit items-center gap-1.5 rounded-full bg-black/75 px-3 py-1.5 text-xs font-semibold text-white">
            {busy ? (
              <>
                <Loader2 className="size-3.5 animate-spin" /> Sending…
              </>
            ) : (
              "Sent · waiting for approval"
            )}
          </span>
        )}
      </button>
      <input
        ref={input}
        type="file"
        accept={ACCEPT_ATTR}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          void onFile(f);
        }}
      />
    </div>
  );
}
