import { VehiclePriceEditor } from "./VehiclePriceEditor";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  Eye,
  EyeOff,
  Images,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  apiFetch,
  DiscordEmojiRef,
  FeatureIconName,
  FeatureSurface,
  ListingItem,
  VehicleFeature,
} from "@/lib/api";
import {
  SUPPORTED_FEATURE_TEMPLATES,
  VehicleMetadataOverride,
} from "../../../shared/features";
import { cn, formatLocalDateTime, safeExternalUrl } from "@/lib/utils";
import { ADMIN_OVERVIEW_KEY, useAdminOverview } from "./useAdminOverview";
import { AppShell } from "@/components/layout/AppShell";
import { EmojiPickerButton } from "@/components/discord/EmojiPicker";
import { FeatureBadgeIcon, FeatureChipList } from "@/components/listings/VehicleCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";

const ICON_OPTIONS: Array<{ value: FeatureIconName; label: string }> = [
  { value: "sparkles", label: "Sparkles (Limited)" },
  { value: "volume", label: "Audio (Sound)" },
  { value: "wrench", label: "Wrench (Custom)" },
  { value: "clock", label: "Clock (Timed)" },
  { value: "shield", label: "Shield (Trading)" },
  { value: "gauge", label: "Gauge (Handling)" },
  { value: "flame", label: "Flame (Effects)" },
  { value: "award", label: "Award (Upgrades)" },
  { value: "star", label: "Star (Unique)" },
  { value: "zap", label: "Bolt (Boost)" },
  { value: "check", label: "Check (Verified)" },
  { value: "tag", label: "Tag (General)" },
];

const SURFACE_OPTIONS: Array<{ value: FeatureSurface; label: string }> = [
  { value: "card", label: "Site Cards" },
  { value: "in_stock_embed", label: "In Stock Embed" },
  { value: "sold_out_embed", label: "Sold Out Embed" },
  { value: "widget", label: "Live Widget" },
];

const ALL_SURFACES: FeatureSurface[] = ["card", "in_stock_embed", "sold_out_embed", "widget"];

interface ListingMetadataResponse {
  ok: boolean;
  listing: ListingItem;
  widgetRefresh?: { refreshed: number; skipped: number; failed: number };
  embedUpdateResults?: Array<{ guildId: string; ok: boolean; error?: string }>;
}

interface MetadataDraft {
  displayName: string;
  shortDescription: string;
  fullDescription: string;
  useCustomFeatures: boolean;
  features: VehicleFeature[];
  hiddenFeatureKeys: string[];
}

function buildDraftFromListing(listing: ListingItem): MetadataDraft {
  const pres = listing.presentation;
  const ov = pres?.override || null;
  const extractedFeatures = pres?.source.extracted.features || [];
  const hasCustomFeatures = Boolean(ov?.featuresOverride && Array.isArray(ov.featuresOverride));
  const seedFeatures = hasCustomFeatures
    ? (ov!.featuresOverride as VehicleFeature[]).map((f, idx) => ({
        ...f,
        priority: typeof f.priority === "number" ? f.priority : (idx + 1) * 10,
      }))
    : extractedFeatures.map((f, idx) => ({
        ...f,
        priority: typeof f.priority === "number" ? f.priority : (idx + 1) * 10,
      }));

  return {
    displayName: ov?.displayName || "",
    shortDescription: ov?.shortDescription || "",
    fullDescription: ov?.fullDescription || "",
    useCustomFeatures: hasCustomFeatures,
    features: seedFeatures,
    hiddenFeatureKeys: ov?.hiddenFeatureKeys ? [...ov.hiddenFeatureKeys] : [],
  };
}

