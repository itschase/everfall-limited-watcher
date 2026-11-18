import { useState } from "react";
import {
  ArrowRight,
  CarFront,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { ListingItem } from "@/lib/api";
import { cn, formatLocalDateTime, safeExternalUrl } from "@/lib/utils";
import { Card } from "@/components/ui/card";

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
      <span className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-black/70 px-2.5 py-1 text-xs font-medium text-zinc-200 backdrop-blur-md">
        <Loader2 className="h-3 w-3 animate-spin text-zinc-300" />
        Refreshing Status
      </span>
    );
  }

  if (isAvailable) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-950/75 px-2.5 py-1 text-xs font-semibold text-emerald-300 backdrop-blur-md">
        <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
        In Stock
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-red-500/40 bg-red-950/80 px-2.5 py-1 text-xs font-semibold text-red-300 backdrop-blur-md">
      <span className="h-2 w-2 rounded-full bg-red-400" />
      Sold Out
    </span>
  );
}

export function VehicleCard({ listing, isRefreshing, onInspect, className }: VehicleCardProps) {
  const images = Array.isArray(listing.images) ? listing.images : [];
  const [activeIdx, setActiveIdx] = useState(0);
  const [failedUrls, setFailedUrls] = useState<Record<string, boolean>>({});

  const safeIdx = images.length > 0 ? Math.min(activeIdx, images.length - 1) : 0;
  const currentImg = images[safeIdx];
  const imgBroken = !currentImg || failedUrls[currentImg];
  const listingUrl = safeExternalUrl(listing.url) || `https://store.everfallcommunity.com/package/${listing.id}`;

  const markBroken = (url: string) => {
    setFailedUrls((prev) => ({ ...prev, [url]: true }));
  };

  return (
    <Card
      className={cn(
        "flex h-full flex-col overflow-hidden transition-colors duration-150 hover:border-white/15",
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
            className="h-full w-full object-cover transition-opacity duration-200"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-zinc-900/70 text-muted-foreground">
            <CarFront className="h-9 w-9 text-white/30" />
            <span className="text-xs font-medium text-muted-foreground">Preview Unavailable</span>
          </div>
        )}

        {/* Top-left NEW LIMITED DROP badge (Strictly visible ONLY when In Stock) */}
        {listing.isAvailable && (
          <div className="pointer-events-none absolute left-3 top-3">
            <span className="inline-flex items-center rounded-md border border-amber-400/50 bg-amber-500/20 px-2.5 py-1 text-[11px] font-bold tracking-wider text-amber-200 backdrop-blur-md shadow-[0_0_16px_rgba(245,158,11,0.25)]">
              NEW LIMITED DROP
            </span>
          </div>
        )}

        {/* Top-right Stock Status badge */}
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
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              #<span className="select-text cursor-text">{listing.id}</span>
            </span>
          </div>

          <div className="mt-2.5 space-y-1 text-xs text-muted-foreground tabular-nums">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
              <span>First Detected: {formatLocalDateTime(listing.detectedAt)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
              <span>Last Verified: {formatLocalDateTime(listing.lastVerifiedAt)}</span>
            </div>
          </div>

          <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-zinc-300">
            {listing.description}
          </p>
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
                View Package on Everfall
                <ArrowRight className="h-4 w-4" />
              </a>
              {onInspect && (
                <button
                  type="button"
                  onClick={() => onInspect(listing)}
                  className="rounded-lg border border-border bg-secondary px-3 py-2.5 text-xs font-medium text-zinc-200 transition hover:bg-zinc-800 cursor-pointer"
                >
                  Details
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
                    className="rounded-lg border border-border px-2.5 py-2 text-xs font-medium text-muted-foreground transition hover:bg-secondary hover:text-white cursor-pointer"
                  >
                    Details
                  </button>
                )}
                <a
                  href="https://store.everfallcommunity.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3.5 py-2 text-xs font-medium text-zinc-200 transition hover:bg-zinc-800 hover:text-white"
                >
                  Open Everfall Store
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
