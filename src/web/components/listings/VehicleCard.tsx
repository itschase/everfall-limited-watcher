import { ListingPrice } from "./ListingPrice";
import { useState } from "react";
import {
  ArrowRight,
  Award,
  CarFront,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  Flame,
  Gauge,
  Images,
  Loader2,
  Maximize2,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  Tag,
  Volume2,
  Wrench,
  Zap,
} from "lucide-react";
import { FeatureIconName, ListingItem, VehicleFeature } from "@/lib/api";
import { resolveListingPresentation, sortAndFilterFeatures } from "../../../shared/features";
import { cn, formatLocalDateTime, safeExternalUrl } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface VehicleCardProps {
  listing: ListingItem;
  isRefreshing?: boolean;
  onInspect?: (listing: ListingItem) => void;
  editImagesHref?: string;
  editMetadataHref?: string;
  className?: string;
}

export function StockStatusPill({
  isAvailable,
  isRefreshing,
}: {
  isAvailable: boolean;
  isRefreshing?: boolean;
}) {
  if (isRefreshing) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/75 px-3 py-1 text-xs font-medium text-zinc-200 backdrop-blur-md">
        <Loader2 className="h-3 w-3 animate-spin text-zinc-300" />
        Refreshing
      </span>
    );
  }

  if (isAvailable) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-950/80 px-3 py-1 text-xs font-semibold text-emerald-300 backdrop-blur-md shadow-[0_0_14px_rgba(16,185,129,0.35)]">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-80 duration-1000" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,1)]" />
        </span>
        In Stock
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-zinc-700/60 bg-zinc-900/90 px-3 py-1 text-xs font-medium text-zinc-400 backdrop-blur-md">
      <span className="h-2 w-2 rounded-full bg-zinc-500" />
      Sold Out
    </span>
  );
}

export function FeatureBadgeIcon({
  icon,
  className,
}: {
  icon: FeatureIconName;
  className?: string;
}) {
  switch (icon) {
    case "sparkles":
      return <Sparkles className={cn("h-3 w-3", className)} />;
    case "volume":
      return <Volume2 className={cn("h-3 w-3", className)} />;
    case "wrench":
      return <Wrench className={cn("h-3 w-3", className)} />;
    case "clock":
      return <Clock className={cn("h-3 w-3", className)} />;
    case "shield":
      return <Shield className={cn("h-3 w-3", className)} />;
    case "zap":
      return <Zap className={cn("h-3 w-3", className)} />;
    case "star":
      return <Star className={cn("h-3 w-3", className)} />;
    case "gauge":
      return <Gauge className={cn("h-3 w-3", className)} />;
    case "flame":
      return <Flame className={cn("h-3 w-3", className)} />;
    case "award":
      return <Award className={cn("h-3 w-3", className)} />;
    case "check":
      return <Check className={cn("h-3 w-3", className)} />;
    default:
      return <Tag className={cn("h-3 w-3", className)} />;
  }
}

export function FeatureChipList({
  features,
  className,
}: {
  features: VehicleFeature[];
  className?: string;
}) {
  if (!features.length) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {features.map((feat) => {
        const isQuantity = feat.key === "quantity_limited";
        const isTime = feat.key === "time_limited";
        return (
          <span
            key={feat.key}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium",
              isQuantity
                ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                : isTime
                  ? "border-sky-500/40 bg-sky-500/10 text-sky-300"
                  : "border-zinc-800 bg-zinc-900/60 text-zinc-300"
            )}
          >
            <FeatureBadgeIcon
              icon={feat.icon}
              className={
                isQuantity
                  ? "text-amber-400"
                  : isTime
                    ? "text-sky-400"
                    : "text-zinc-400"
              }
            />
            <span>{feat.label}</span>
          </span>
        );
      })}
    </div>
  );
}

