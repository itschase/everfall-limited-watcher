import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  ExternalLink,
  ImagePlus,
  Images,
  Loader2,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import {
  apiFetch,
  ListingImagesResponse,
  ListingImageSlot,
} from "@/lib/api";
import { cn, safeExternalUrl } from "@/lib/utils";
import { ADMIN_OVERVIEW_KEY, useAdminOverview } from "./useAdminOverview";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "External";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function AdminImagesPage() {
  const queryClient = useQueryClient();
  const { data: overview, isLoading: overviewLoading } = useAdminOverview();
  const listings = overview?.listings || [];

  const [selectedListingId, setSelectedListingId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).get("listingId") || "";
    }
    return "";
  });
  const [cacheNonce, setCacheNonce] = useState<number>(() => Date.now());
  const [uploadingSlot, setUploadingSlot] = useState<number | null>(null);
  const [deleteTargetSlot, setDeleteTargetSlot] = useState<number | null>(null);
  const [dragSourceSlot, setDragSourceSlot] = useState<number | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingUploadSlotRef = useRef<number | null>(null);

  useEffect(() => {
    if (listings.length > 0 && (!selectedListingId || !listings.some((l) => l.id === selectedListingId))) {
      setSelectedListingId(listings[0].id);
    }
  }, [listings, selectedListingId]);

  const selectedListing = listings.find((l) => l.id === selectedListingId) || null;

  const {
    data: imagesData,
    isLoading: imagesLoading,
    isFetching: imagesFetching,
    refetch,
  } = useQuery({
    queryKey: ["admin-listing-images", selectedListingId],
    queryFn: () =>
      apiFetch<ListingImagesResponse>(`/api/admin/listings/${selectedListingId}/images`),
    enabled: Boolean(selectedListingId),
    staleTime: 30_000,
  });

  const invalidateCatalogCaches = () => {
    setCacheNonce(Date.now());
    void queryClient.invalidateQueries({ queryKey: ["admin-listing-images", selectedListingId] });
    void queryClient.invalidateQueries({ queryKey: ADMIN_OVERVIEW_KEY });
    void queryClient.invalidateQueries({ queryKey: ["public-listings"] });
    void queryClient.invalidateQueries({ queryKey: ["public-status"] });
    void queryClient.invalidateQueries({ queryKey: ["history"] });
  };

  const reorderMutation = useMutation({
    mutationFn: ({ fromIndex, toIndex }: { fromIndex: number; toIndex: number }) =>
      apiFetch<ListingImagesResponse>(
        `/api/admin/listings/${selectedListingId}/images/reorder`,
        {
          method: "PUT",
          body: JSON.stringify({ fromIndex, toIndex, mode: "swap" }),
        }
      ),
    onSuccess: (res, vars) => {
      queryClient.setQueryData(["admin-listing-images", selectedListingId], res);
      invalidateCatalogCaches();
      toast.success(`Swapped Slot ${vars.fromIndex} with Slot ${vars.toIndex} in R2`);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to update image slot placement.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (slotIndex: number) =>
      apiFetch<ListingImagesResponse>(
        `/api/admin/listings/${selectedListingId}/images/${slotIndex}`,
        { method: "DELETE" }
      ),
    onSuccess: (res, slotIndex) => {
      setDeleteTargetSlot(null);
      queryClient.setQueryData(["admin-listing-images", selectedListingId], res);
      invalidateCatalogCaches();
      toast.success(`Removed image from Slot ${slotIndex}`);
    },
    onError: (err: Error) => {
      setDeleteTargetSlot(null);
      toast.error(err.message || "Failed to delete image slot.");
    },
  });

  const handleUploadTrigger = (slotIndex: number) => {
    pendingUploadSlotRef.current = slotIndex;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const slotIndex = pendingUploadSlotRef.current;
    e.target.value = "";
    pendingUploadSlotRef.current = null;

    if (!file || slotIndex === null || !selectedListingId) return;

    setUploadingSlot(slotIndex);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`/api/admin/listings/${selectedListingId}/images/${slotIndex}`, {
        method: "POST",
        credentials: "same-origin",
        body: formData,
      });
      const parsed = (await res.json()) as ListingImagesResponse & { error?: string };
      if (!res.ok) {
        throw new Error(parsed?.error || `Upload failed (${res.status})`);
      }

      queryClient.setQueryData(["admin-listing-images", selectedListingId], parsed);
      invalidateCatalogCaches();
      toast.success(`Uploaded image to Slot ${slotIndex} in R2 (everfall-media)`);
    } catch (err: any) {
      toast.error(err?.message || "Failed to upload image to R2.");
    } finally {
      setUploadingSlot(null);
    }
  };

  const handleSelectListing = (id: string) => {
    setSelectedListingId(id);
    if (typeof window !== "undefined") {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set("listingId", id);
      window.history.replaceState({}, "", nextUrl.toString());
    }
  };

  const handleDropOnSlot = (targetSlot: number) => {
    setDragOverSlot(null);
    if (dragSourceSlot === null || dragSourceSlot === targetSlot) {
      setDragSourceSlot(null);
      return;
    }
    const from = dragSourceSlot;
    setDragSourceSlot(null);
    reorderMutation.mutate({ fromIndex: from, toIndex: targetSlot });
  };

  const slots: ListingImageSlot[] = imagesData?.slots || [];
  const occupiedCount = slots.filter((s) => s.exists).length;

  return (
    <AppShell
      requireAdmin
      title="Image Manager & Placement"
      description="Upload, replace, and reorder up to 10 high-resolution angles per listing directly inside Cloudflare R2 (everfall-media)."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin">Overview</Link>
          </Button>
          {selectedListingId && (
            <Button variant="outline" size="sm" asChild>
              <Link to="/admin/metadata" search={{ listingId: selectedListingId } as any}>
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Edit Metadata
              </Link>
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            disabled={!selectedListingId || imagesFetching}
            onClick={() => void refetch()}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", imagesFetching && "animate-spin")} />
            Refresh Slots
          </Button>
        </div>
      }
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
        onChange={handleFileChange}
        className="hidden"
      />

      {overviewLoading ? (
        <div className="space-y-6">
          <Skeleton className="h-28 w-full rounded-xl" />
          <div className="grid gap-4 @xl/main:grid-cols-2 @4xl/main:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-64 w-full rounded-xl" />
            ))}
          </div>
        </div>
      ) : listings.length === 0 ? (
        <Card className="p-10 text-center">
          <Images className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No vehicle listings found in history yet. Run a store scan in Store Monitoring first.
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Listing Selector & R2 Environment Summary */}
          <Card>
            <CardContent className="flex flex-col gap-4 p-5 @3xl/main:flex-row @3xl/main:items-center @3xl/main:justify-between">
              <div className="flex-1 space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Selected Vehicle Listing
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  <Select value={selectedListingId} onValueChange={handleSelectListing}>
                    <SelectTrigger className="w-full sm:w-80">
                      <SelectValue placeholder="Choose a vehicle listing" />
                    </SelectTrigger>
                    <SelectContent>
                      {listings.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name} (#{item.id}) — {item.isAvailable ? "In Stock" : "Sold Out"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {selectedListing && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={selectedListing.isAvailable ? "success" : "destructive"}>
                        {selectedListing.isAvailable ? "In Stock" : "Sold Out"}
                      </Badge>
                      <Badge variant={imagesData?.r2Bound ? "info" : "secondary"}>
                        {imagesData?.r2Bound ? "R2: everfall-media" : "KV Fallback"}
                      </Badge>
                      <Badge variant="outline" className="tabular-nums">
                        {occupiedCount} / 10 Slots Filled
                      </Badge>
                    </div>
                  )}
                </div>
              </div>

              {selectedListing && (
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={
                      safeExternalUrl(selectedListing.url) ||
                      `https://store.everfallcommunity.com/package/${selectedListing.id}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-2 text-xs font-medium text-zinc-200 transition hover:bg-zinc-800 hover:text-white"
                  >
                    Open Everfall Package
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Placement Role Callout */}
          <div className="grid gap-3 @2xl/main:grid-cols-2">
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-950/20 p-3.5 text-xs">
              <Star className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <div>
                <p className="font-semibold text-amber-200">Slot 0 — Primary Card Thumbnail</p>
                <p className="mt-0.5 text-zinc-300">
                  Used as the default cover photo on homepage &amp; archive cards and first gallery panel in Discord drop alerts.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-sky-500/30 bg-sky-950/20 p-3.5 text-xs">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
              <div>
                <p className="font-semibold text-sky-200">Slot 3 — Live Widget Feature Photo</p>
                <p className="mt-0.5 text-zinc-300">
                  Displayed inside deployed <code className="text-white">/widget</code> embeds (falls back to Slot 0 when empty). Updates sync widgets automatically.
                </p>
              </div>
            </div>
          </div>

          {/* 10-Slot Interactive Grid & Placement Modifier */}
          <Card>
            <CardHeader className="flex flex-col gap-1 @xl/main:flex-row @xl/main:items-center @xl/main:justify-between">
              <div>
                <CardTitle>Image Slots (0 – 9)</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Drag and drop cards to swap positions, use arrow controls, or select an exact destination slot.
                </p>
              </div>
              {reorderMutation.isPending && (
                <span className="inline-flex items-center gap-1.5 text-xs text-amber-300">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Updating placement in R2...
                </span>
              )}
            </CardHeader>
            <CardContent>
              {imagesLoading ? (
                <div className="grid gap-4 @xl/main:grid-cols-2 @4xl/main:grid-cols-5">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <Skeleton key={i} className="h-72 w-full rounded-xl" />
                  ))}
                </div>
              ) : (
                <div className="grid gap-4 @xl/main:grid-cols-2 @3xl/main:grid-cols-3 @5xl/main:grid-cols-5">
                  {slots.map((slot) => {
                    const isPrimary = slot.index === 0;
                    const isWidgetSlot = slot.index === 3;
                    const isUploading = uploadingSlot === slot.index;
                    const isDragTarget = dragOverSlot === slot.index && dragSourceSlot !== slot.index;
                    const previewSrc = slot.url
                      ? slot.url.includes("/media/listings/")
                        ? `${slot.url}?v=${cacheNonce}`
                        : slot.url
                      : null;

                    return (
                      <div
                        key={`${selectedListingId}-slot-${slot.index}`}
                        draggable={slot.exists && !reorderMutation.isPending}
                        onDragStart={() => setDragSourceSlot(slot.index)}
                        onDragOver={(e) => {
                          e.preventDefault();
                          if (dragOverSlot !== slot.index) setDragOverSlot(slot.index);
                        }}
                        onDragLeave={() => {
                          if (dragOverSlot === slot.index) setDragOverSlot(null);
                        }}
                        onDrop={() => handleDropOnSlot(slot.index)}
                        onDragEnd={() => {
                          setDragSourceSlot(null);
                          setDragOverSlot(null);
                        }}
                        className={cn(
                          "group flex flex-col justify-between overflow-hidden rounded-xl border bg-zinc-950 transition-all",
                          isDragTarget
                            ? "border-emerald-400 ring-2 ring-emerald-500/40 scale-[1.01]"
                            : isPrimary
                            ? "border-amber-500/45"
                            : isWidgetSlot
                            ? "border-sky-500/45"
                            : "border-border hover:border-zinc-700"
                        )}
                      >
                        {/* Slot Header */}
                        <div className="flex items-center justify-between gap-2 border-b border-border bg-zinc-900/70 px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs font-bold text-white">
                              Slot {slot.index}
                            </span>
                            {isPrimary && (
                              <Badge variant="warning" className="px-1.5 py-0 text-[10px]">
                                Primary
                              </Badge>
                            )}
                            {isWidgetSlot && (
                              <Badge variant="info" className="px-1.5 py-0 text-[10px]">
                                Widget
                              </Badge>
                            )}
                          </div>
                          <span className="font-mono text-[10px] uppercase text-muted-foreground">
                            {slot.exists ? slot.storage : "empty"}
                          </span>
                        </div>

                        {/* Image Viewport */}
                        <div className="relative aspect-[16/10] w-full bg-zinc-900/50">
                          {isUploading ? (
                            <div className="flex h-full flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
                              <Loader2 className="h-6 w-6 animate-spin text-zinc-200" />
                              <span>Uploading to R2...</span>
                            </div>
                          ) : previewSrc ? (
                            <img
                              src={previewSrc}
                              alt={`Slot ${slot.index}`}
                              referrerPolicy="no-referrer"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleUploadTrigger(slot.index)}
                              className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-xs text-muted-foreground transition hover:bg-zinc-900 hover:text-zinc-200 cursor-pointer"
                            >
                              <ImagePlus className="h-6 w-6 text-zinc-500" />
                              <span>Upload Image</span>
                            </button>
                          )}
                        </div>

                        {/* Controls & Placement Modifier */}
                        <div className="space-y-2.5 p-3">
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
                            <span>{slot.exists ? formatFileSize(slot.size) : "No asset"}</span>
                            <span className="truncate font-mono max-w-[95px]">
                              {slot.contentType ? slot.contentType.replace("image/", "") : "—"}
                            </span>
                          </div>

                          {/* Upload / Delete Row */}
                          <div className="flex items-center gap-1.5">
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={isUploading}
                              onClick={() => handleUploadTrigger(slot.index)}
                              className="h-8 flex-1 px-2 text-xs"
                            >
                              <Upload className="h-3 w-3" />
                              {slot.exists ? "Replace" : "Upload"}
                            </Button>

                            {slot.exists && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="destructive"
                                    size="icon"
                                    aria-label={`Delete slot ${slot.index}`}
                                    disabled={deleteMutation.isPending}
                                    onClick={() => setDeleteTargetSlot(slot.index)}
                                    className="h-8 w-8 shrink-0"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Delete slot {slot.index} from R2</TooltipContent>
                              </Tooltip>
                            )}
                          </div>

                          {/* Placement Modifier Row */}
                          {slot.exists && (
                            <div className="space-y-1.5 border-t border-border/80 pt-2">
                              <div className="flex items-center gap-1">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      disabled={slot.index === 0 || reorderMutation.isPending}
                                      onClick={() =>
                                        reorderMutation.mutate({
                                          fromIndex: slot.index,
                                          toIndex: slot.index - 1,
                                        })
                                      }
                                      className="h-7 flex-1 px-1.5 text-[11px]"
                                    >
                                      <ArrowLeft className="h-3 w-3" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Swap left (to Slot {slot.index - 1})</TooltipContent>
                                </Tooltip>

                                <Select
                                  value={String(slot.index)}
                                  onValueChange={(target) => {
                                    const targetIdx = Number(target);
                                    if (targetIdx !== slot.index) {
                                      reorderMutation.mutate({
                                        fromIndex: slot.index,
                                        toIndex: targetIdx,
                                      });
                                    }
                                  }}
                                >
                                  <SelectTrigger
                                    aria-label={`Move slot ${slot.index}`}
                                    className="h-7 flex-[2] px-2 text-[11px]"
                                  >
                                    <ArrowLeftRight className="mr-1 h-3 w-3 shrink-0 text-muted-foreground" />
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {Array.from({ length: 10 }, (_, idx) => (
                                      <SelectItem key={idx} value={String(idx)}>
                                        {idx === 0
                                          ? "Slot 0 (Primary)"
                                          : idx === 3
                                          ? "Slot 3 (Widget)"
                                          : `Slot ${idx}`}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>

                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      disabled={slot.index === 9 || reorderMutation.isPending}
                                      onClick={() =>
                                        reorderMutation.mutate({
                                          fromIndex: slot.index,
                                          toIndex: slot.index + 1,
                                        })
                                      }
                                      className="h-7 flex-1 px-1.5 text-[11px]"
                                    >
                                      <ArrowRight className="h-3 w-3" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Swap right (to Slot {slot.index + 1})</TooltipContent>
                                </Tooltip>
                              </div>

                              <div className="flex gap-1">
                                {slot.index !== 0 && (
                                  <button
                                    type="button"
                                    disabled={reorderMutation.isPending}
                                    onClick={() =>
                                      reorderMutation.mutate({ fromIndex: slot.index, toIndex: 0 })
                                    }
                                    className="flex-1 rounded border border-border/80 bg-zinc-900 py-1 text-[10px] font-medium text-amber-300 transition hover:bg-zinc-800 cursor-pointer"
                                  >
                                    Make Primary (0)
                                  </button>
                                )}
                                {slot.index !== 3 && (
                                  <button
                                    type="button"
                                    disabled={reorderMutation.isPending}
                                    onClick={() =>
                                      reorderMutation.mutate({ fromIndex: slot.index, toIndex: 3 })
                                    }
                                    className="flex-1 rounded border border-border/80 bg-zinc-900 py-1 text-[10px] font-medium text-sky-300 transition hover:bg-zinc-800 cursor-pointer"
                                  >
                                    Set Widget (3)
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteTargetSlot !== null}
        onOpenChange={(open) => !open && setDeleteTargetSlot(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Image Slot {deleteTargetSlot}</DialogTitle>
            <DialogDescription>
              This deletes the image from Cloudflare R2 (<code className="text-white">everfall-media</code>) and purges cached copies for this slot.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTargetSlot(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending || deleteTargetSlot === null}
              onClick={() => {
                if (deleteTargetSlot !== null) deleteMutation.mutate(deleteTargetSlot);
              }}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete Image"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
