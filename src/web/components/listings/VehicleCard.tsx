import { useState } from "react";
import {
  ArrowRight,
  CarFront,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  Layers,
  Loader2,
  Maximize2,
  ShieldCheck,
  Sparkles,
  Volume2,
  Wrench,
} from "lucide-react";
import { ListingItem } from "@/lib/api";
import { cn, formatLocalDateTime, safeExternalUrl } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface VehicleCardProps {
  listing: ListingItem;
  isRefreshing?: boolean;
  onInspect?: (listing: ListingItem) => void;
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

function extractListingPerks(description: string) {
  const perks: { label: string; icon: "sound" | "custom" | "trade" | "delivery" | "sparkles" }[] = [];
  const lower = description.toLowerCase();

  if (lower.includes("custom sound") || lower.includes("sound profile") || lower.includes("engine sound")) {
    perks.push({ label: "Custom Sound", icon: "sound" });
  }
  const customMatch = description.match(/(\d+\+?)\s*(?:cosmetic\s*)?customization/i);
  if (customMatch) {
    perks.push({ label: `${customMatch[1]} Custom Options`, icon: "custom" });
  } else if (lower.includes("customization")) {
    perks.push({ label: "Custom Options", icon: "custom" });
  }
  if (lower.includes("trade") || lower.includes("traded")) {
    perks.push({ label: "Limited Trade Only", icon: "trade" });
  }
  if (lower.includes("garage") || lower.includes("delivered")) {
    perks.push({ label: "Auto-Delivered", icon: "delivery" });
  }
  if (lower.includes("quantity-limited") || lower.includes("limited")) {
    perks.push({ label: "Quantity-Limited", icon: "sparkles" });
  }
  return perks;
}

export function VehicleCard({ listing, isRefreshing, onInspect, className }: VehicleCardProps) {
  const images = Array.isArray(listing.images) ? listing.images : [];
  const [activeIdx, setActiveIdx] = useState(0);
  const [failedUrls, setFailedUrls] = useState<Record<string, boolean>>({});
  const [isExpanded, setIsExpanded] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  const safeIdx = images.length > 0 ? Math.min(activeIdx, images.length - 1) : 0;
  const currentImg = images[safeIdx];
  const imgBroken = !currentImg || failedUrls[currentImg];
  const listingUrl = safeExternalUrl(listing.url) || `https://store.everfallcommunity.com/package/${listing.id}`;
  const perks = extractListingPerks(listing.description);

  const markBroken = (url: string) => {
    setFailedUrls((prev) => ({ ...prev, [url]: true }));
  };

  const handleCopyId = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(listing.id).catch(() => {});
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  return (
    <Card
      className={cn(
        "group flex h-full flex-col overflow-hidden border-border/80 bg-card/95 transition-all duration-200 hover:border-zinc-700 hover:shadow-[0_4px_24px_rgba(0,0,0,0.5)]",
        className
      )}
    >
      {/* Image Viewport */}
      <div className="relative aspect-[16/10] w-full overflow-hidden border-b border-border bg-zinc-950">
        {!imgBroken ? (
          <img
            src={currentImg}
            alt={listing.name}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => markBroken(currentImg)}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-zinc-900/70 text-muted-foreground">
            <CarFront className="h-9 w-9 text-white/30" />
            <span className="text-xs font-medium text-muted-foreground">Preview Unavailable</span>
          </div>
        )}

        {/* Top-left NEW LIMITED DROP badge with glowing radar dot (Strictly visible ONLY when In Stock) */}
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

        {/* Top-right Stock Status badge with glowing radar beacon */}
        <div className="pointer-events-none absolute right-3 top-3">
          <StockStatusPill isAvailable={listing.isAvailable} isRefreshing={isRefreshing} />
        </div>

        {/* Image pagination arrows when multiple images exist */}
        {images.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous image"
              onClick={() => setActiveIdx((prev) => (prev - 1 + images.length) % images.length)}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 rounded-lg border border-white/10 bg-black/60 p-1.5 text-white/80 transition hover:bg-black/80 hover:text-white cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Next image"
              onClick={() => setActiveIdx((prev) => (prev + 1) % images.length)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg border border-white/10 bg-black/60 p-1.5 text-white/80 transition hover:bg-black/80 hover:text-white cursor-pointer"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <div className="absolute bottom-2.5 right-3 rounded-md border border-white/10 bg-black/65 px-2 py-0.5 text-[11px] font-medium text-zinc-200 tabular-nums backdrop-blur-sm">
              {safeIdx + 1} / {images.length}
            </div>
          </>
        )}
      </div>

      {/* Thumbnail Strip */}
      {images.length > 1 && (
        <div className="thin-scrollbar flex items-center gap-1.5 overflow-x-auto border-b border-border bg-zinc-900/80 px-3 py-2">
          {images.map((src, idx) => (
            <button
              key={`${listing.id}-thumb-${idx}`}
              type="button"
              onClick={() => setActiveIdx(idx)}
              aria-label={`View image ${idx + 1} of ${listing.name}`}
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
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-lg font-bold tracking-tight text-white">{listing.name}</h3>
            <button
              type="button"
              onClick={handleCopyId}
              title="Click to copy package ID"
              className="inline-flex items-center gap-1 rounded-md border border-border/80 bg-zinc-900/80 px-2 py-0.5 font-mono text-[11px] text-muted-foreground transition hover:border-zinc-600 hover:text-white cursor-pointer"
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
          </div>

          {/* Quick Perks / Feature Tags */}
          {perks.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {perks.map((perk) => (
                <span
                  key={perk.label}
                  className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-0.5 text-[11px] font-medium text-zinc-300"
                >
                  {perk.icon === "sound" && <Volume2 className="h-3 w-3 text-zinc-400" />}
                  {perk.icon === "custom" && <Wrench className="h-3 w-3 text-zinc-400" />}
                  {perk.icon === "sparkles" && <Sparkles className="h-3 w-3 text-amber-400" />}
                  {perk.label}
                </span>
              ))}
            </div>
          )}

          {/* Timestamps */}
          <div className="mt-3 space-y-1 text-xs text-muted-foreground tabular-nums">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
              <span>First Detected: {formatLocalDateTime(listing.detectedAt)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
              <span>Last Verified: {formatLocalDateTime(listing.lastVerifiedAt)}</span>
            </div>
          </div>

          <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-zinc-300">
            {listing.description}
          </p>

          {/* Expandable Metadata Disclosure Button */}
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              className="inline-flex items-center gap-1 text-xs font-medium text-zinc-400 transition hover:text-white cursor-pointer"
            >
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition-transform duration-200", isExpanded && "rotate-180")}
              />
              <span>{isExpanded ? "Hide Metadata & Specs" : "View Metadata & Specs"}</span>
            </button>

            {/* Expanded Detailed Metadata Panel */}
            {isExpanded && (
              <div className="mt-3 rounded-lg border border-border/80 bg-zinc-950/90 p-3.5 text-xs text-muted-foreground">
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <span className="block text-[11px] uppercase tracking-wider text-zinc-500">Package ID</span>
                    <span className="font-mono font-medium text-zinc-200">{listing.id}</span>
                  </div>
                  <div>
                    <span className="block text-[11px] uppercase tracking-wider text-zinc-500">Store Status</span>
                    <span className="font-mono font-medium text-zinc-200">
                      {listing.lastHttpStatus ? `HTTP ${listing.lastHttpStatus}` : "Verified Active"}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[11px] uppercase tracking-wider text-zinc-500">Current Stock</span>
                    <span className={cn("font-medium", listing.isAvailable ? "text-emerald-400" : "text-red-400")}>
                      {listing.isAvailable ? "Available in Store" : "Sold Out / Archived"}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[11px] uppercase tracking-wider text-zinc-500">Archived Images</span>
                    <span className="font-medium text-zinc-200">{images.length} angle{images.length === 1 ? "" : "s"}</span>
                  </div>
                  {listing.soldOutAt && (
                    <div className="col-span-2">
                      <span className="block text-[11px] uppercase tracking-wider text-zinc-500">Confirmed Sold Out</span>
                      <span className="font-medium text-red-300">{formatLocalDateTime(listing.soldOutAt)}</span>
                    </div>
                  )}
                </div>
                {onInspect && (
                  <button
                    type="button"
                    onClick={() => onInspect(listing)}
                    className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-zinc-800 hover:text-white cursor-pointer"
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                    Open Full Inspection Modal
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer Action */}
        <div className="mt-5 border-t border-border pt-4">
          {listing.isAvailable ? (
            <div className="flex items-center gap-2">
              <a
                href={listingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-zinc-200"
              >
                View on Everfall
                <ArrowRight className="h-4 w-4" />
              </a>
              {onInspect && (
                <button
                  type="button"
                  onClick={() => onInspect(listing)}
                  className="rounded-lg border border-border bg-secondary px-3 py-2.5 text-xs font-medium text-zinc-200 transition hover:bg-zinc-800 cursor-pointer"
                  title="Inspect all metadata and high-res angles"
                >
                  Inspect
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-red-400">Sold Out</span>
              <div className="flex items-center gap-2">
                {onInspect && (
                  <button
                    type="button"
                    onClick={() => onInspect(listing)}
                    className="rounded-lg border border-border bg-secondary px-3 py-2 text-xs font-medium text-zinc-200 transition hover:bg-zinc-800 hover:text-white cursor-pointer"
                  >
                    Inspect
                  </button>
                )}
                <a
                  href="https://store.everfallcommunity.com/"
                  target="_blank"
                  rel="noopener noreferrer"
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
