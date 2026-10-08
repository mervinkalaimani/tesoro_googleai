import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  Camera,
  Search,
  AlertCircle,
  Sparkles,
  Upload,
  RefreshCw,
  ArrowRight,
  Check,
  Tag,
  Layers,
  Car as CarIcon,
  SwitchCamera,
  Loader2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCars } from "@/lib/cars-store";
import { useCarDrawer } from "@/components/car-details-drawer";
import { useApp } from "@/lib/store";
import { CarThumb } from "@/components/car-thumb";
import { ACCEPT_ATTR, imageToBase64 } from "@/lib/car-photos";
import { authHeader } from "@/lib/api-auth";
import { useAuth } from "@/lib/auth-store";
import { scansLeft } from "@/lib/tiers";
import type { Diecast } from "@/lib/types";
import { toast } from "sonner";

interface ImageSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export type ExtractedAttributes = {
  make?: string;
  model?: string;
  variant?: string;
  year?: string;
  colour?: string;
  type?: string;
  series?: string;
  subSeries?: string;
  carNumber?: string;
  brand?: string;
  assortment?: string;
  size?: string;
};

interface ScoredCar {
  car: Diecast;
  score: number;
  matchedAttributes: { label: string; value: string }[];
  exactCount: number;
}

const isExactMatch = (a: Diecast, b: Diecast) => {
  const norm = (s?: string | number | null) =>
    String(s ?? "")
      .trim()
      .toLowerCase();
  return (
    norm(a.make) === norm(b.make) &&
    norm(a.model) === norm(b.model) &&
    norm(a.variant) === norm(b.variant) &&
    norm(a.year) === norm(b.year) &&
    norm(a.colour) === norm(b.colour) &&
    norm(a.brand) === norm(b.brand) &&
    norm(a.series) === norm(b.series) &&
    norm(a.subSeries) === norm(b.subSeries) &&
    norm(a.carNumber) === norm(b.carNumber) &&
    norm(a.assortment) === norm(b.assortment) &&
    norm(a.type) === norm(b.type) &&
    norm(a.size) === norm(b.size)
  );
};

