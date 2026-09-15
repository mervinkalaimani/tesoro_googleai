import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";
import {
  Camera,
  Search,
  X,
  AlertCircle,
  Sparkles,
  Upload,
  RefreshCw,
  QrCode,
  ArrowRight,
  Check,
  Tag,
  Layers,
  Car as CarIcon,
  SwitchCamera,
  Keyboard,
  SlidersHorizontal,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCars } from "@/lib/cars-store";
import { useCarDrawer } from "@/components/car-details-drawer";
import { useApp } from "@/lib/store";
import { CarThumb } from "@/components/car-thumb";
import { ACCEPT_ATTR, imageToBase64 } from "@/lib/car-photos";
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
  const { setQuery } = useApp();

  // Mode: "image" (default & primary) or "barcode" (secondary)
  const [activeTab, setActiveTab] = useState<"image" | "barcode">("image");

  // Image search states
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<"environment" | "user">("environment");
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [attributes, setAttributes] = useState<ExtractedAttributes | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Barcode / QR scanner states
  const [barcodeReady, setBarcodeReady] = useState(false);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");
  const barcodeScannerRef = useRef<Html5Qrcode | null>(null);
  const barcodeContainerId = "image-search-barcode-viewport";

  // Video & Stream refs for live camera photo capture
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
  }, []);

  // Start live camera
  const startLiveCamera = useCallback(
    async (facing: "environment" | "user" = cameraFacing) => {
      stopLiveCamera();
      setAnalysisError(null);
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Camera not supported on this device or browser.");
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1280 },
            height: { ideal: 960 },
          },
          audio: false,
        });
        mediaStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setIsCameraActive(true);
      } catch (err: unknown) {
        console.warn("Could not start live camera:", err);
        setIsCameraActive(false);
        setAnalysisError(
          "Camera access was denied or is not available. Please use 'Upload Photo' instead.",
        );
      }
    },
    [cameraFacing, stopLiveCamera],
  );

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
      setActiveTab("image");
      setManualCode("");

      // Clean barcode scanner if active
      if (barcodeScannerRef.current) {
        if (barcodeScannerRef.current.isScanning) {
          barcodeScannerRef.current
            .stop()
            .then(() => barcodeScannerRef.current?.clear())
            .catch(() => {});
        } else {
          barcodeScannerRef.current.clear();
        }
        barcodeScannerRef.current = null;
      }
      setBarcodeReady(false);
      setBarcodeError(null);
    }
  }, [open, stopLiveCamera, previewUrl]);

  // Clean up when tab changes
  useEffect(() => {
    if (activeTab === "image") {
      // Stop barcode scanner if switching to image
      if (barcodeScannerRef.current) {
        if (barcodeScannerRef.current.isScanning) {
          barcodeScannerRef.current
            .stop()
            .then(() => barcodeScannerRef.current?.clear())
            .catch(() => {});
        } else {
          barcodeScannerRef.current.clear();
        }
        barcodeScannerRef.current = null;
      }
      setBarcodeReady(false);
      setBarcodeError(null);
    } else {
      // Switched to barcode: stop image camera
      stopLiveCamera();
    }
  }, [activeTab, stopLiveCamera]);

  // Handle image analysis with /api/scan-car
  const analyzeImageFile = async (file: File) => {
    stopLiveCamera();
    setAnalyzing(true);
    setAnalysisError(null);
    setAttributes(null);

    // Create preview
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    try {
      const imagePayload = await imageToBase64(file);
      const res = await fetch("/api/scan-car", {
        method: "POST",
        headers: { "content-type": "application/json" },
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
    if (!open || activeTab !== "image") return;
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
  }, [open, activeTab]);

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

  // --- Barcode / QR Scanner Secondary Flow ---
  const handleDetectedCode = (rawCode: string) => {
    const code = rawCode.trim();
    if (!code) return;

    const norm = (s?: string) => (s || "").trim().toLowerCase();
    const target = code.toLowerCase();

    let match = cars.find(
      (c) =>
        norm(c.id) === target ||
        norm(c.carNumber) === target ||
        norm(c.trackingId) === target ||
        norm(c.shippingId) === target ||
        norm(c.orderId) === target,
    );

    if (!match) {
      match = cars.find(
        (c) =>
          norm(c.name) === target ||
          norm(c.model) === target ||
          norm(`${c.make} ${c.model}`) === target,
      );
    }

    if (match) {
      toast.success(`Found: ${match.name || match.model}`, {
        description: `ID: ${match.id} · ${match.brand || "Diecast"}`,
      });
      onOpenChange(false);
      openCar(match);
      return;
    }

    const partials = cars.filter(
      (c) =>
        norm(c.name).includes(target) ||
        norm(c.model).includes(target) ||
        norm(c.make).includes(target) ||
        norm(c.id).includes(target) ||
        norm(c.carNumber).includes(target),
    );

    if (partials.length === 1) {
      toast.success(`Found 1 car matching "${code}"`);
      onOpenChange(false);
      openCar(partials[0]);
    } else {
      setQuery(code);
      onOpenChange(false);
      toast.info(`Searching for "${code}"`, {
        description:
          partials.length > 0
            ? `${partials.length} cars matched`
            : "No exact matches in current collection",
      });
    }
  };

  // Setup barcode scanner when barcode tab is active
  useEffect(() => {
    if (!open || activeTab !== "barcode") return;

    let isMounted = true;
    const timeout = setTimeout(() => {
      if (!isMounted) return;

      const html5QrCode = new Html5Qrcode(barcodeContainerId);
      barcodeScannerRef.current = html5QrCode;

      html5QrCode
        .start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
          (decodedText) => {
            handleDetectedCode(decodedText);
          },
          () => {},
        )
        .then(() => {
          if (isMounted) {
            setBarcodeReady(true);
            setBarcodeError(null);
          }
        })
        .catch((err) => {
          console.warn("Barcode camera error:", err);
          if (isMounted) {
            setBarcodeError("Camera access not available. You can type or paste the code below.");
          }
        });
    }, 150);

    return () => {
      isMounted = false;
      clearTimeout(timeout);
      if (barcodeScannerRef.current) {
        if (barcodeScannerRef.current.isScanning) {
          barcodeScannerRef.current
            .stop()
            .then(() => barcodeScannerRef.current?.clear())
            .catch(() => {});
        } else {
          barcodeScannerRef.current.clear();
        }
        barcodeScannerRef.current = null;
      }
    };
  }, [open, activeTab]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] p-0 flex flex-col overflow-hidden bg-background">
        {/* Header */}
        <DialogHeader className="p-4 pb-3 border-b border-border/70 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="size-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                {activeTab === "image" ? (
                  <Camera className="size-4.5" />
                ) : (
                  <QrCode className="size-4.5" />
                )}
              </div>
              <div>
                <DialogTitle className="text-base font-semibold flex items-center gap-2">
                  {activeTab === "image" ? "Search by Image" : "Scan Barcode / QR"}
                  {activeTab === "image" && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
                      <Sparkles className="size-3" />
                      AI Attribute Search
                    </span>
                  )}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  {activeTab === "image"
                    ? "Capture or upload an image to identify car attributes and search your collection"
                    : "Scan printed barcode or QR code on box/card to jump directly to car"}
                </DialogDescription>
              </div>
            </div>

            {/* Mode Switcher */}
            <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-md">
              <Button
                type="button"
                variant={activeTab === "image" ? "default" : "ghost"}
                size="sm"
                className="h-7 text-xs px-2.5 gap-1.5"
                onClick={() => setActiveTab("image")}
              >
                <Camera className="size-3.5" />
                Image
              </Button>
              <Button
                type="button"
                variant={activeTab === "barcode" ? "default" : "ghost"}
                size="sm"
                className="h-7 text-xs px-2.5 gap-1.5"
                onClick={() => setActiveTab("barcode")}
              >
                <QrCode className="size-3.5" />
                QR / Barcode
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === "image" ? (
            <div className="p-4 space-y-4">
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
                  className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-colors ${
                    isDragging
                      ? "border-primary bg-primary/5"
                      : "border-border/80 hover:border-primary/50 bg-muted/20"
                  }`}
                >
                  <div className="size-14 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-3">
                    <Camera className="size-7" />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Photograph or upload a die-cast car
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm leading-relaxed">
                    Take a photo of a blister card, packaging box, or loose model car. We'll extract
                    its make, model, brand, colour, and series to find matches in your collection.
                  </p>

                  <div className="flex flex-wrap items-center justify-center gap-2.5 mt-5">
                    <Button
                      type="button"
                      onClick={() => startLiveCamera("environment")}
                      className="gap-1.5 h-9"
                    >
                      <Camera className="size-4" />
                      Take Photo
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      className="gap-1.5 h-9"
                    >
                      <Upload className="size-4" />
                      Upload Image
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
                <div className="space-y-3">
                  <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3] flex items-center justify-center">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="size-full object-cover"
                    />

                    {/* Shutter overlay buttons */}
                    <div className="absolute inset-x-0 bottom-4 flex items-center justify-center gap-4 z-10 px-4">
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        className="rounded-full size-10 bg-black/60 text-white hover:bg-black/80"
                        onClick={() => {
                          const nextFacing =
                            cameraFacing === "environment" ? "user" : "environment";
                          setCameraFacing(nextFacing);
                          startLiveCamera(nextFacing);
                        }}
                        title="Switch Camera"
                      >
                        <SwitchCamera className="size-4.5" />
                      </Button>

                      <button
                        type="button"
                        onClick={captureLivePhoto}
                        className="size-16 rounded-full border-4 border-white bg-primary flex items-center justify-center shadow-lg active:scale-95 transition-transform"
                        title="Capture Photo"
                      >
                        <div className="size-11 rounded-full bg-white/90" />
                      </button>

                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        className="rounded-full size-10 bg-black/60 text-white hover:bg-black/80"
                        onClick={stopLiveCamera}
                        title="Cancel Camera"
                      >
                        <X className="size-4.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                    <span>Frame the car or card inside the window</span>
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-xs"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Or upload file instead
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
                            Identifying casting with Gemini AI
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
                            <span className="text-[10px] text-muted-foreground uppercase">
                              Make:
                            </span>
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
                            <span className="text-[10px] text-muted-foreground uppercase">
                              Year:
                            </span>
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
                            <span className="text-[10px] text-muted-foreground uppercase">
                              Line:
                            </span>
                            <span>{attributes.assortment}</span>
                          </Badge>
                        )}
                        {attributes.type && (
                          <Badge variant="secondary" className="text-xs gap-1 py-1 px-2.5">
                            <span className="text-[10px] text-muted-foreground uppercase">
                              Type:
                            </span>
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
          ) : (
            /* Tab 2: Barcode & QR code scanner (Secondary) */
            <div className="space-y-0">
              <div className="relative bg-black/90 min-h-[280px] flex items-center justify-center overflow-hidden">
                <div id={barcodeContainerId} className="w-full h-full max-h-[320px]" />

                {barcodeError && (
                  <div className="absolute inset-0 p-6 flex flex-col items-center justify-center text-center bg-background/95 z-20">
                    <AlertCircle className="size-10 text-amber-500 mb-2" />
                    <p className="text-sm font-medium text-foreground">Scanner Notice</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-[260px] leading-relaxed">
                      {barcodeError}
                    </p>
                  </div>
                )}

                {!barcodeError && !barcodeReady && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-white/70 z-10">
                    <div className="size-6 rounded-full border-2 border-primary border-t-transparent animate-spin mb-2" />
                    <span className="text-xs">Initializing barcode scanner...</span>
                  </div>
                )}
              </div>

              {/* Manual Code Input Bar */}
              <div className="p-4 bg-muted/20 border-t border-border/70 space-y-3">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleDetectedCode(manualCode);
                  }}
                  className="flex items-center gap-2"
                >
                  <div className="relative flex-1">
                    <Keyboard className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input
                      value={manualCode}
                      onChange={(e) => setManualCode(e.target.value)}
                      placeholder="Enter Car ID, SKU, # number, or barcode..."
                      className="pl-9 h-9 text-xs"
                      autoFocus={Boolean(barcodeError)}
                    />
                  </div>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!manualCode.trim()}
                    className="h-9 gap-1.5"
                  >
                    <Search className="size-3.5" />
                    Find
                  </Button>
                </form>

                <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
                  <span>Reads standard barcodes, QR codes &amp; tracking IDs</span>
                  <span className="font-mono text-[10px]">{cars.length} cars indexed</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
