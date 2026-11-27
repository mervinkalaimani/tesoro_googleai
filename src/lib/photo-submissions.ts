import { supabase } from "@/integrations/supabase/client";
import { uploadCarPhoto } from "@/lib/car-photos";

/**
 * Photographs of castings that have none, sent by anyone and approved by an admin.
 *
 * A casting with no picture shows a polaroid asking for one. Whoever has the car sends a photograph;
 * it waits in `tesoro_catalog_photo_submissions` until an admin or the owner approves it, and only
 * then does it become the catalogue entry's picture — with the sender's name on it — and so the
 * picture of every collection that holds the casting and has none of its own.
 *
 * The table is behind the migration 20261127100000. Until it is applied every call here fails
 * quietly (a read says "nothing waiting", a send says why it cannot) rather than breaking the page
 * it is used on.
 */

export type PhotoSubmission = {
  id: string;
  car_id: string;
  image_url: string;
  submitted_by: string;
  submitted_by_name: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
};

const TABLE = "tesoro_catalog_photo_submissions";

// The generated Supabase types predate the table, so it is addressed untyped.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = () => (supabase as any).from(TABLE);

/** The table is not there yet: the migration has not been applied. */
const missingTable = (e: { code?: string; message?: string } | null | undefined) =>
  !!e &&
  (e.code === "42P01" ||
    e.code === "PGRST205" ||
    /does not exist|schema cache/i.test(e.message ?? ""));

export type SubmitResult = { ok: true } | { error: string };

/** Sends a photograph of a casting for approval. */
export async function submitCataloguePhoto(
  carId: string,
  file: File,
  senderName: string,
): Promise<SubmitResult> {
  const id = (carId || "").trim();
  if (!id) return { error: "This car has no catalogue entry to add a photo to." };

  const uploaded = await uploadCarPhoto(file);
  if ("error" in uploaded) return { error: uploaded.error };

  const { error } = await table().insert({
    car_id: id,
    image_url: uploaded.url,
    submitted_by_name: senderName,
  });
  if (error) {
    if (error.code === "23505") {
      return { error: "You have already sent a photo of this one. It is waiting for approval." };
    }
    if (missingTable(error)) {
      return { error: "Sending photos is not switched on yet. Try again once the update is live." };
    }
    return { error: error.message || "The photo could not be sent." };
  }
  return { ok: true };
}

/** Whether this signed-in person already has a photograph of the casting waiting. */
export async function hasPendingPhoto(carId: string, uid: string | undefined): Promise<boolean> {
  const id = (carId || "").trim();
  if (!id || !uid) return false;
  const { data, error } = await table()
    .select("id")
    .eq("submitted_by", uid)
    .eq("status", "pending")
    .ilike("car_id", id)
    .limit(1);
  if (error) return false;
  return Array.isArray(data) && data.length > 0;
}

/** Everything waiting for a decision, oldest first. An admin sees all of it; anyone else just their own. */
export async function listPendingPhotos(): Promise<PhotoSubmission[]> {
  const { data, error } = await table()
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data ?? []) as PhotoSubmission[];
}

/** Approves or rejects one. Only an admin or the owner can: the database checks, not this. */
export async function reviewPhoto(
  submission: PhotoSubmission,
  approve: boolean,
): Promise<SubmitResult> {
  const { error } = await (supabase as any).rpc("tesoro_review_photo_submission", {
    _id: submission.id,
    _approve: approve,
  });
  if (error) {
    return { error: missingTable(error) ? "Photo review is not switched on yet." : error.message };
  }
  if (approve && typeof window !== "undefined") {
    // Show it in this session straight away: the cars of this casting that have no photo of their
    // own take it, as they do for any photo that reaches the catalogue. Everybody else gets it the
    // next time their catalogue refreshes.
    window.dispatchEvent(
      new CustomEvent("tesoro:image-synced", {
        detail: {
          catalogId: submission.car_id,
          imageUrl: submission.image_url,
          source: "approved_submission",
        },
      }),
    );
  }
  return { ok: true };
}
