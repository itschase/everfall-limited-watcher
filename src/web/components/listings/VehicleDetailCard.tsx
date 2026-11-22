import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CarFront,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  Images,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { ListingItem } from "@/lib/api";
import { resolveListingPresentation, sortAndFilterFeatures } from "../../../shared/features";
import { cn, formatLocalDateTime, safeExternalUrl } from "@/lib/utils";
import {
  FeatureChipList,
  StockStatusPill,
} from "@/components/listings/VehicleCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface VehicleDetailCardProps {
  listing: ListingItem;
  onClose: () => void;
  closeLabel?: string;
  isAdmin?: boolean;
  className?: string;
}

export function VehicleDetailCard({
  listing,
  onClose,
  closeLabel = "Back to Limited Drop History",
  isAdmin = false,
  className,
}: VehicleDetailCardProps) {
  const images = Array.isArray(listing.images) ? listing.images : [];
  const [activeIdx, setActiveIdx] = useState(0);
  const [failedUrls, setFailedUrls] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState(false);

  useEffect(() => {
    setActiveIdx(0);
    setFailedUrls({});
    setCopiedId(false);
  }, [listing.id]);

  const safeIdx = images.length > 0 ? Math.min(activeIdx, images.length - 1) : 0;
  const currentImg = images[safeIdx];
  const imgBroken = !currentImg || failedUrls[currentImg];

  const presentation =
    listing.presentation ||
    resolveListingPresentation({
      id: listing.id,
      name: listing.name,
      description: listing.description,
      url: listing.url,
      images: listing.images,
    });

  const displayName = presentation.effective.name;
  const cardFeatures = sortAndFilterFeatures(presentation.effective.features, "card");
  const listingUrl =
    safeExternalUrl(listing.url) ||
    `https://store.everfallcommunity.com/package/${encodeURIComponent(listing.id)}`;

  const markBroken = (url: string) => {
    setFailedUrls((prev) => ({ ...prev, [url]: true }));
  };

  const handleCopyId = () => {
    navigator.clipboard.writeText(listing.id).catch(() => {});
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          <ArrowLeft className="h-4 w-4" />
          {closeLabel}
        </Button>
      </div>

      <Card className="overflow-hidden border-border/90 bg-card/95 shadow-[0_8px_32px_rgba(0,0,0,0.45)]">
        {/* Card Header */}
        <div className="relative border-b border-border py-4 pl-4 pr-16 sm:py-5 sm:pl-6 sm:pr-20">
          <div className="min-w-0 space-y-2 break-words">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                {displayName}
              </h2>

              <StockStatusPill listingId={listing.id} isAvailable={listing.isAvailable} />
              {listing.isAvailable && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold tracking-wider text-amber-200">
                  NEW LIMITED DROP
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handleCopyId}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border/80 bg-zinc-900/80 px-2.5 py-1 font-mono text-xs text-zinc-300 transition hover:border-zinc-600 hover:text-white cursor-pointer"
                  >
                    {copiedId ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copied #{listing.id}</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 text-zinc-500" />
                        <span>Package ID #{listing.id}</span>
                      </>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent>Copy package ID #{listing.id}</TooltipContent>
              </Tooltip>

              {!listing.isAvailable && (
                <span className="text-xs text-zinc-400">
                  Saved in the vehicle archive
                </span>
              )}
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close expanded vehicle listing"
            title="Close and return to History"
            className="absolute right-4 top-4 h-10 w-10 rounded-lg border border-border/70 bg-zinc-900/70 text-zinc-300 hover:bg-zinc-800 hover:text-white sm:right-6 sm:top-5"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Expanded Gallery Viewport */}
        <div className="relative aspect-[16/10] max-h-[460px] w-full overflow-hidden border-b border-border bg-zinc-950">
          {!imgBroken ? (
            <img
              src={currentImg}
              alt={displayName}
              referrerPolicy="no-referrer"
              onError={() => markBroken(currentImg)}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-zinc-900/70 text-muted-foreground">
              <CarFront className="h-12 w-12 text-white/30" />
              <span className="text-xs font-medium text-muted-foreground">
                Preview Unavailable
              </span>
            </div>
          )}

          {images.length > 1 && (
            <>
              <button
                type="button"
                aria-label="Previous vehicle image"
                onClick={() =>
                  setActiveIdx((prev) => (prev - 1 + images.length) % images.length)
                }
                className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-lg border border-white/15 bg-black/70 p-2 text-white/85 transition hover:bg-black/90 hover:text-white cursor-pointer"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                aria-label="Next vehicle image"
                onClick={() => setActiveIdx((prev) => (prev + 1) % images.length)}
                className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-lg border border-white/15 bg-black/70 p-2 text-white/85 transition hover:bg-black/90 hover:text-white cursor-pointer"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              <div className="absolute bottom-3 right-3 z-10 rounded-md border border-white/15 bg-black/75 px-2.5 py-1 text-xs font-medium text-zinc-200 tabular-nums backdrop-blur-sm">
                {safeIdx + 1} / {images.length}
              </div>
            </>
          )}
        </div>

        {/* Thumbnail Strip */}
        {images.length > 1 && (
          <div className="thin-scrollbar flex items-center gap-2 overflow-x-auto border-b border-border bg-zinc-900/80 px-4 py-2.5 sm:px-6">
            {images.map((src, idx) => (
              <button
                key={`${listing.id}-detail-thumb-${idx}`}
                type="button"
                onClick={() => setActiveIdx(idx)}
                aria-label={`View image ${idx + 1} of ${displayName}`}
                className={cn(
                  "relative h-12 w-20 shrink-0 overflow-hidden rounded-md border transition cursor-pointer sm:h-14 sm:w-24",
                  idx === safeIdx
                    ? "border-primary ring-1 ring-primary"
                    : "border-white/10 opacity-65 hover:opacity-100"
                )}
              >
                {!failedUrls[src] ? (
                  <img
                    src={src}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={() => markBroken(src)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-secondary">
                    <CarFront className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Details, Features, Timestamps & Description */}
        <div className="space-y-5 p-4 sm:p-6">
          <FeatureChipList features={cardFeatures} />

          {/* Timestamps & Metadata Grid */}
          <div className="grid gap-3 rounded-lg border border-border bg-zinc-950 p-4 text-xs sm:grid-cols-2 lg:grid-cols-3 sm:p-5 tabular-nums">
            <div>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Clock className="h-3.5 w-3.5 text-zinc-500" />
                First Recorded
              </span>
              <p className="mt-1 font-medium text-white">
                {formatLocalDateTime(listing.detectedAt)}
              </p>
            </div>
            <div>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-zinc-500" />
                Last Checked
              </span>
              <p className="mt-1 font-medium text-white">
                {formatLocalDateTime(listing.lastVerifiedAt)}
              </p>
            </div>
            {listing.soldOutAt && (
              <div>
                <span className="text-muted-foreground">Confirmed Unavailable</span>
                <p className="mt-1 font-medium text-red-300">
                  {formatLocalDateTime(listing.soldOutAt)}
                </p>
              </div>
            )}
            <div>
              <span className="text-muted-foreground">Current Stock</span>
              <p
                className={cn(
                  "mt-1 font-medium",
                  listing.isAvailable ? "text-emerald-400" : "text-red-400"
                )}
              >
                {listing.isAvailable ? "Available in Store" : "Sold Out"}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Saved Photos</span>
              <p className="mt-1 font-medium text-zinc-200">
                {images.length} angle{images.length === 1 ? "" : "s"}
              </p>
            </div>
            <details className="min-w-0">
              <summary className="cursor-pointer text-muted-foreground">Technical Details</summary>
              <span className="mt-2 block text-muted-foreground">Last store response</span>
              <p className="mt-1 font-mono font-medium text-zinc-200">
                {listing.lastHttpStatus ? `HTTP ${listing.lastHttpStatus}` : "Archived Record"}
              </p>
            </details>
            {presentation.effective.tradingRestriction && (
              <div>
                <span className="text-muted-foreground">Trading Rule</span>
                <p className="mt-1 font-medium text-zinc-200">
                  {presentation.effective.tradingRestriction}
                </p>
              </div>
            )}
            {presentation.effective.deliveryInfo && (
              <div>
                <span className="text-muted-foreground">Delivery</span>
                <p className="mt-1 font-medium text-zinc-200">
                  {presentation.effective.deliveryInfo}
                </p>
              </div>
            )}
          </div>

          {/* Full Description */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Vehicle Description
            </h3>
            <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-300">
              {presentation.effective.fullDescription ||
                "No store description is available for this vehicle."}
            </p>
          </div>

          {/* Action Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="w-full sm:w-auto"
            >
              <ArrowLeft className="h-4 w-4" />
              Close Listing
            </Button>

            <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
              {isAdmin && (
                <>
                  <a
                    href={`/admin/metadata?listingId=${encodeURIComponent(listing.id)}`}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-secondary px-4 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800 hover:text-white sm:w-auto"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    Edit Metadata
                  </a>
                  <a
                    href={`/admin/images?listingId=${encodeURIComponent(listing.id)}`}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-secondary px-4 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800 hover:text-white sm:w-auto"
                  >
                    <Images className="h-3.5 w-3.5" />
                    Edit Image Set
                  </a>
                </>
              )}

              <a
                href={
                  listing.isAvailable
                    ? listingUrl
                    : "https://store.everfallcommunity.com/"
                }
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition sm:w-auto",
                  listing.isAvailable
                    ? "bg-primary text-primary-foreground hover:bg-zinc-200"
                    : "border border-border bg-secondary text-zinc-200 hover:bg-zinc-800 hover:text-white"
                )}
              >
                {listing.isAvailable
                  ? "View Package on Everfall"
                  : "Open Everfall Store"}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