export function VehicleCard({
  listing,
  isRefreshing,
  onInspect,
  editImagesHref,
  editMetadataHref,
  className,
}: VehicleCardProps) {
  const images = Array.isArray(listing.images) ? listing.images : [];
  const [activeIdx, setActiveIdx] = useState(0);
  const [failedUrls, setFailedUrls] = useState<Record<string, boolean>>({});
  const [isExpanded, setIsExpanded] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  const safeIdx = images.length > 0 ? Math.min(activeIdx, images.length - 1) : 0;
  const currentImg = images[safeIdx];
  const imgBroken = !currentImg || failedUrls[currentImg];
  const listingUrl =
    safeExternalUrl(listing.url) ||
    `https://store.everfallcommunity.com/package/${listing.id}`;

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
  const conciseSummary = presentation.effective.shortDescription;
  const cardFeatures = sortAndFilterFeatures(
    presentation.effective.features,
    "card"
  );

  const markBroken = (url: string) => {
    setFailedUrls((prev) => ({ ...prev, [url]: true }));
  };

  const handleCopyId = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(listing.id).catch(() => {});
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleCardInspect = () => {
    if (!onInspect) return;
    if (typeof window !== "undefined" && window.getSelection()?.toString().trim()) {
      return;
    }
    onInspect(listing);
  };

  return (
    <Card
      onClick={onInspect ? handleCardInspect : undefined}
      className={cn(
        "group relative flex h-full flex-col overflow-hidden border-border/80 bg-card/95 transition-all duration-200 hover:border-zinc-700 hover:shadow-[0_4px_24px_rgba(0,0,0,0.5)]",
        onInspect && "cursor-pointer",
        className
      )}
    >
      {/* Image Viewport */}
      <div
        data-preview-region="vehicle-images"
        role={onInspect ? "button" : undefined}
        tabIndex={onInspect ? 0 : undefined}
        onClick={(e) => {
          e.stopPropagation();
          handleCardInspect();
        }}
        onKeyDown={(e) => {
          if (onInspect && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onInspect(listing);
          }
        }}
        title={onInspect ? "Click to inspect vehicle details & gallery" : undefined}
        className={cn(
          "group/img relative aspect-[16/10] w-full overflow-hidden border-b border-border bg-zinc-950",
          onInspect && "cursor-pointer"
        )}
      >
        {!imgBroken ? (
          <img
            src={currentImg}
            alt={displayName}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => markBroken(currentImg)}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-zinc-900/70 text-muted-foreground">
            <CarFront className="h-9 w-9 text-white/30" />
            <span className="text-xs font-medium text-muted-foreground">
              Preview Unavailable
            </span>
          </div>
        )}

        {onInspect && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity duration-150 group-hover/img:opacity-100">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/75 px-3 py-1.5 text-xs font-semibold text-white shadow-lg backdrop-blur-md">
              <Maximize2 className="h-3.5 w-3.5" />
              View in Full
            </span>
          </div>
        )}

        {listing.isAvailable && (
          <div className="pointer-events-none absolute left-3 top-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-500/20 px-3 py-1 text-[11px] font-bold tracking-wider text-amber-200 backdrop-blur-md shadow-[0_0_18px_rgba(245,158,11,0.35)]">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-80" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,1)]" />
              </span>
              NEW LIMITED DROP
            </span>
          </div>
        )}

        <div data-preview-region="vehicle-stock" className="pointer-events-none absolute right-3 top-3">
          <StockStatusPill
            isAvailable={listing.isAvailable}
            isRefreshing={isRefreshing}
          />
        </div>

        {images.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous image"
              onClick={(e) => {
                e.stopPropagation();
                setActiveIdx((prev) => (prev - 1 + images.length) % images.length);
              }}
              className="absolute left-2.5 top-1/2 z-10 -translate-y-1/2 rounded-lg border border-white/10 bg-black/60 p-1.5 text-white/80 transition hover:bg-black/80 hover:text-white cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Next image"
              onClick={(e) => {
                e.stopPropagation();
                setActiveIdx((prev) => (prev + 1) % images.length);
              }}
              className="absolute right-2.5 top-1/2 z-10 -translate-y-1/2 rounded-lg border border-white/10 bg-black/60 p-1.5 text-white/80 transition hover:bg-black/80 hover:text-white cursor-pointer"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <div className="absolute bottom-2.5 right-3 z-10 rounded-md border border-white/10 bg-black/65 px-2 py-0.5 text-[11px] font-medium text-zinc-200 tabular-nums backdrop-blur-sm">
              {safeIdx + 1} / {images.length}
            </div>
          </>
        )}
      </div>

      {/* Thumbnail Strip */}
      {images.length > 1 && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="thin-scrollbar flex items-center gap-1.5 overflow-x-auto overscroll-x-contain border-b border-border bg-zinc-900/80 px-3 py-2"
        >
          {images.map((src, idx) => (
            <button
              key={`${listing.id}-thumb-${idx}`}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setActiveIdx(idx);
              }}
              aria-label={`View image ${idx + 1} of ${displayName}`}
              className={cn(
                "relative h-10 w-16 shrink-0 overflow-hidden rounded-md border transition cursor-pointer",
                idx === safeIdx
                  ? "border-primary ring-1 ring-primary"
                  : "border-white/10 opacity-60 hover:opacity-100"
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
                  <CarFront className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Body */}
      <div className="flex flex-1 flex-col justify-between p-5">
        <div>
          <div data-preview-region="vehicle-title" className="flex items-start justify-between gap-3">
            {onInspect ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onInspect(listing);
                }}
                className="min-w-0 break-words text-left text-lg font-bold tracking-tight text-white transition-colors hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded cursor-pointer"
              >
                {displayName}
              </button>
            ) : (
              <h3 className="min-w-0 break-words text-lg font-bold tracking-tight text-white">
                {displayName}
              </h3>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleCopyId}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border/80 bg-zinc-900/80 px-2 py-0.5 font-mono text-[11px] text-muted-foreground transition hover:border-zinc-600 hover:text-white cursor-pointer"
                >
                  {copiedId ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3 text-zinc-500" />
                      <span>#{listing.id}</span>
                    </>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>Copy package ID #{listing.id}</TooltipContent>
            </Tooltip>
          </div>

          {/* Normalized Features (Quantity Limited -> Custom Sound -> Custom Options) */}

          <div data-preview-region="vehicle-features"><FeatureChipList features={cardFeatures} className="mt-2.5" /></div>

          {/* Timestamps */}
          <div data-preview-region="vehicle-times" className="mt-3 space-y-1 text-xs text-muted-foreground tabular-nums">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
              <span>First Recorded: {formatLocalDateTime(listing.detectedAt)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
              <span>Last Checked: {formatLocalDateTime(listing.lastVerifiedAt)}</span>
            </div>
          </div>

          {/* Concise Normalized Summary */}
          <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-zinc-300">
            {conciseSummary}
          </p>

          {/* Expandable Metadata Disclosure */}
          <div className="mt-3" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded((prev) => !prev);
              }}
              className="inline-flex items-center gap-1 text-xs font-medium text-zinc-400 transition hover:text-white cursor-pointer"
            >
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 transition-transform duration-200",
                  isExpanded && "rotate-180"
                )}
              />
              <span>
                {isExpanded ? "Hide Metadata & Specs" : "View Metadata & Specs"}
              </span>
            </button>

            {isExpanded && (
              <div className="mt-3 rounded-lg border border-border/80 bg-zinc-950/90 p-3.5 text-xs text-muted-foreground space-y-2.5">
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <span className="block text-[11px] uppercase tracking-wider text-zinc-500">
                      Package ID
                    </span>
                    <span className="font-mono font-medium text-zinc-200">
                      {listing.id}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[11px] uppercase tracking-wider text-zinc-500">
                      Store Status
                    </span>
                    <span className="font-mono font-medium text-zinc-200">
                      {listing.lastHttpStatus
                        ? `HTTP ${listing.lastHttpStatus}`
                        : "Verified Active"}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[11px] uppercase tracking-wider text-zinc-500">
                      Current Stock
                    </span>
                    <span
                      className={cn(
                        "font-medium",
                        listing.isAvailable ? "text-emerald-400" : "text-red-400"
                      )}
                    >
                      {listing.isAvailable
                        ? "Available in Store"
                        : "Sold Out"}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[11px] uppercase tracking-wider text-zinc-500">
                      Saved Photos
                    </span>
                    <span className="font-medium text-zinc-200">
                      {images.length} angle{images.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  {presentation.effective.tradingRestriction && (
                    <div>
                      <span className="block text-[11px] uppercase tracking-wider text-zinc-500">
                        Trading
                      </span>
                      <span className="font-medium text-zinc-200">
                        {presentation.effective.tradingRestriction}
                      </span>
                    </div>
                  )}
                  {presentation.effective.deliveryInfo && (
                    <div>
                      <span className="block text-[11px] uppercase tracking-wider text-zinc-500">
                        Delivery
                      </span>
                      <span className="font-medium text-zinc-200">
                        Garage Auto-Delivery
                      </span>
                    </div>
                  )}
                  {listing.soldOutAt && (
                    <div className="col-span-2">
                      <span className="block text-[11px] uppercase tracking-wider text-zinc-500">
                        Confirmed Sold Out
                      </span>
                      <span className="font-medium text-red-300">
                        {formatLocalDateTime(listing.soldOutAt)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Action Row (No redundant Inspect button — title & card open modal) */}
        <div
          data-preview-region="vehicle-links"
          className="mt-5 border-t border-border pt-4"
          onClick={(e) => e.stopPropagation()}
        >
          {listing.isAvailable ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-full text-sm font-semibold text-emerald-400">In Stock<ListingPrice id={listing.id} inStock inline /></span>
              <a
                href={listingUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-zinc-200"
              >
                View on Everfall
                <ArrowRight className="h-4 w-4" />
              </a>
              {editMetadataHref && (
                <a
                  href={editMetadataHref}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-secondary px-2.5 py-2.5 text-xs font-medium text-zinc-200 transition hover:bg-zinc-800 hover:text-white"
                  title="Edit vehicle metadata & features"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                </a>
              )}
              {editImagesHref && (
                <a
                  href={editImagesHref}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-secondary px-2.5 py-2.5 text-xs font-medium text-zinc-200 transition hover:bg-zinc-800 hover:text-white"
                  title="Manage & reorder listing images in R2"
                >
                  <Images className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <span className="text-sm font-semibold text-red-400">Sold Out<ListingPrice id={listing.id} inStock={false} inline /></span>
              <div className="flex flex-wrap items-center gap-2">
                {editMetadataHref && (
                  <a
                    href={editMetadataHref}
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 rounded-lg border border-border bg-secondary px-2.5 py-2 text-xs font-medium text-zinc-200 transition hover:bg-zinc-800 hover:text-white"
                    title="Edit Vehicle Metadata"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                  </a>
                )}
                {editImagesHref && (
                  <a
                    href={editImagesHref}
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 rounded-lg border border-border bg-secondary px-2.5 py-2 text-xs font-medium text-zinc-200 transition hover:bg-zinc-800 hover:text-white"
                    title="Edit Image Set in R2"
                  >
                    <Images className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Images</span>
                  </a>
                )}
                <a
                  href="https://store.everfallcommunity.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3.5 py-2 text-xs font-medium text-zinc-200 transition hover:bg-zinc-800 hover:text-white"
                >
                  Store
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
