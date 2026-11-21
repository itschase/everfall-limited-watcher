import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Images,
  SlidersHorizontal,
} from "lucide-react";
import {
  apiFetch,
  BotStatus,
  ListingItem,
  MonitorHealth,
  PublicListingsResponse,
  PublicStatusResponse,
} from "@/lib/api";
import { SCHEDULED_CRON_INTERVAL_MS } from "../../../shared/appConfig";
import { resolveListingPresentation, sortAndFilterFeatures } from "../../../shared/features";
import { DEFAULT_SITE_PAGES_CONFIG } from "../../../shared/presentation";
import { formatLocalDateTime, safeExternalUrl } from "@/lib/utils";
import { useAuthActions, useSession } from "@/features/auth/useAuthActions";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { FeatureChipList, StockStatusPill } from "@/components/listings/VehicleCard";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HomePageSections } from "./HomePageSections";

export function HomePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedListing, setSelectedListing] = useState<ListingItem | null>(null);
  const [modalImgIdx, setModalImgIdx] = useState(0);
  const [copiedId, setCopiedId] = useState(false);

  const { data: session } = useSession();
  const { startLogin, isLoggingIn } = useAuthActions((dest) => {
    if (dest) void navigate({ to: dest as any });
  });

  // Full listings payload fetched once and cached; re-pulled ONLY when catalogVersion advances
  const { data: listingsData, isLoading, isFetching } = useQuery({
    queryKey: ["public-listings"],
    queryFn: () => apiFetch<PublicListingsResponse>("/api/public/listings"),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Lightweight 1-KV-read / edge-cached status heartbeat
  const { data: statusHeartbeat, isFetching: isStatusFetching } = useQuery({
    queryKey: ["public-status"],
    queryFn: () => apiFetch<PublicStatusResponse>("/api/public/status"),
    staleTime: 30_000,
    refetchInterval: 45_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!statusHeartbeat || !listingsData) return;
    const nextVersion = statusHeartbeat.catalogVersion || 0;
    const prevVersion = listingsData.catalogVersion || 0;
    if (nextVersion > 0 && prevVersion > 0 && nextVersion !== prevVersion) {
      void queryClient.invalidateQueries({ queryKey: ["public-listings"] });
    }
  }, [statusHeartbeat, listingsData, queryClient]);

  const allListings = listingsData?.listings || [];
  const botStatus: BotStatus =
    statusHeartbeat?.botStatus || listingsData?.botStatus || session?.botStatus || "offline";
  const monitorHealth: MonitorHealth =
    statusHeartbeat?.monitorHealth ||
    listingsData?.monitorHealth ||
    session?.monitorHealth || { state: "monitoring_pending", label: "Monitoring Pending" };
  const scheduledIntervalMs =
    statusHeartbeat?.scheduledIntervalMs ||
    listingsData?.scheduledIntervalMs ||
    session?.scheduledIntervalMs ||
    SCHEDULED_CRON_INTERVAL_MS;
  const lastCheckedAt =
    statusHeartbeat?.lastCheckedAt ||
    listingsData?.lastCheckedAt ||
    statusHeartbeat?.lastSuccessAt ||
    listingsData?.lastSuccessAt ||
    null;
  const lastVerifiedSuccessAt =
    statusHeartbeat?.lastSuccessAt ||
    listingsData?.lastSuccessAt ||
    listingsData?.monitorStatus?.lastSuccessAt ||
    null;
  const heroConfig = statusHeartbeat?.hero || listingsData?.hero;
  const homePageCopy =
    statusHeartbeat?.pages?.home || listingsData?.pages?.home || DEFAULT_SITE_PAGES_CONFIG.home;

  const inviteUrl =
    session?.inviteUrl ||
    "https://discord.com/oauth2/authorize?client_id=1571958001928245378&permissions=8462935362366544&integration_type=0&scope=bot+applications.commands";

  const openInspect = (listing: ListingItem) => {
    setModalImgIdx(0);
    setSelectedListing(listing);
  };

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id).catch(() => {});
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const modalPresentation = selectedListing
    ? selectedListing.presentation ||
      resolveListingPresentation({
        id: selectedListing.id,
        name: selectedListing.name,
        description: selectedListing.description,
        url: selectedListing.url,
        images: selectedListing.images,
      })
    : null;
  const modalFeatures = modalPresentation
    ? sortAndFilterFeatures(modalPresentation.effective.features, "card")
    : [];

  return (
    <PublicLayout>
      <HomePageSections
        homePageCopy={homePageCopy}
        heroConfig={heroConfig}
        listings={allListings}
        isLoading={isLoading}
        isFetching={isFetching}
        isStatusFetching={isStatusFetching}
        hasListingsData={Boolean(listingsData)}
        hasMoreArchive={Boolean(listingsData?.hasMoreArchive)}
        botStatus={botStatus}
        monitorHealth={monitorHealth}
        scheduledIntervalMs={scheduledIntervalMs}
        lastCheckedAt={lastCheckedAt}
        lastVerifiedSuccessAt={lastVerifiedSuccessAt}
        inviteUrl={inviteUrl}
        isAuthenticated={Boolean(session?.authenticated)}
        isAdmin={Boolean(session?.user?.isAdmin)}
        isLoggingIn={isLoggingIn}
        onStartLogin={(targetAfter) => void startLogin({ targetAfter })}
        onInspectListing={openInspect}
      />

      {/* Vehicle Inspection Modal */}
      <Dialog
        open={Boolean(selectedListing)}
        onOpenChange={(open) => !open && setSelectedListing(null)}
      >
        {selectedListing && modalPresentation && (
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <div className="flex flex-wrap items-center justify-between gap-2 pr-8">
                <DialogTitle className="text-xl font-bold text-white">
                  {modalPresentation.effective.name}
                </DialogTitle>
                <StockStatusPill isAvailable={selectedListing.isAvailable} />
              </div>
              <DialogDescription className="font-mono text-xs text-muted-foreground">
                Package ID:{" "}
                <button
                  type="button"
                  onClick={() => handleCopyId(selectedListing.id)}
                  title="Copy package ID"
                  className="inline-flex items-center gap-1 text-zinc-300 underline decoration-zinc-600 hover:text-white cursor-pointer"
                >
                  #{selectedListing.id}
                  {copiedId ? (
                    <Check className="h-3 w-3 text-emerald-400" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </button>
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {selectedListing.images.length > 0 && (
                <div className="relative overflow-hidden rounded-lg border border-border bg-zinc-950">
                  <img
                    src={
                      selectedListing.images[
                        Math.min(modalImgIdx, selectedListing.images.length - 1)
                      ]
                    }
                    alt={modalPresentation.effective.name}
                    referrerPolicy="no-referrer"
                    className="max-h-56 w-full object-cover sm:max-h-72"
                  />
                  {selectedListing.images.length > 1 && (
                    <>
                      <button
                        type="button"
                        aria-label="Previous image"
                        onClick={() =>
                          setModalImgIdx(
                            (prev) =>
                              (prev - 1 + selectedListing.images.length) %
                              selectedListing.images.length
                          )
                        }
                        className="absolute left-2 top-1/2 -translate-y-1/2 rounded-lg border border-white/10 bg-black/65 p-1.5 text-white/85 transition hover:bg-black/85 hover:text-white cursor-pointer"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="Next image"
                        onClick={() =>
                          setModalImgIdx((prev) => (prev + 1) % selectedListing.images.length)
                        }
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg border border-white/10 bg-black/65 p-1.5 text-white/85 transition hover:bg-black/85 hover:text-white cursor-pointer"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                      <div className="absolute bottom-2 right-2 rounded-md border border-white/10 bg-black/70 px-2 py-0.5 text-[11px] font-medium text-zinc-200 tabular-nums">
                        {Math.min(modalImgIdx, selectedListing.images.length - 1) + 1} /{" "}
                        {selectedListing.images.length}
                      </div>
                    </>
                  )}
                </div>
              )}

              <FeatureChipList features={modalFeatures} />

              <div className="grid gap-3 rounded-lg border border-border bg-zinc-950 p-3.5 text-xs sm:grid-cols-2 sm:p-4 tabular-nums">
                <div>
                  <span className="text-muted-foreground">First Detected</span>
                  <p className="mt-0.5 font-medium text-white">
                    {formatLocalDateTime(selectedListing.detectedAt)}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Last Verified</span>
                  <p className="mt-0.5 font-medium text-white">
                    {formatLocalDateTime(selectedListing.lastVerifiedAt)}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Store Response</span>
                  <p className="mt-0.5 font-mono font-medium text-zinc-200">
                    {selectedListing.lastHttpStatus
                      ? `HTTP ${selectedListing.lastHttpStatus}`
                      : "200 OK (Verified)"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Archived Views</span>
                  <p className="mt-0.5 font-medium text-zinc-200">
                    {selectedListing.images.length} High-Res Angle
                    {selectedListing.images.length === 1 ? "" : "s"}
                  </p>
                </div>
                {modalPresentation.effective.tradingRestriction && (
                  <div>
                    <span className="text-muted-foreground">Trading Rule</span>
                    <p className="mt-0.5 font-medium text-zinc-200">
                      {modalPresentation.effective.tradingRestriction}
                    </p>
                  </div>
                )}
                {modalPresentation.effective.deliveryInfo && (
                  <div>
                    <span className="text-muted-foreground">Delivery</span>
                    <p className="mt-0.5 font-medium text-zinc-200">
                      {modalPresentation.effective.deliveryInfo}
                    </p>
                  </div>
                )}
                {selectedListing.soldOutAt && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Confirmed Sold Out</span>
                    <p className="mt-0.5 font-medium text-red-300">
                      {formatLocalDateTime(selectedListing.soldOutAt)}
                    </p>
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-border/70 bg-card/60 p-3.5">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Package Details
                </span>
                <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-300">
                  {modalPresentation.effective.fullDescription}
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                {session?.user?.isAdmin && (
                  <>
                    <a
                      href={`/admin/metadata?listingId=${encodeURIComponent(selectedListing.id)}`}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-secondary px-4 py-2.5 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800 hover:text-white sm:w-auto sm:py-2"
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      Edit Metadata
                    </a>
                    <a
                      href={`/admin/images?listingId=${encodeURIComponent(selectedListing.id)}`}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-secondary px-4 py-2.5 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800 hover:text-white sm:w-auto sm:py-2"
                    >
                      <Images className="h-3.5 w-3.5" />
                      Edit Image Set
                    </a>
                  </>
                )}
                <a
                  href={
                    selectedListing.isAvailable
                      ? safeExternalUrl(selectedListing.url) ||
                        `https://store.everfallcommunity.com/package/${selectedListing.id}`
                      : "https://store.everfallcommunity.com/"
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow transition hover:bg-zinc-200 sm:w-auto sm:py-2"
                >
                  {selectedListing.isAvailable
                    ? "View Package on Everfall"
                    : "Open Everfall Store"}
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </PublicLayout>
  );
}
