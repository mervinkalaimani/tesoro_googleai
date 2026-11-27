import { type ReactNode, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { findCarImage } from "@/lib/car-image";
import { NoPhotoImage } from "@/components/no-photo";
import { transformImageUrl } from "@/lib/image-transform";
import type { Diecast } from "@/lib/types";

/**
 * Card thumbnail for a car. Prefers the saved image URL, otherwise falls back to
 * the lookup used by the details drawer.
 */
export function CarThumb({
  car,
  className = "",
  fallback,
}: {
  car: Diecast;
  className?: string;
  /**
   * What to show where there is no photograph, in place of the small car
   * outline. A tall window wants something that fills it — an outline floating
   * in the middle of a blister tile reads as a tile that failed to load.
   */
  fallback?: ReactNode;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // A phone on a patchy connection fails a request now and then. One failed image used to blank
  // the tile for good; it is tried again twice, a moment apart, before the placeholder is shown.
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSrc(null);
    setRetry(0);

    if (car.imageUrl) {
      setSrc(transformImageUrl(car.imageUrl, "card"));
      setLoading(false);
      return;
    }

    findCarImage(car, car.brand || "", car.make || "")
      .then((url) => {
        if (cancelled) return;
        if (url) setSrc(url);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [car.id, car.imageUrl, car.model, car.variant, car.colour, car.brand, car.make]);

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden bg-muted/40 ${className}`}
    >
      {loading ? (
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      ) : src ? (
        <img
          key={retry}
          src={src}
          alt={car.name || `${car.make} ${car.model}`}
          loading="lazy"
          decoding="async"
          className="size-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
          onError={() => {
            if (retry >= 2) return setSrc(null);
            const n = retry + 1;
            window.setTimeout(() => {
              setRetry(n);
              setSrc((cur) => (cur ? `${cur}${cur.includes("?") ? "&" : "?"}retry=${n}` : cur));
            }, 1200 * n);
          }}
        />
      ) : (
        (fallback ?? <NoPhotoImage />)
      )}
    </div>
  );
}