export function AdminMetadataPage() {
  const queryClient = useQueryClient();
  const { data: overview, isLoading: overviewLoading } = useAdminOverview();
  const listings = overview?.listings || [];

  const [selectedListingId, setSelectedListingId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).get("listingId") || "";
    }
    return "";
  });

  const [draft, setDraft] = useState<MetadataDraft | null>(null);
  const [updateDeployedEmbeds, setUpdateDeployedEmbeds] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [addTemplateKey, setAddTemplateKey] = useState<string>("custom");

  useEffect(() => {
    if (
      listings.length > 0 &&
      (!selectedListingId || !listings.some((l) => l.id === selectedListingId))
    ) {
      setSelectedListingId(listings[0].id);
    }
  }, [listings, selectedListingId]);

  const {
    data: metadataRes,
    isLoading: metaLoading,
    isFetching: metaFetching,
    refetch,
  } = useQuery<ListingMetadataResponse>({
    queryKey: ["admin-listing-metadata", selectedListingId],
    queryFn: () =>
      apiFetch<ListingMetadataResponse>(
        `/api/admin/listings/${encodeURIComponent(selectedListingId)}/metadata`
      ),
    enabled: Boolean(selectedListingId),
    staleTime: 20_000,
  });

  const activeListing =
    metadataRes?.listing || listings.find((l) => l.id === selectedListingId) || null;

  useEffect(() => {
    if (activeListing) {
      setDraft(buildDraftFromListing(activeListing));
    }
  }, [activeListing?.id, metadataRes?.listing?.presentation?.override?.updatedAt]);

  const invalidateAllCaches = () => {
    void queryClient.invalidateQueries({
      queryKey: ["admin-listing-metadata", selectedListingId],
    });
    void queryClient.invalidateQueries({ queryKey: ADMIN_OVERVIEW_KEY });
    void queryClient.invalidateQueries({ queryKey: ["admin-widgets"] });
    void queryClient.invalidateQueries({ queryKey: ["public-listings"] });
    void queryClient.invalidateQueries({ queryKey: ["public-status"] });
    void queryClient.invalidateQueries({ queryKey: ["history"] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!activeListing || !draft) throw new Error("No vehicle listing selected.");
      const normalizedFeatures = draft.useCustomFeatures
        ? draft.features
            .filter((f) => f.label.trim().length > 0)
            .map((f, idx) => ({
              ...f,
              key: f.key.trim() || `custom_${idx + 1}`,
              label: f.label.trim(),
              priority: (idx + 1) * 10,
            }))
        : null;

      return apiFetch<ListingMetadataResponse>(
        `/api/admin/listings/${encodeURIComponent(activeListing.id)}/metadata`,
        {
          method: "PUT",
          body: JSON.stringify({
            displayName: draft.displayName.trim() || undefined,
            shortDescription: draft.shortDescription.trim() || undefined,
            fullDescription: draft.fullDescription.trim() || undefined,
            featuresOverride: normalizedFeatures,
            hiddenFeatureKeys: draft.hiddenFeatureKeys,
            updateDeployedEmbeds,
          }),
        }
      );
    },
    onSuccess: (res) => {
      queryClient.setQueryData(["admin-listing-metadata", selectedListingId], res);
      setDraft(buildDraftFromListing(res.listing));
      invalidateAllCaches();

      const updatedEmbeds =
        res.embedUpdateResults?.filter((r) => r.ok).length ?? 0;
      const failedEmbeds =
        res.embedUpdateResults?.filter((r) => !r.ok).length ?? 0;
      const widgetRefreshed = res.widgetRefresh?.refreshed ?? 0;

      if (updateDeployedEmbeds && res.embedUpdateResults && res.embedUpdateResults.length > 0) {
        toast.success(
          `Saved metadata overrides. Synced ${widgetRefreshed} widget(s) and patched ${updatedEmbeds} deployed embed(s)${
            failedEmbeds > 0 ? ` (${failedEmbeds} failed)` : ""
          }.`
        );
      } else {
        toast.success(
          `Saved metadata overrides for ${res.listing.presentation?.effective.name || res.listing.name}${
            widgetRefreshed > 0 ? ` and refreshed ${widgetRefreshed} live widget(s)` : ""
          }.`
        );
      }
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to save vehicle metadata overrides.");
    },
  });

  const resetMutation = useMutation({
    mutationFn: () =>
      apiFetch<ListingMetadataResponse>(
        `/api/admin/listings/${encodeURIComponent(selectedListingId)}/metadata`,
        { method: "DELETE" }
      ),
    onSuccess: (res) => {
      setResetDialogOpen(false);
      queryClient.setQueryData(["admin-listing-metadata", selectedListingId], res);
      setDraft(buildDraftFromListing(res.listing));
      invalidateAllCaches();
      toast.success("Cleared overrides and restored extracted storefront defaults.");
    },
    onError: (err: Error) => {
      setResetDialogOpen(false);
      toast.error(err.message || "Failed to reset vehicle metadata.");
    },
  });

  const handleSelectListing = (id: string) => {
    setSelectedListingId(id);
    if (typeof window !== "undefined") {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set("listingId", id);
      window.history.replaceState({}, "", nextUrl.toString());
    }
  };

  const recentEmojis: DiscordEmojiRef[] = overview?.presentationConfig?.recentEmojis || [];

  const effectivePreviewFeatures = useMemo(() => {
    if (!draft) return [];
    const hiddenSet = new Set(draft.hiddenFeatureKeys);
    return draft.features
      .filter((f) => f.label.trim() && !hiddenSet.has(f.key))
      .sort((a, b) => a.priority - b.priority);
  }, [draft]);

  const updateFeature = (index: number, patch: Partial<VehicleFeature>) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = [...prev.features];
      next[index] = { ...next[index], ...patch };
      return {
        ...prev,
        useCustomFeatures: true,
        features: next,
      };
    });
  };

  const moveFeature = (index: number, delta: -1 | 1) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const target = index + delta;
      if (target < 0 || target >= prev.features.length) return prev;
      const next = [...prev.features];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return {
        ...prev,
        useCustomFeatures: true,
        features: next.map((f, idx) => ({ ...f, priority: (idx + 1) * 10 })),
      };
    });
  };

  const removeFeature = (index: number) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const removed = prev.features[index];
      const next = prev.features.filter((_, i) => i !== index);
      return {
        ...prev,
        useCustomFeatures: true,
        features: next.map((f, idx) => ({ ...f, priority: (idx + 1) * 10 })),
        hiddenFeatureKeys: removed
          ? prev.hiddenFeatureKeys.filter((k) => k !== removed.key)
          : prev.hiddenFeatureKeys,
      };
    });
  };

  const toggleFeatureHidden = (key: string) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const exists = prev.hiddenFeatureKeys.includes(key);
      return {
        ...prev,
        hiddenFeatureKeys: exists
          ? prev.hiddenFeatureKeys.filter((k) => k !== key)
          : [...prev.hiddenFeatureKeys, key],
      };
    });
  };

  const toggleFeatureSurface = (index: number, surface: FeatureSurface) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const feature = prev.features[index];
      if (!feature) return prev;
      const currentSurfaces =
        feature.visibleOn && feature.visibleOn.length > 0
          ? feature.visibleOn
          : [...ALL_SURFACES];
      const hasSurface = currentSurfaces.includes(surface);
      const nextSurfaces = hasSurface
        ? currentSurfaces.filter((s) => s !== surface)
        : [...currentSurfaces, surface];
      const next = [...prev.features];
      next[index] = {
        ...feature,
        visibleOn: nextSurfaces,
      };
      return {
        ...prev,
        useCustomFeatures: true,
        features: next,
      };
    });
  };

  const handleAddFeature = () => {
    if (!draft) return;
    const tpl = SUPPORTED_FEATURE_TEMPLATES.find((t) => t.key === addTemplateKey);
    const existingKeys = new Set(draft.features.map((f) => f.key));

    let nextFeature: VehicleFeature;
    if (tpl && !existingKeys.has(tpl.key)) {
      nextFeature = {
        key: tpl.key,
        label: tpl.label,
        icon: tpl.icon,
        priority: (draft.features.length + 1) * 10,
        source: "admin",
        visibleOn: [...ALL_SURFACES],
      };
    } else {
      let suffix = draft.features.length + 1;
      let key = `custom_${suffix}`;
      while (existingKeys.has(key)) {
        suffix += 1;
        key = `custom_${suffix}`;
      }
      nextFeature = {
        key,
        label: tpl ? `${tpl.label} (Custom)` : "Custom Highlight",
        icon: tpl?.icon || "star",
        priority: (draft.features.length + 1) * 10,
        source: "admin",
        visibleOn: [...ALL_SURFACES],
      };
    }

    setDraft({
      ...draft,
      useCustomFeatures: true,
      features: [...draft.features, nextFeature],
    });
  };

  const handleRevertFeaturesToExtracted = () => {
    if (!activeListing?.presentation || !draft) return;
    setDraft({
      ...draft,
      useCustomFeatures: false,
      features: activeListing.presentation.source.extracted.features.map((f, idx) => ({
        ...f,
        priority: (idx + 1) * 10,
      })),
    });
    toast.message("Feature list reverted to extracted defaults (save to persist).");
  };

  const source = activeListing?.presentation?.source;
  const currentOverride: VehicleMetadataOverride | null =
    activeListing?.presentation?.override || null;

  return (
    <AppShell
      requireAdmin
      title="Vehicle Metadata Overrides"
      description="Inspect extracted storefront metadata and configure clean administrator overrides without overwriting preserved listing records."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin">Overview</Link>
          </Button>
          {activeListing && (
            <Button variant="outline" size="sm" asChild>
              <Link to="/admin/images" search={{ listingId: activeListing.id } as any}>
                <Images className="h-3.5 w-3.5" />
                Edit Images
              </Link>
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            disabled={!selectedListingId || metaFetching}
            onClick={() => void refetch()}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", metaFetching && "animate-spin")} />
            Refresh
          </Button>
        </div>
      }
    >
      {overviewLoading ? (
        <div className="space-y-6">
          <Skeleton className="h-28 w-full rounded-xl" />
          <div className="grid gap-4 @3xl/main:grid-cols-2">
            <Skeleton className="h-64 w-full rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      ) : listings.length === 0 ? (
        <Card className="p-10 text-center">
          <SlidersHorizontal className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No vehicle listings found in history yet. Run a store scan in Store Monitoring first.
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Listing Selector */}
          <Card>
            <CardContent className="flex flex-col gap-4 p-5 @3xl/main:flex-row @3xl/main:items-center @3xl/main:justify-between">
              <div className="flex-1 space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Selected Vehicle Listing
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  <Select value={selectedListingId} onValueChange={handleSelectListing}>
                    <SelectTrigger className="w-full sm:w-96">
                      <SelectValue placeholder="Choose a vehicle listing" />
                    </SelectTrigger>
                    <SelectContent>
                      {listings.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.presentation?.effective.name || item.name} (#{item.id}) —{" "}
                          {item.isAvailable ? "In Stock" : "Sold Out"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {activeListing && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={activeListing.isAvailable ? "success" : "destructive"}>
                        {activeListing.isAvailable ? "In Stock" : "Sold Out"}
                      </Badge>
                      <Badge
                        variant={
                          activeListing.presentation?.effective.hasOverrides
                            ? "warning"
                            : "secondary"
                        }
                      >
                        {activeListing.presentation?.effective.hasOverrides
                          ? "Admin Override Active"
                          : "Using Storefront Defaults"}
                      </Badge>
                    </div>
                  )}
                </div>
                {currentOverride?.updatedAt && (
                  <p className="text-xs text-muted-foreground">
                    Last edited {formatLocalDateTime(currentOverride.updatedAt)}
                    {currentOverride.updatedBy ? ` by ${currentOverride.updatedBy}` : ""}
                  </p>
                )}
              </div>

              {activeListing && (
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={
                      safeExternalUrl(activeListing.url) ||
                      `https://store.everfallcommunity.com/package/${activeListing.id}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-2 text-xs font-medium text-zinc-200 transition hover:bg-zinc-800 hover:text-white"
                  >
                    Open Everfall Store
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              )}
            </CardContent>
          </Card>

          {metaLoading && !draft ? (
            <div className="space-y-4">
              <Skeleton className="h-56 w-full rounded-xl" />
              <Skeleton className="h-80 w-full rounded-xl" />
            </div>
          ) : (
            activeListing &&
            source &&
            draft && (
              <>
                {/* Source vs Extracted Comparison */}
                <div className="grid gap-4 @3xl/main:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Original Storefront Record</CardTitle>
                      <CardDescription>
                        Preserved read-only data scraped from Everfall Storefront (#{activeListing.id}).
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 text-xs">
                      <div>
                        <span className="font-semibold uppercase tracking-wider text-muted-foreground">
                          Raw Title
                        </span>
                        <p className="mt-1 rounded-lg border border-border bg-zinc-950 px-3 py-2 font-medium text-white">
                          {source.name}
                        </p>
                      </div>
                      <div>
                        <span className="font-semibold uppercase tracking-wider text-muted-foreground">
                          Extracted Card Summary
                        </span>
                        <p className="mt-1 rounded-lg border border-border bg-zinc-950 px-3 py-2 text-zinc-300">
                          {source.extracted.shortSummary || "No summary text."}
                        </p>
                      </div>
                      <div>
                        <span className="font-semibold uppercase tracking-wider text-muted-foreground">
                          Raw Storefront Description
                        </span>
                        <div className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-zinc-950 p-3 text-zinc-300">
                          {source.description || "No raw description stored."}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Auto-Extracted Capabilities &amp; Terms</CardTitle>
                      <CardDescription>
                        Deterministic metadata extracted strictly from storefront text without inventing unverified traits.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 text-xs">
                      <div>
                        <span className="font-semibold uppercase tracking-wider text-muted-foreground">
                          Extracted Feature Chips
                        </span>
                        <div className="mt-2 rounded-lg border border-border bg-zinc-950 p-3">
                          {source.extracted.features.length > 0 ? (
                            <FeatureChipList features={source.extracted.features} />
                          ) : (
                            <span className="text-muted-foreground">
                              No structured features detected in description.
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="grid gap-3 @xl/card:grid-cols-2">
                        <div className="rounded-lg border border-border bg-zinc-950 p-3">
                          <span className="font-semibold uppercase tracking-wider text-muted-foreground">
                            Trading Restriction
                          </span>
                          <p className="mt-1 text-zinc-200">
                            {source.extracted.tradingRestriction || "None detected"}
                          </p>
                        </div>
                        <div className="rounded-lg border border-border bg-zinc-950 p-3">
                          <span className="font-semibold uppercase tracking-wider text-muted-foreground">
                            Delivery Timing
                          </span>
                          <p className="mt-1 text-zinc-200">
                            {source.extracted.deliveryInfo || "None detected"}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/15 p-3">
                        <div className="flex items-center gap-1.5 font-semibold text-emerald-300">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          Live Card Effective Output Preview
                        </div>
                        <p className="mt-1.5 font-semibold text-white">
                          {draft.displayName.trim() || source.name}
                        </p>
                        <p className="mt-1 text-zinc-300">
                          {draft.shortDescription.trim() || source.extracted.shortSummary}
                        </p>
                        <div className="mt-2">
                          <FeatureChipList features={effectivePreviewFeatures} />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <VehiclePriceEditor key={selectedListingId} id={selectedListingId} />
                {/* Administrator Overrides Editor */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-amber-400" />
                      Administrator Presentation Overrides
                    </CardTitle>
                    <CardDescription>
                      Leave text fields blank to continue inheriting auto-extracted values. Overrides apply across public cards, modals, Discord embeds, and live status widgets.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid gap-4 @2xl/main:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="override-name">Display Name Override</Label>
                        <Input
                          id="override-name"
                          value={draft.displayName}
                          maxLength={140}
                          placeholder={source.name}
                          onChange={(e) =>
                            setDraft({ ...draft, displayName: e.target.value })
                          }
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="override-short">
                          Short Card Summary Override ({draft.shortDescription.length}/400)
                        </Label>
                        <textarea
                          id="override-short"
                          rows={2}
                          maxLength={400}
                          value={draft.shortDescription}
                          placeholder={source.extracted.shortSummary}
                          onChange={(e) =>
                            setDraft({ ...draft, shortDescription: e.target.value })
                          }
                          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="override-full">
                        Full Description Override ({draft.fullDescription.length}/2500)
                      </Label>
                      <textarea
                        id="override-full"
                        rows={4}
                        maxLength={2500}
                        value={draft.fullDescription}
                        placeholder={source.description}
                        onChange={(e) =>
                          setDraft({ ...draft, fullDescription: e.target.value })
                        }
                        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </div>

                    {/* Feature Editor */}
                    <div className="space-y-4 rounded-xl border border-border bg-zinc-950/60 p-4">
                      <div className="flex flex-col gap-3 @2xl/main:flex-row @2xl/main:items-center @2xl/main:justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-white">
                              Normalized Feature Chips
                            </h3>
                            <Badge variant={draft.useCustomFeatures ? "warning" : "secondary"}>
                              {draft.useCustomFeatures ? "Custom List" : "Auto-Extracted"}
                            </Badge>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Reorder chips, adjust icons or Discord emojis, hide extracted tags, or toggle per-surface visibility.
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {draft.useCustomFeatures && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={handleRevertFeaturesToExtracted}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              Use Extracted Features
                            </Button>
                          )}

                          <Select value={addTemplateKey} onValueChange={setAddTemplateKey}>
                            <SelectTrigger className="h-8 w-48 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="custom">Custom Feature Chip</SelectItem>
                              {SUPPORTED_FEATURE_TEMPLATES.map((tpl) => (
                                <SelectItem key={tpl.key} value={tpl.key}>
                                  {tpl.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={handleAddFeature}
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Add Feature
                          </Button>
                        </div>
                      </div>

                      {draft.features.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                          No feature chips configured for this listing. Use &ldquo;Add Feature&rdquo; above to add custom capability tags.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {draft.features.map((feat, idx) => {
                            const isHidden = draft.hiddenFeatureKeys.includes(feat.key);
                            const activeSurfaces =
                              feat.visibleOn && feat.visibleOn.length > 0
                                ? feat.visibleOn
                                : ALL_SURFACES;

                            return (
                              <div
                                key={`${feat.key}-${idx}`}
                                className={cn(
                                  "rounded-lg border bg-card p-3.5 transition",
                                  isHidden
                                    ? "border-border/50 opacity-65"
                                    : "border-border"
                                )}
                              >
                                <div className="grid gap-3 @3xl/main:grid-cols-12 @3xl/main:items-end">
                                  <div className="space-y-1 @3xl/main:col-span-4">
                                    <Label className="text-[11px]">
                                      Label <span className="font-mono text-muted-foreground">({feat.key})</span>
                                    </Label>
                                    <Input
                                      value={feat.label}
                                      maxLength={80}
                                      onChange={(e) =>
                                        updateFeature(idx, { label: e.target.value })
                                      }
                                      className="h-8 text-xs"
                                    />
                                  </div>

                                  <div className="space-y-1 @3xl/main:col-span-2">
                                    <Label className="text-[11px]">Value (Optional)</Label>
                                    <Input
                                      value={feat.value || ""}
                                      maxLength={80}
                                      placeholder="e.g. Over 17"
                                      onChange={(e) =>
                                        updateFeature(idx, {
                                          value: e.target.value || undefined,
                                        })
                                      }
                                      className="h-8 text-xs"
                                    />
                                  </div>

                                  <div className="space-y-1 @3xl/main:col-span-2">
                                    <Label className="text-[11px]">Lucide Icon</Label>
                                    <Select
                                      value={feat.icon}
                                      onValueChange={(icon) =>
                                        updateFeature(idx, { icon: icon as FeatureIconName })
                                      }
                                    >
                                      <SelectTrigger className="h-8 text-xs">
                                        <span className="inline-flex items-center gap-1.5">
                                          <FeatureBadgeIcon icon={feat.icon} />
                                          <SelectValue />
                                        </span>
                                      </SelectTrigger>
                                      <SelectContent>
                                        {ICON_OPTIONS.map((opt) => (
                                          <SelectItem key={opt.value} value={opt.value}>
                                            {opt.label}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>

                                  <div className="space-y-1 @3xl/main:col-span-2">
                                    <Label className="text-[11px]">Discord Emoji</Label>
                                    <EmojiPickerButton
                                      label={`${feat.label} Emoji`}
                                      value={feat.emoji || null}
                                      recentEmojis={recentEmojis}
                                      onChange={(emoji) => updateFeature(idx, { emoji })}
                                    />
                                  </div>

                                  <div className="flex items-center justify-end gap-1 @3xl/main:col-span-2">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="icon"
                                      className="h-8 w-8"
                                      disabled={idx === 0}
                                      aria-label="Move feature up"
                                      onClick={() => moveFeature(idx, -1)}
                                    >
                                      <ArrowUp className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="icon"
                                      className="h-8 w-8"
                                      disabled={idx === draft.features.length - 1}
                                      aria-label="Move feature down"
                                      onClick={() => moveFeature(idx, 1)}
                                    >
                                      <ArrowDown className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant={isHidden ? "secondary" : "outline"}
                                      size="icon"
                                      className="h-8 w-8"
                                      aria-label={isHidden ? "Show feature" : "Hide feature"}
                                      onClick={() => toggleFeatureHidden(feat.key)}
                                    >
                                      {isHidden ? (
                                        <EyeOff className="h-3.5 w-3.5 text-amber-300" />
                                      ) : (
                                        <Eye className="h-3.5 w-3.5" />
                                      )}
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="destructive"
                                      size="icon"
                                      className="h-8 w-8"
                                      aria-label="Remove feature"
                                      onClick={() => removeFeature(idx)}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </div>

                                <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-border/70 pt-2.5">
                                  <span className="text-[11px] font-medium text-muted-foreground">
                                    Visible On:
                                  </span>
                                  {SURFACE_OPTIONS.map((surf) => {
                                    const checked = activeSurfaces.includes(surf.value);
                                    return (
                                      <label
                                        key={surf.value}
                                        className="flex cursor-pointer items-center gap-1.5 text-xs text-zinc-300"
                                      >
                                        <Checkbox
                                          checked={checked}
                                          onCheckedChange={() =>
                                            toggleFeatureSurface(idx, surf.value)
                                          }
                                        />
                                        <span>{surf.label}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Footer Save Bar */}
                    <div className="flex flex-col gap-4 border-t border-border pt-4 @2xl/main:flex-row @2xl/main:items-center @2xl/main:justify-between">
                      <div className="flex items-center gap-2.5">
                        <Switch
                          id="update-deployed-embeds"
                          checked={updateDeployedEmbeds}
                          onCheckedChange={setUpdateDeployedEmbeds}
                        />
                        <Label
                          htmlFor="update-deployed-embeds"
                          className="cursor-pointer text-xs text-zinc-300"
                        >
                          Also patch already-deployed Discord announcement embeds on save
                        </Label>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          disabled={saveMutation.isPending || resetMutation.isPending}
                          onClick={() => setResetDialogOpen(true)}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Reset to Extracted Defaults
                        </Button>

                        <Button
                          type="button"
                          variant="ghost"
                          disabled={saveMutation.isPending}
                          onClick={() => setDraft(buildDraftFromListing(activeListing))}
                        >
                          Discard Changes
                        </Button>

                        <Button
                          type="button"
                          disabled={saveMutation.isPending}
                          onClick={() => saveMutation.mutate()}
                        >
                          {saveMutation.isPending ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            <>
                              <Save className="h-4 w-4" />
                              Save Metadata
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            )
          )}
        </div>
      )}

      {/* Reset Confirmation Dialog */}
      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Metadata Overrides</DialogTitle>
            <DialogDescription>
              This removes all administrator text and feature overrides for{" "}
              <strong className="text-white">
                {activeListing?.presentation?.effective.name || activeListing?.name}
              </strong>{" "}
              and restores clean auto-extracted storefront values.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={resetMutation.isPending}
              onClick={() => resetMutation.mutate()}
            >
              {resetMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Resetting...
                </>
              ) : (
                "Reset to Defaults"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
