import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Database,
  Search,
  Plus,
  Copy,
  Check,
  Filter,
  Sparkles,
  Boxes,
  IndianRupee,
  Layers,
  ArrowUpDown,
  ExternalLink,
  ChevronRight,
  Info,
  SlidersHorizontal,
} from "lucide-react";
import { useCatalog } from "@/lib/catalog-store";
import { useCars } from "@/lib/cars-store";
import { useApp } from "@/lib/store";
import { type CatalogCar } from "@/lib/catalog";
import { generateCatalogCarId, isPlaceholderId, CarIdFields } from "@/lib/car-id";
import { PageHeading, PageToolbar } from "@/components/page-header";
import { KpiBand, KpiTile } from "@/components/kpi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { inr, inrFull } from "@/lib/format";
import { CarFormDialog } from "@/components/car-form-dialog";
import type { Diecast } from "@/lib/types";

export const Route = createFileRoute("/catalog")({
  head: () => ({
    meta: [
      { title: "Car Catalog | Tesoro" },
      {
        name: "description",
        content:
          "Centralized diecast car catalog framework. Unique Car IDs generated using Brand, Make, Model, Assortment, Series, Sub-series, Car Number, and MRP to eliminate duplication in the raw database.",
      },
      { property: "og:title", content: "Car Catalog | Tesoro" },
      {
        property: "og:description",
        content:
          "Centralized diecast car catalog framework with unique 8-component Car IDs.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CatalogPage,
});

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success(`Copied: ${text}`);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={`Copy ${label || "ID"}: ${text}`}
      className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground active:scale-95"
    >
      {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
      <span>{text}</span>
    </button>
  );
}

function CatalogPage() {
  const { catalog, isLoading, addCatalogCar } = useCatalog();
  const rawCars = useCars();
  const { query, setQuery } = useApp();

  const [searchFilter, setSearchFilter] = useState("");
  const [selectedBrand, setSelectedBrand] = useState<string>("all");
  const [selectedAssortment, setSelectedAssortment] = useState<string>("all");
  const [collectionFilter, setCollectionFilter] = useState<"all" | "owned" | "unowned">("all");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  // New Catalog Car Dialog
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newBrand, setNewBrand] = useState("Hot Wheels");
  const [newMake, setNewMake] = useState("");
  const [newModel, setNewModel] = useState("");
  const [newAssortment, setNewAssortment] = useState("Mainline");
  const [newSeries, setNewSeries] = useState("");
  const [newSubSeries, setNewSubSeries] = useState("");
  const [newCarNumber, setNewCarNumber] = useState("");
  const [newMrp, setNewMrp] = useState<number | string>(179);
  const [newName, setNewName] = useState("");
  const [newVariant, setNewVariant] = useState("");
  const [newYear, setNewYear] = useState("");
  const [newColour, setNewColour] = useState("");

  // Add to Inventory dialog for a selected catalog casting
  const [inventoryCarToCreate, setInventoryCarToCreate] = useState<Diecast | null>(null);
  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);

  // Map raw cars by their Car ID to know ownership counts
  const rawCarsByIdCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const car of rawCars) {
      const id = (car.id || "").trim();
      if (!id || isPlaceholderId(id)) continue;
      map.set(id, (map.get(id) || 0) + 1);
    }
    return map;
  }, [rawCars]);

  // Derive all unique brands & assortments from catalog
  const availableBrands = useMemo(() => {
    const set = new Set<string>();
    catalog.forEach((c) => {
      if (c.brand) set.add(c.brand);
    });
    return Array.from(set).sort();
  }, [catalog]);

  const availableAssortments = useMemo(() => {
    const set = new Set<string>();
    catalog.forEach((c) => {
      if (c.assortment) set.add(c.assortment);
    });
    return Array.from(set).sort();
  }, [catalog]);

  // Live computed ID for new casting form
  const liveGeneratedId = useMemo(() => {
    return generateCatalogCarId({
      brand: newBrand,
      make: newMake,
      model: newModel,
      assortment: newAssortment,
      series: newSeries,
      subSeries: newSubSeries,
      carNumber: newCarNumber,
      mrp: newMrp,
    });
  }, [newBrand, newMake, newModel, newAssortment, newSeries, newSubSeries, newCarNumber, newMrp]);

  const idAlreadyExists = useMemo(() => {
    return catalog.some((c) => c.car_id.toUpperCase() === liveGeneratedId.toUpperCase());
  }, [catalog, liveGeneratedId]);

  // Filtered catalog entries
  const filteredCatalog = useMemo(() => {
    const q = (searchFilter || query || "").trim().toLowerCase();

    return catalog.filter((car) => {
      if (selectedBrand !== "all" && car.brand.toLowerCase() !== selectedBrand.toLowerCase()) {
        return false;
      }
      if (
        selectedAssortment !== "all" &&
        car.assortment.toLowerCase() !== selectedAssortment.toLowerCase()
      ) {
        return false;
      }

      const ownedCount = rawCarsByIdCount.get(car.car_id) || 0;
      if (collectionFilter === "owned" && ownedCount === 0) return false;
      if (collectionFilter === "unowned" && ownedCount > 0) return false;

      if (!q) return true;

      const haystack = [
        car.car_id,
        car.brand,
        car.make,
        car.model,
        car.name,
        car.assortment,
        car.series,
        car.sub_series,
        car.car_number,
        `M${car.mrp}`,
        String(car.mrp),
        car.colour,
        car.variant,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [catalog, searchFilter, query, selectedBrand, selectedAssortment, collectionFilter, rawCarsByIdCount]);

  // KPI Metrics
  const totalCastings = catalog.length;
  const ownedCastingsCount = useMemo(() => {
    let count = 0;
    for (const c of catalog) {
      if ((rawCarsByIdCount.get(c.car_id) || 0) > 0) count++;
    }
    return count;
  }, [catalog, rawCarsByIdCount]);

  const totalRawCars = rawCars.length;
  const duplicationSavings = Math.max(0, totalRawCars - ownedCastingsCount);

  // Handle creating new catalog car
  const handleCreateCatalogCar = async () => {
    if (!newMake.trim() && !newModel.trim()) {
      toast.error("Please enter Make and Model");
      return;
    }

    const payload: CatalogCar = {
      car_id: liveGeneratedId,
      brand: newBrand.trim(),
      make: newMake.trim(),
      model: newModel.trim(),
      assortment: newAssortment.trim(),
      series: newSeries.trim(),
      sub_series: newSubSeries.trim(),
      car_number: newCarNumber.trim(),
      mrp: Number(newMrp) || 0,
      name: newName.trim() || `${newMake.trim()} ${newModel.trim()}`.trim(),
      variant: newVariant.trim(),
      year: newYear.trim() || null,
      colour: newColour.trim(),
      size: "1:64",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const success = await addCatalogCar(payload);
    if (success) {
      toast.success(`Catalog entry saved: ${payload.car_id}`);
      setIsAddOpen(false);
      // Reset form
      setNewMake("");
      setNewModel("");
      setNewSeries("");
      setNewSubSeries("");
      setNewCarNumber("");
      setNewName("");
      setNewVariant("");
      setNewColour("");
    }
  };

  // Launch Add to Inventory dialog with catalog specs preloaded
  const handleAddToInventory = (c: CatalogCar) => {
    const diecastDraft: Diecast = {
      id: c.car_id,
      name: c.name || `${c.make} ${c.model}`.trim(),
      make: c.make,
      model: c.model,
      brand: c.brand,
      assortment: c.assortment,
      series: c.series,
      subSeries: c.sub_series,
      carNumber: c.car_number,
      mrp: c.mrp,
      spent: c.mrp,
      paid: c.mrp,
      variant: c.variant || "",
      year: c.year || "",
      colour: c.colour || "",
      type: c.type || "",
      size: c.size || "1:64",
      status: "Available",
      payment: "Paid",
      seller: "",
      date: "",
      month: "",
      orderDate: "",
      orderMonth: "",
      expectedDate: "",
      transitInfo: "",
      shippingId: "",
      orderId: "",
      balance: 0,
      chase: false,
      favourite: false,
      official: true,
      open: false,
    };

    setInventoryCarToCreate(diecastDraft);
    setIsFormDialogOpen(true);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <PageHeading
        title="Car Catalog"
        description="Unified diecast casting repository. Unique Car IDs are generated from Brand, Make, Model, Assortment, Series, Sub-series, Car Number, and MRP. Reused across the raw inventory table to prevent duplication."
        actions={
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setIsAddOpen(true)}
              className="gap-1.5 shadow-sm"
            >
              <Plus className="size-4" />
              <span>New Casting</span>
            </Button>
          </div>
        }
      />

      {/* KPI Band */}
      <KpiBand>
        <KpiTile
          label="Unique Castings"
          value={totalCastings.toLocaleString()}
          subtext="Standardized specifications"
          icon={Database}
        />
        <KpiTile
          label="Owned in Collection"
          value={ownedCastingsCount.toLocaleString()}
          subtext={`${totalCastings > 0 ? Math.round((ownedCastingsCount / totalCastings) * 100) : 0}% of catalog`}
          icon={Boxes}
        />
        <KpiTile
          label="Raw Reused Instances"
          value={duplicationSavings.toLocaleString()}
          subtext="Duplicate records avoided"
          icon={Layers}
        />
        <KpiTile
          label="Catalog Brands"
          value={availableBrands.length.toLocaleString()}
          subtext="Manufacturers tracked"
          icon={Sparkles}
        />
      </KpiBand>

      {/* Controls & Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/80 bg-card p-3 shadow-xs">
        {/* Search */}
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="Search by ID, model, make, brand, series, car number..."
            className="pl-9 text-sm"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Brand */}
          <Select value={selectedBrand} onValueChange={setSelectedBrand}>
            <SelectTrigger className="w-[140px] text-xs">
              <SelectValue placeholder="All Brands" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Brands</SelectItem>
              {availableBrands.map((b) => (
                <SelectItem key={b} value={b}>
                  {b}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Assortment */}
          <Select value={selectedAssortment} onValueChange={setSelectedAssortment}>
            <SelectTrigger className="w-[140px] text-xs">
              <SelectValue placeholder="All Assortments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Assortments</SelectItem>
              {availableAssortments.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Ownership */}
          <Select
            value={collectionFilter}
            onValueChange={(v) => setCollectionFilter(v as "all" | "owned" | "unowned")}
          >
            <SelectTrigger className="w-[140px] text-xs">
              <SelectValue placeholder="Ownership" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Castings</SelectItem>
              <SelectItem value="owned">In My Collection</SelectItem>
              <SelectItem value="unowned">Not In Collection</SelectItem>
            </SelectContent>
          </Select>

          {/* View toggle */}
          <div className="flex rounded-lg border border-border bg-muted/40 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                viewMode === "grid"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Grid
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                viewMode === "table"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Table
            </button>
          </div>
        </div>
      </div>

      {/* Results Count & active filter summary */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Showing <strong className="text-foreground">{filteredCatalog.length}</strong> of{" "}
          {catalog.length} unique catalog castings
        </span>
        {(selectedBrand !== "all" ||
          selectedAssortment !== "all" ||
          collectionFilter !== "all" ||
          searchFilter) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedBrand("all");
              setSelectedAssortment("all");
              setCollectionFilter("all");
              setSearchFilter("");
            }}
            className="h-6 px-2 text-xs text-primary"
          >
            Reset Filters
          </Button>
        )}
      </div>

      {/* Main Content Area */}
      {filteredCatalog.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16 text-center">
          <Database className="size-10 text-muted-foreground/40" />
          <h3 className="mt-3 text-base font-semibold text-foreground">No castings found</h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-sm">
            No catalog cars match your search or active filter combination.
          </p>
          <Button
            onClick={() => setIsAddOpen(true)}
            variant="outline"
            size="sm"
            className="mt-4 gap-1.5"
          >
            <Plus className="size-3.5" />
            Add New Casting
          </Button>
        </div>
      ) : viewMode === "grid" ? (
        /* GRID VIEW */
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredCatalog.map((c) => {
            const copies = rawCarsByIdCount.get(c.car_id) || 0;
            return (
              <div
                key={c.car_id}
                className="group relative flex flex-col justify-between rounded-2xl border border-border/80 bg-card p-4 shadow-xs transition-all hover:border-border hover:shadow-md"
              >
                <div>
                  {/* Top Bar: Brand, Assortment, Ownership */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 truncate text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <span>{c.brand}</span>
                      {c.assortment && (
                        <>
                          <span className="text-muted-foreground/30">·</span>
                          <span className="truncate">{c.assortment}</span>
                        </>
                      )}
                    </div>

                    {copies > 0 ? (
                      <span className="shrink-0 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                        In DB ({copies}x)
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full border border-border bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground">
                        Not in DB
                      </span>
                    )}
                  </div>

                  {/* Title / Model */}
                  <h3 className="mt-1.5 font-bold tracking-tight text-foreground truncate text-base">
                    {c.name || `${c.make} ${c.model}`.trim()}
                  </h3>
                  <div className="text-xs text-muted-foreground truncate">
                    {c.make} · {c.model}
                  </div>

                  {/* Unique Car ID copy chip */}
                  <div className="mt-2.5 flex items-center justify-between rounded-lg border border-border/60 bg-muted/40 px-2.5 py-1.5">
                    <div className="truncate font-mono text-[10px] font-medium text-foreground/90">
                      {c.car_id}
                    </div>
                    <CopyButton text={c.car_id} label="Car ID" />
                  </div>

                  {/* 8-attribute spec grid */}
                  <div className="mt-3 grid grid-cols-2 gap-1.5 text-[11px]">
                    <div className="rounded bg-muted/30 p-1.5">
                      <span className="block text-[9px] uppercase tracking-wider text-muted-foreground">
                        Series
                      </span>
                      <span className="font-medium text-foreground truncate block">
                        {c.series || "—"}
                      </span>
                    </div>

                    <div className="rounded bg-muted/30 p-1.5">
                      <span className="block text-[9px] uppercase tracking-wider text-muted-foreground">
                        Sub-Series
                      </span>
                      <span className="font-medium text-foreground truncate block">
                        {c.sub_series || "—"}
                      </span>
                    </div>

                    <div className="rounded bg-muted/30 p-1.5">
                      <span className="block text-[9px] uppercase tracking-wider text-muted-foreground">
                        Car Number
                      </span>
                      <span className="font-medium text-foreground truncate block">
                        {c.car_number || "—"}
                      </span>
                    </div>

                    <div className="rounded bg-muted/30 p-1.5">
                      <span className="block text-[9px] uppercase tracking-wider text-muted-foreground">
                        MRP
                      </span>
                      <span className="font-medium text-foreground truncate block">
                        {c.mrp ? inr(c.mrp) : "—"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Action Footer */}
                <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground font-mono">
                    ID linked
                  </span>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAddToInventory(c)}
                    className="h-7 text-xs gap-1.5 font-medium hover:bg-primary hover:text-primary-foreground"
                  >
                    <Plus className="size-3" />
                    <span>Add to DB Raw</span>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* TABLE VIEW */
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-muted/40 font-medium text-muted-foreground">
                <tr>
                  <th className="py-3 pl-4 pr-3">Unique Car ID</th>
                  <th className="py-3 px-3">Brand</th>
                  <th className="py-3 px-3">Make</th>
                  <th className="py-3 px-3">Model</th>
                  <th className="py-3 px-3">Assortment</th>
                  <th className="py-3 px-3">Series</th>
                  <th className="py-3 px-3">Sub-Series</th>
                  <th className="py-3 px-3">Car #</th>
                  <th className="py-3 px-3 text-right">MRP</th>
                  <th className="py-3 px-3 text-center">In DB</th>
                  <th className="py-3 pl-3 pr-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredCatalog.map((c) => {
                  const copies = rawCarsByIdCount.get(c.car_id) || 0;
                  return (
                    <tr key={c.car_id} className="hover:bg-muted/20 transition-colors">
                      <td className="py-2.5 pl-4 pr-3 font-mono font-medium text-foreground">
                        <div className="flex items-center gap-1.5 max-w-[200px] truncate">
                          <span className="truncate">{c.car_id}</span>
                          <CopyButton text={c.car_id} />
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-medium text-foreground">{c.brand}</td>
                      <td className="py-2.5 px-3 text-muted-foreground">{c.make}</td>
                      <td className="py-2.5 px-3 font-medium text-foreground">{c.model}</td>
                      <td className="py-2.5 px-3 text-muted-foreground">{c.assortment}</td>
                      <td className="py-2.5 px-3 text-muted-foreground">{c.series || "—"}</td>
                      <td className="py-2.5 px-3 text-muted-foreground">{c.sub_series || "—"}</td>
                      <td className="py-2.5 px-3 font-mono text-muted-foreground">
                        {c.car_number || "—"}
                      </td>
                      <td className="py-2.5 px-3 text-right font-medium text-foreground">
                        {c.mrp ? inr(c.mrp) : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {copies > 0 ? (
                          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                            {copies}x
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">0</span>
                        )}
                      </td>
                      <td className="py-2.5 pl-3 pr-4 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleAddToInventory(c)}
                          className="h-7 px-2 text-xs gap-1 font-medium hover:text-primary"
                        >
                          <Plus className="size-3" />
                          <span>Add</span>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* DIALOG: Add New Casting with Live 8-Field ID Generator            */}
      {/* =================================================================== */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Database className="size-5 text-primary" />
              <span>Define New Catalog Casting</span>
            </DialogTitle>
            <DialogDescription>
              Create a standard catalog entry. Its unique Car ID will be generated
              strictly from Brand, Make, Model, Assortment, Series, Sub-series, Car Number, and MRP.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* LIVE GENERATED CAR ID BANNER */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                  Live Generated Unique Car ID
                </span>
                {idAlreadyExists ? (
                  <Badge variant="destructive" className="text-[10px]">
                    Already in Catalog
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-0">
                    New Unique ID
                  </Badge>
                )}
              </div>
              <div className="font-mono text-sm font-bold tracking-tight text-foreground break-all">
                {liveGeneratedId}
              </div>
              <div className="text-[11px] text-muted-foreground">
                Composed of: Brand · Make · Model · Assortment · Series · Sub-series · Car # · MRP
              </div>
            </div>

            {/* 8 Core Fields Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* 1. Brand */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold">1. Brand *</Label>
                <Input
                  value={newBrand}
                  onChange={(e) => setNewBrand(e.target.value)}
                  placeholder="e.g. Hot Wheels, Mini GT, Matchbox"
                  className="text-sm"
                />
              </div>

              {/* 2. Assortment */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold">4. Assortment *</Label>
                <Input
                  value={newAssortment}
                  onChange={(e) => setNewAssortment(e.target.value)}
                  placeholder="e.g. Mainline, Premium, Box"
                  className="text-sm"
                />
              </div>

              {/* 3. Make */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold">2. Make *</Label>
                <Input
                  value={newMake}
                  onChange={(e) => setNewMake(e.target.value)}
                  placeholder="e.g. Porsche, Nissan, Ford"
                  className="text-sm"
                />
              </div>

              {/* 4. Model */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold">3. Model *</Label>
                <Input
                  value={newModel}
                  onChange={(e) => setNewModel(e.target.value)}
                  placeholder="e.g. 911 GT3 RS, Skyline GT-R"
                  className="text-sm"
                />
              </div>

              {/* 5. Series */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold">5. Series</Label>
                <Input
                  value={newSeries}
                  onChange={(e) => setNewSeries(e.target.value)}
                  placeholder="e.g. HW Exotics, Factory Fresh"
                  className="text-sm"
                />
              </div>

              {/* 6. Sub Series */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold">6. Sub Series</Label>
                <Input
                  value={newSubSeries}
                  onChange={(e) => setNewSubSeries(e.target.value)}
                  placeholder="e.g. 2 of 10, Car Culture"
                  className="text-sm"
                />
              </div>

              {/* 7. Car Number */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold">7. Car Number</Label>
                <Input
                  value={newCarNumber}
                  onChange={(e) => setNewCarNumber(e.target.value)}
                  placeholder="e.g. 042/250, 42"
                  className="text-sm"
                />
              </div>

              {/* 8. MRP */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold">8. MRP (₹) *</Label>
                <Input
                  type="number"
                  value={newMrp}
                  onChange={(e) => setNewMrp(e.target.value)}
                  placeholder="179"
                  className="text-sm font-mono"
                />
              </div>
            </div>

            {/* Optional extra specs */}
            <div className="rounded-xl border border-border p-3 space-y-2 bg-muted/20">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block">
                Additional Details (Optional)
              </span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[11px] text-muted-foreground">Release Year</Label>
                  <Input
                    value={newYear}
                    onChange={(e) => setNewYear(e.target.value)}
                    placeholder="2024"
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">Colour</Label>
                  <Input
                    value={newColour}
                    onChange={(e) => setNewColour(e.target.value)}
                    placeholder="Red, Blue, etc."
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setIsAddOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateCatalogCar}
              disabled={idAlreadyExists || !newMake.trim() || !newModel.trim()}
              className="gap-1.5"
            >
              <Check className="size-4" />
              <span>Save to Catalog</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* =================================================================== */}
      {/* DIALOG: CarFormDialog for adding a specific copy to inventory      */}
      {/* =================================================================== */}
      {inventoryCarToCreate && (
        <CarFormDialog
          open={isFormDialogOpen}
          onOpenChange={(open) => {
            setIsFormDialogOpen(open);
            if (!open) setInventoryCarToCreate(null);
          }}
          initial={inventoryCarToCreate}
        />
      )}
    </div>
  );
}