export function ImageSearchDialog({ open, onOpenChange }: ImageSearchDialogProps) {
  const cars = useCars();
  const { open: openCar } = useCarDrawer();
  const { profile, isGuest, reloadProfile } = useAuth();
  // A scan here costs the same credit a card scan costs, because it is the
  // same route and the same key. Null is no ceiling; 0 is none left.
  const left = isGuest ? null : scansLeft(profile);
  const spent = left === 0;
  const { setQuery } = useApp();

  // Image search states
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<"environment" | "user">("environment");
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [attributes, setAttributes] = useState<ExtractedAttributes | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Video & Stream refs for live camera photo capture
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [cameraLoading, setCameraLoading] = useState(false);

  // Stop camera stream safely
  const stopLiveCamera = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setCameraLoading(false);
  }, []);

  // Helper to connect a MediaStream to the video DOM element and start playing
  const attachStreamToVideo = useCallback((stream: MediaStream) => {
    const video = videoRef.current;
    if (!video) return;
    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }
    video.onloadedmetadata = () => {
      video.play().catch((err) => console.warn("Video play error:", err));
      setCameraLoading(false);
    };
    video.play().catch(() => {});
  }, []);

  // Start live camera
  const startLiveCamera = useCallback(
    async (facing: "environment" | "user" = cameraFacing) => {
      stopLiveCamera();
      setAnalysisError(null);
      setCameraLoading(true);
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Camera not supported on this device or browser.");
        }
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: facing },
              width: { ideal: 1280 },
              height: { ideal: 960 },
            },
            audio: false,
          });
        } catch {
          // Fallback if specific constraint (like facingMode or exact resolution) fails
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }
        mediaStreamRef.current = stream;
        setIsCameraActive(true);
        // If the video element is already mounted, attach immediately
        if (videoRef.current) {
          attachStreamToVideo(stream);
        }
      } catch (err: unknown) {
        console.warn("Could not start live camera:", err);
        setIsCameraActive(false);
        setCameraLoading(false);
        setAnalysisError("Camera access was denied or is not available. Upload a photo instead.");
      }
    },
    [cameraFacing, stopLiveCamera, attachStreamToVideo],
  );

  /**
   * The camera is the screen, not a button on it.
   *
   * This opens looking through the lens: the thing somebody came here to do is
   * point it at a car, and a page asking which camera they would like first is
   * a page between them and that. It runs once per open — `tried` keeps a
   * denied permission from being asked for again on every render — and the
   * drop zone underneath is what is left when the answer is no.
   */
  const tried = useRef(false);
  useEffect(() => {
    if (!open) {
      tried.current = false;
      return;
    }
    if (tried.current || previewUrl || isCameraActive || spent) return;
    tried.current = true;
    void startLiveCamera("environment");
  }, [open, previewUrl, isCameraActive, spent, startLiveCamera]);

  // Keep stream attached when video element mounts or becomes active
  useEffect(() => {
    if (isCameraActive && mediaStreamRef.current && videoRef.current) {
      attachStreamToVideo(mediaStreamRef.current);
    }
  }, [isCameraActive, attachStreamToVideo]);

  // Clean up when dialog closes or opens
  useEffect(() => {
    if (!open) {
      stopLiveCamera();
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(null);
      setAttributes(null);
      setAnalyzing(false);
      setAnalysisError(null);
      setIsCameraActive(false);
    }
  }, [open, stopLiveCamera, previewUrl]);

  // Handle image analysis with /api/scan-car
  const analyzeImageFile = async (file: File) => {
    if (spent) {
      setAnalysisError("That is all your scans for this month. The count resets on the 1st.");
      return;
    }
    stopLiveCamera();
    setAnalyzing(true);
    setAnalysisError(null);
    setAttributes(null);

    // Create preview
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    try {
      const imagePayload = await imageToBase64(file);
      // Who is asking, same as the card scanner sends. The route refuses a
      // request without it — the model call is spent on somebody's key — and
      // the answer came back as "Sign in to scan a card" to a signed-in person.
      const res = await fetch("/api/scan-car", {
        method: "POST",
        headers: { "content-type": "application/json", ...(await authHeader()) },
        body: JSON.stringify(imagePayload),
      });

      const data = (await res.json().catch(() => null)) as {
        fields?: ExtractedAttributes;
        error?: string;
      } | null;

      if (!res.ok || !data?.fields) {
        const msg = data?.error || "Could not analyze the car in this image.";
        setAnalysisError(msg);
        return;
      }

      const rawFields = data.fields;
      // Filter out empty keys
      const cleanAttrs: ExtractedAttributes = {};
      let hasAny = false;
      for (const [k, v] of Object.entries(rawFields)) {
        if (typeof v === "string" && v.trim() && !/^(n\/?a|unknown|none|-)$/i.test(v.trim())) {
          cleanAttrs[k as keyof ExtractedAttributes] = v.trim();
          hasAny = true;
        }
      }

      if (!hasAny) {
        setAnalysisError(
          "No specific die-cast attributes could be recognized. Try taking a closer, clearer picture.",
        );
        return;
      }

      setAttributes(cleanAttrs);
      // The allowance is on the profile, and one of it has just gone.
      void reloadProfile();
      toast.success("Attributes extracted from image!");
    } catch (err: unknown) {
      console.error("Image analysis error:", err);
      setAnalysisError("Failed to connect to the image analysis service.");
    } finally {
      setAnalyzing(false);
    }
  };

  // Capture current frame from live camera video
  const captureLivePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `car-snap-${Date.now()}.jpg`, { type: "image/jpeg" });
        analyzeImageFile(file);
      },
      "image/jpeg",
      0.9,
    );
  };

  // Handle file picker selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      analyzeImageFile(file);
    }
    // reset input so same file can be picked again
    e.target.value = "";
  };

  // Handle drag & drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      analyzeImageFile(file);
    }
  };

  // Handle clipboard paste
  useEffect(() => {
    if (!open) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            analyzeImageFile(file);
            break;
          }
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [open]);

  // Calculate matching cars against extracted attributes
  const matchedCars = useMemo<ScoredCar[]>(() => {
    if (!attributes) return [];

    const norm = (s?: string | number | null) =>
      String(s ?? "")
        .trim()
        .toLowerCase();

    const attrMake = norm(attributes.make);
    const attrModel = norm(attributes.model);
    const attrVariant = norm(attributes.variant);
    const attrColour = norm(attributes.colour);
    const attrBrand = norm(attributes.brand);
    const attrSeries = norm(attributes.series);
    const attrCarNumber = norm(attributes.carNumber);
    const attrYear = norm(attributes.year);
    const attrType = norm(attributes.type);

    const scored: ScoredCar[] = [];

    for (const car of cars) {
      let score = 0;
      const matchedAttrs: { label: string; value: string }[] = [];

      const carMake = norm(car.make);
      const carModel = norm(car.model);
      const carName = norm(car.name);
      const carVariant = norm(car.variant);
      const carColour = norm(car.colour);
      const carBrand = norm(car.brand);
      const carSeries = norm(car.series);
      const carNum = norm(car.carNumber);
      const carYear = norm(car.year);
      const carType = norm(car.type);

      // 1. Model match (highest weight)
      if (attrModel) {
        if (carModel === attrModel || carName === attrModel) {
          score += 45;
          matchedAttrs.push({ label: "Model", value: car.model || car.name });
        } else if (carModel.includes(attrModel) || attrModel.includes(carModel)) {
          score += 30;
          matchedAttrs.push({ label: "Model", value: car.model || car.name });
        } else {
          // Word-by-word match
          const words = attrModel.split(/\s+/).filter((w) => w.length > 2);
          const matchedWords = words.filter((w) => carModel.includes(w) || carName.includes(w));
          if (matchedWords.length > 0) {
            score += 15 * matchedWords.length;
            matchedAttrs.push({ label: "Model", value: car.model });
          }
        }
      }

      // 2. Make match
      if (attrMake && carMake) {
        if (carMake === attrMake) {
          score += 30;
          matchedAttrs.push({ label: "Make", value: car.make });
        } else if (carMake.includes(attrMake) || attrMake.includes(carMake)) {
          score += 20;
          matchedAttrs.push({ label: "Make", value: car.make });
        }
      }

      // 3. Brand match
      if (attrBrand && carBrand) {
        if (carBrand === attrBrand) {
          score += 20;
          matchedAttrs.push({ label: "Brand", value: car.brand });
        } else if (carBrand.includes(attrBrand) || attrBrand.includes(carBrand)) {
          score += 12;
          matchedAttrs.push({ label: "Brand", value: car.brand });
        }
      }

      // 4. Colour match
      if (attrColour && carColour) {
        if (carColour === attrColour) {
          score += 20;
          matchedAttrs.push({ label: "Colour", value: car.colour });
        } else if (carColour.includes(attrColour) || attrColour.includes(carColour)) {
          score += 15;
          matchedAttrs.push({ label: "Colour", value: car.colour });
        }
      }

      // 5. Variant match
      if (attrVariant && carVariant) {
        if (carVariant === attrVariant || carVariant.includes(attrVariant)) {
          score += 20;
          matchedAttrs.push({ label: "Variant", value: car.variant });
        }
      }

      // 6. Series match
      if (attrSeries && carSeries) {
        if (carSeries === attrSeries || carSeries.includes(attrSeries)) {
          score += 18;
          matchedAttrs.push({ label: "Series", value: car.series });
        }
      }

      // 7. Car Number match
      if (attrCarNumber && carNum) {
        if (carNum === attrCarNumber) {
          score += 25;
          matchedAttrs.push({ label: "#", value: car.carNumber });
        }
      }

      // 8. Year match
      if (attrYear && carYear && carYear === attrYear) {
        score += 12;
        matchedAttrs.push({ label: "Year", value: String(car.year) });
      }

      // 9. Type match
      if (attrType && carType && (carType === attrType || carType.includes(attrType))) {
        score += 10;
      }

      if (score > 0) {
        // Calculate exact duplicates count
        const exactCount = cars.filter((other) => isExactMatch(car, other)).length;
        scored.push({
          car,
          score,
          matchedAttributes: matchedAttrs,
          exactCount,
        });
      }
    }

    // Sort descending by match score
    scored.sort((a, b) => b.score - a.score);
    return scored;
  }, [attributes, cars]);

  // Apply search query from extracted attributes
  const applyAttributesToSearch = () => {
    if (!attributes) return;
    const parts: string[] = [];
    if (attributes.make) parts.push(`make = ${attributes.make.toLowerCase()}`);
    if (attributes.model) parts.push(`model = ${attributes.model.toLowerCase()}`);
    if (attributes.brand) parts.push(`brand = ${attributes.brand.toLowerCase()}`);

    const queryStr =
      parts.length > 0 ? parts.join(", ") : attributes.model || attributes.make || "";
    setQuery(queryStr);
    onOpenChange(false);
    toast.info(`Search filter applied: ${queryStr}`);
  };

  // Reset image and try again
  const handleResetImage = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setAttributes(null);
    setAnalysisError(null);
    stopLiveCamera();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex w-full flex-col overflow-hidden bg-background p-0 sm:max-h-[90vh] sm:max-w-xl max-sm:fixed max-sm:inset-0 max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:max-w-full max-sm:rounded-none">
        {/* Header */}
        {/* Left aligned at every width: a dialog header centres itself by
            default, and a sentence of description centred under a title it is
            wider than reads as a poster rather than as a caption. */}
        <DialogHeader className="shrink-0 space-y-0 border-b border-border/70 p-4 pb-3 text-left sm:text-left">
          <div className="flex items-start gap-2.5">
            {/* shrink-0, or the tile is squeezed to an oval by the words
                beside it the moment they wrap. */}
            <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <Camera className="size-[18px]" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="flex flex-wrap items-center gap-2 text-base font-semibold">
                Scan to Search
                {/* Pushed to the far end: what it is called is a label on the
                    feature, not the next word of the title. */}
                <span className="ml-auto flex shrink-0 items-center gap-2">
                  {left !== null && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {left} left
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
                    <Sparkles className="size-3" />
                    VIIV Scan
                  </span>
                </span>
              </DialogTitle>
              <DialogDescription className="mt-1 text-left text-xs text-muted-foreground">
                Scan or upload an image to identify the car and see if you have it in your
                collection.
              </DialogDescription>
              {left !== null && (
                <p className="mt-1 text-left text-xs text-muted-foreground">
                  {spent
                    ? "No scans left this month. The count resets on the 1st."
                    : "This will use one of your monthly VIIV Scan credits."}
                </p>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Content Area */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
            {/* Hidden file input for file picker & camera fallback */}
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_ATTR}
              className="hidden"
              onChange={handleFileChange}
            />

            {/* State 1: No Image Picked & No Live Camera */}
            {!previewUrl && !isCameraActive && (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-colors max-sm:min-h-0 max-sm:flex-1 ${
                  isDragging
                    ? "border-primary bg-primary/5"
                    : "border-border/80 hover:border-primary/50 bg-muted/20"
                }`}
              >
                <div className="size-14 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-3">
                  <Camera className="size-7" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">
                  {spent ? "No scans left this month" : "Photograph or upload a die-cast car"}
                </h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm leading-relaxed">
                  {spent
                    ? "The count resets on the 1st, and a bigger plan lifts it. Until then the search box and the catalogue are still there."
                    : "Take a photo of a blister card, packaging box, or loose model car. We'll extract its make, model, brand, colour, and series to find matches in your collection."}
                </p>

                <div className="flex flex-wrap items-center justify-center gap-2.5 mt-5">
                  {!spent && (
                    <Button
                      type="button"
                      onClick={() => startLiveCamera("environment")}
                      className="gap-1.5 h-9"
                    >
                      <Camera className="size-4" />
                      Open camera
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    disabled={spent}
                    onClick={() => fileInputRef.current?.click()}
                    className="gap-1.5 h-9"
                  >
                    <Upload className="size-4" />
                    Upload image
                  </Button>
                </div>

                <p className="text-[11px] text-muted-foreground/80 mt-4">
                  Or drag and drop an image here, or paste from clipboard (Ctrl+V)
                </p>

                {analysisError && (
                  <div className="mt-4 p-3 rounded-lg bg-destructive/10 text-destructive text-xs flex items-center gap-2 text-left w-full max-w-md">
                    <AlertCircle className="size-4 shrink-0" />
                    <span>{analysisError}</span>
                  </div>
                )}
              </div>
            )}

            {/* State 2: Live Camera Viewfinder */}
            {!previewUrl && isCameraActive && (
              <div className="flex min-h-0 flex-1 flex-col gap-3">
                <div className="relative flex items-center justify-center overflow-hidden rounded-xl bg-black max-sm:min-h-0 max-sm:flex-1 sm:aspect-[4/3]">
                  <video
                    ref={(el) => {
                      videoRef.current = el;
                      if (el && mediaStreamRef.current) {
                        attachStreamToVideo(mediaStreamRef.current);
                      }
                    }}
                    autoPlay
                    playsInline
                    muted
                    onLoadedMetadata={(e) => {
                      (e.target as HTMLVideoElement).play().catch(() => {});
                      setCameraLoading(false);
                    }}
                    onPlay={() => setCameraLoading(false)}
                    className="size-full object-cover"
                  />

                  {cameraLoading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 z-0 text-white">
                      <Loader2 className="size-8 animate-spin text-primary" />
                      <span className="text-xs font-medium">Starting camera…</span>
                    </div>
                  )}

                  {/* Only the camera switch sits on the picture. The
                        shutter is under it, where a thumb is, and where it
                        cannot cover the car being framed. */}
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className="absolute right-3 top-3 z-10 size-10 rounded-full bg-black/60 text-white hover:bg-black/80"
                    onClick={() => {
                      const nextFacing = cameraFacing === "environment" ? "user" : "environment";
                      setCameraFacing(nextFacing);
                      startLiveCamera(nextFacing);
                    }}
                    title="Switch camera"
                  >
                    <SwitchCamera className="size-4.5" />
                  </Button>
                </div>

                <div className="flex shrink-0 flex-col items-center gap-2 pb-1">
                  <button
                    type="button"
                    onClick={captureLivePhoto}
                    className="size-16 rounded-full border-4 border-white bg-primary shadow-lg transition-transform active:scale-95"
                    title="Take the photo"
                    aria-label="Take the photo"
                  >
                    <span className="mx-auto block size-11 rounded-full bg-white/90" />
                  </button>
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Upload an image instead
                  </Button>
                </div>
              </div>
            )}

            {/* State 3: Image Captured / Uploaded */}
            {previewUrl && (
              <div className="space-y-4">
                {/* Image Preview & Scanning Indicator */}
                <div className="relative rounded-xl overflow-hidden bg-muted/40 border border-border/70 flex flex-col md:flex-row gap-4 p-3 items-center">
                  <div className="relative size-28 sm:size-32 rounded-lg overflow-hidden shrink-0 border border-border bg-black/5 flex items-center justify-center">
                    <img
                      src={previewUrl}
                      alt="Captured die-cast"
                      className="size-full object-contain"
                    />
                    {analyzing && (
                      <div className="absolute inset-0 bg-primary/20 backdrop-blur-[1px] flex flex-col items-center justify-center text-primary">
                        <RefreshCw className="size-6 animate-spin mb-1" />
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-white bg-black/70 px-1.5 py-0.5 rounded">
                          Analyzing...
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold">Analyzed Image</span>
                        {analyzing ? (
                          <Badge variant="outline" className="text-[10px] animate-pulse">
                            Extracting attributes...
                          </Badge>
                        ) : attributes ? (
                          <Badge
                            variant="secondary"
                            className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          >
                            Attributes Ready
                          </Badge>
                        ) : null}
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleResetImage}
                        className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
                      >
                        <RefreshCw className="size-3" />
                        New Photo
                      </Button>
                    </div>

                    {analyzing ? (
                      <div className="space-y-1.5 text-xs text-muted-foreground">
                        <p className="flex items-center gap-1.5 text-foreground font-medium">
                          <Sparkles className="size-3.5 text-primary animate-spin" />
                          Identifying the casting
                        </p>
                        <p className="text-[11px]">
                          Reading make, model, variant, series, colour, and collector numbers...
                        </p>
                      </div>
                    ) : analysisError ? (
                      <div className="text-xs text-destructive flex items-start gap-1.5 bg-destructive/10 p-2 rounded">
                        <AlertCircle className="size-4 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium">Analysis couldn't complete</p>
                          <p className="text-[11px] opacity-90">{analysisError}</p>
                        </div>
                      </div>
                    ) : attributes ? (
                      <div className="text-xs text-muted-foreground">
                        <p className="text-[11px]">
                          We identified the vehicle below. Matches from your collection are ranked
                          by similarity.
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* Extracted Attributes Chips */}
                {attributes && (
                  <div className="rounded-xl border border-border/70 bg-card p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Tag className="size-3.5 text-primary" />
                        Extracted Attributes
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={applyAttributesToSearch}
                        className="h-6.5 text-[11px] gap-1 px-2"
                      >
                        <Search className="size-3" />
                        Filter Collection View
                      </Button>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {attributes.make && (
                        <Badge variant="secondary" className="text-xs gap-1 py-1 px-2.5">
                          <span className="text-[10px] text-muted-foreground uppercase">Make:</span>
                          <span className="font-medium">{attributes.make}</span>
                        </Badge>
                      )}
                      {attributes.model && (
                        <Badge
                          variant="secondary"
                          className="text-xs gap-1 py-1 px-2.5 bg-primary/10 text-primary border-primary/20"
                        >
                          <span className="text-[10px] text-primary/70 uppercase">Model:</span>
                          <span className="font-semibold">{attributes.model}</span>
                        </Badge>
                      )}
                      {attributes.variant && (
                        <Badge variant="secondary" className="text-xs gap-1 py-1 px-2.5">
                          <span className="text-[10px] text-muted-foreground uppercase">
                            Variant:
                          </span>
                          <span>{attributes.variant}</span>
                        </Badge>
                      )}
                      {attributes.colour && (
                        <Badge variant="secondary" className="text-xs gap-1 py-1 px-2.5">
                          <span className="text-[10px] text-muted-foreground uppercase">
                            Colour:
                          </span>
                          <span>{attributes.colour}</span>
                        </Badge>
                      )}
                      {attributes.brand && (
                        <Badge variant="secondary" className="text-xs gap-1 py-1 px-2.5">
                          <span className="text-[10px] text-muted-foreground uppercase">
                            Brand:
                          </span>
                          <span>{attributes.brand}</span>
                        </Badge>
                      )}
                      {attributes.series && (
                        <Badge variant="secondary" className="text-xs gap-1 py-1 px-2.5">
                          <span className="text-[10px] text-muted-foreground uppercase">
                            Series:
                          </span>
                          <span>{attributes.series}</span>
                        </Badge>
                      )}
                      {attributes.year && (
                        <Badge variant="secondary" className="text-xs gap-1 py-1 px-2.5">
                          <span className="text-[10px] text-muted-foreground uppercase">Year:</span>
                          <span>{attributes.year}</span>
                        </Badge>
                      )}
                      {attributes.carNumber && (
                        <Badge variant="secondary" className="text-xs gap-1 py-1 px-2.5">
                          <span className="text-[10px] text-muted-foreground uppercase">#:</span>
                          <span>{attributes.carNumber}</span>
                        </Badge>
                      )}
                      {attributes.assortment && (
                        <Badge variant="secondary" className="text-xs gap-1 py-1 px-2.5">
                          <span className="text-[10px] text-muted-foreground uppercase">Line:</span>
                          <span>{attributes.assortment}</span>
                        </Badge>
                      )}
                      {attributes.type && (
                        <Badge variant="secondary" className="text-xs gap-1 py-1 px-2.5">
                          <span className="text-[10px] text-muted-foreground uppercase">Type:</span>
                          <span>{attributes.type}</span>
                        </Badge>
                      )}
                    </div>
                  </div>
                )}

                {/* Matching Cars List */}
                {attributes && (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <CarIcon className="size-3.5 text-muted-foreground" />
                        Collection Matches ({matchedCars.length})
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {matchedCars.length === 1
                          ? "1 car matched"
                          : matchedCars.length > 1
                            ? "Click a car to open its details"
                            : "No matches in your collection"}
                      </span>
                    </div>

                    {matchedCars.length > 0 ? (
                      <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                        {matchedCars.map(({ car, score, matchedAttributes, exactCount }) => (
                          <div
                            key={car.id}
                            onClick={() => {
                              onOpenChange(false);
                              openCar(car);
                              toast.success(`Opened: ${car.name || car.model}`);
                            }}
                            className="group flex items-center gap-3 p-2.5 rounded-lg border border-border/70 hover:border-primary/60 hover:bg-muted/30 cursor-pointer transition-all active:scale-[0.99]"
                          >
                            <div className="size-14 rounded-md overflow-hidden bg-muted/50 shrink-0 border border-border/50">
                              <CarThumb car={car} className="size-full object-cover" />
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                                  {car.name || `${car.make} ${car.model}`}
                                </span>
                                {exactCount > 1 && (
                                  <span className="shrink-0 text-[10px] font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400 px-1.5 py-0.2 rounded">
                                    {exactCount}x
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                                {car.brand && <span>{car.brand}</span>}
                                {car.series && <span>· {car.series}</span>}
                                {car.year && <span>· {car.year}</span>}
                                {car.colour && <span>· {car.colour}</span>}
                              </div>

                              {/* Matched attribute tags */}
                              <div className="flex flex-wrap items-center gap-1 mt-1.5">
                                {matchedAttributes.slice(0, 4).map((m) => (
                                  <span
                                    key={m.label}
                                    className="inline-flex items-center gap-0.5 text-[9px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded"
                                  >
                                    <Check className="size-2.5" />
                                    {m.label}: {m.value}
                                  </span>
                                ))}
                                {matchedAttributes.length > 4 && (
                                  <span className="text-[9px] text-muted-foreground">
                                    +{matchedAttributes.length - 4} more
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="shrink-0 flex items-center gap-2">
                              <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                {car.id}
                              </span>
                              <ArrowRight className="size-4 text-muted-foreground/50 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-6 rounded-xl border border-dashed border-border/80 bg-muted/10 text-center space-y-2">
                        <CarIcon className="size-8 text-muted-foreground/50 mx-auto" />
                        <p className="text-xs font-medium text-foreground">
                          No matching cars in your current collection
                        </p>
                        <p className="text-[11px] text-muted-foreground max-w-xs mx-auto">
                          The identified model ({attributes.make} {attributes.model}) is not
                          currently logged in your collection.
                        </p>
                        <div className="pt-2 flex items-center justify-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="text-xs h-8"
                            onClick={applyAttributesToSearch}
                          >
                            Search anyway
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="text-xs h-8"
                            onClick={handleResetImage}
                          >
                            Scan another car
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
