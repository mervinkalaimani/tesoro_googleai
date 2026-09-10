import { useEffect, useState } from "react";
import { Car, Loader2 } from "lucide-react";
import { findCarImage } from "@/lib/car-image";
import type { Diecast } from "@/lib/types";

/**
 * Card thumbnail for a car. Prefers the saved image URL, otherwise falls back to
 * the lookup used by the details drawer.
 */
export function CarThumb({ car, className = "" }: { car: Diecast; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSrc(null);

    if (car.imageUrl) {
      setSrc(car.imageUrl);
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
    <div className={`relative flex items-center justify-center bg-muted/40 ${className}`}>
      {loading ? (
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      ) : src ? (
        <img
          src={src}
          alt={car.name || `${car.make} ${car.model}`}
          loading="lazy"
          className="size-full object-cover"
          onError={() => setSrc(null)}
        />
      ) : (
        <Car className="size-8 text-muted-foreground/40" />
      )}
    </div>
  );
}
