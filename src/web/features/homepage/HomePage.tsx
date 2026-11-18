import { useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Bell,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  History,
  Images,
  Layers,
  Loader2,
  Plus,
  Radio,
  Shield,
  ShieldCheck,
  Terminal,
  Users,
  Zap,
} from "lucide-react";
import { apiFetch, BotStatus, ListingItem, PublicListingsResponse } from "@/lib/api";
import { cn, formatLocalDateTime, formatLocalTime, safeExternalUrl } from "@/lib/utils";
import { useAuthActions, useSession } from "@/features/auth/useAuthActions";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { StockStatusPill, VehicleCard } from "@/components/listings/VehicleCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

function BotHealthBadge({ status }: { status: BotStatus }) {
  if (status === "offline") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-red-500/35 bg-red-950/60 px-3 py-1 text-xs font-medium text-red-300 backdrop-blur-sm">
        <span className="h-2 w-2 rounded-full bg-red-400" />
        Bot Offline
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/35 bg-emerald-950/60 px-3 py-1 text-xs font-semibold text-emerald-300 backdrop-blur-sm shadow-[0_0_12px_rgba(16,185,129,0.25)]">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-80 duration-1000" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,1)]" />
      </span>
      Bot Online
    </span>
  );
}

const STATS = [
  { label: "Check Frequency", value: "Every 7m", icon: Clock },
  { label: "Notification Latency", value: "<15s Real-Time", icon: Zap },
  { label: "Multi-Angle Gallery", value: "Archived Angles", icon: Images },
  { label: "Verification", value: "100% Authoritative", icon: ShieldCheck },
];

const FEATURES = [
  {
    title: "Limited Drop Posts",
    description:
      "Get notified when new limited vehicles are discovered. Each drop is posted to your configured Discord channel in a detailed embed with vehicle information and images.",
    icon: Bell,
  },
  {
    title: "Limited Drop Previews",
    description:
      "View multiple angles of each vehicle directly in Discord, with images organized into a single, easy-to-browse gallery.",
    icon: Images,
  },
  {
    title: "Mention Roles",
    description:
      "Choose which Discord roles to mention when a new limited drop is posted, so the right members receive notifications.",
    icon: Users,
  },
];

const SLASH_COMMANDS = [
  { command: "/setup <#channel>", summary: "Set the destination channel for new limited vehicle alerts." },
  { command: "/add-role <@role>", summary: "Add a Discord role to mention when a limited drop is published." },
  { command: "/remove-role <@role>", summary: "Remove a role from server notification mentions." },
  { command: "/check", summary: "Run an on-demand store scan for unsent active drops." },
  { command: "/help", summary: "Open server configuration summary and interactive controls." },
];

export function HomePage() {
  const navigate = useNavigate();
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const [desktopVisibleCount, setDesktopVisibleCount] = useState(3);
  const [statusFilter, setStatusFilter] = useState<"all" | "in_stock" | "sold_out">("all");
  const [selectedListing, setSelectedListing] = useState<ListingItem | null>(null);
  const [modalImgIdx, setModalImgIdx] = useState(0);
  const [copiedId, setCopiedId] = useState(false);

  const { data: session } = useSession();
  const { startLogin, isLoggingIn } = useAuthActions((dest) => {
    if (dest) void navigate({ to: dest as any });
  });

  const { data: listingsData, isLoading, isFetching } = useQuery({
    queryKey: ["public-listings"],
    queryFn: () => apiFetch<PublicListingsResponse>("/api/public/listings"),
    staleTime: 120_000,
    refetchInterval: 300_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });

  const allListings = listingsData?.listings || [];

  const filteredListings = allListings.filter((car) => {
    if (statusFilter === "in_stock") return car.isAvailable;
    if (statusFilter === "sold_out") return !car.isAvailable;
    return true;
  });

  const inStockCount = allListings.filter((c) => c.isAvailable).length;
  const soldOutCount = allListings.filter((c) => !c.isAvailable).length;

  const desktopListings = filteredListings.slice(0, Math.min(desktopVisibleCount, 10));
  const botStatus: BotStatus = listingsData?.botStatus || session?.botStatus || "online";
  const lastCheckedAt = listingsData?.lastCheckedAt || listingsData?.lastSuccessAt;
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

  const scrollCarousel = (direction: "left" | "right") => {
    if (!carouselRef.current) return;
    const delta = direction === "left" ? -320 : 320;
    carouselRef.current.scrollBy({ left: delta, behavior: "smooth" });
  };

  return (
    <PublicLayout>
      {/* Enhanced Hero Section with Ambient Glow Effect & Live Radar Beacon */}
      <section className="relative overflow-hidden border-b border-border bg-background">
        {/* Subtle Ambient Radial Glow */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-32 left-1/2 -translate-x-1/2 h-[450px] w-[700px] rounded-full bg-gradient-to-tr from-emerald-500/10 via-zinc-800/15 to-transparent blur-[140px] opacity-70" />
        </div>

        <div className="relative mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 sm:py-24 lg:px-8">
          {/* Live Monitor Radar Pill */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/80 bg-zinc-900/80 px-3.5 py-1 text-xs font-medium text-zinc-300 backdrop-blur-md shadow-sm">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-80 duration-1000" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,1)]" />
            </span>
            <span className="tracking-wide">Autonomous Store Monitor Active</span>
            <span className="h-3 w-px bg-zinc-700" />
            <span className="font-mono text-[11px] text-zinc-400">Scans Every 7m</span>
          </div>

          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
            Never Miss an Everfall <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
              Limited Drop
            </span>
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Track Everfall's limited vehicle releases, inspect verified stock availability, and receive structured Discord alerts with archived multi-image galleries.
          </p>

          <div className="mt-8 flex justify-center">
            <a
              href={inviteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg transition-all duration-150 hover:bg-zinc-200 hover:shadow-white/10"
            >
              <Plus className="h-4 w-4" />
              Add to Discord
            </a>
          </div>

          {/* Quick Metrics Bar */}
          <div className="mt-12 grid grid-cols-2 gap-3 border-t border-border/60 pt-8 sm:grid-cols-4">
            {STATS.map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="rounded-lg border border-border/50 bg-card/60 p-3 text-center">
                  <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                    <Icon className="h-3.5 w-3.5 text-zinc-400" />
                    <span>{stat.label}</span>
                  </div>
                  <div className="mt-1 font-mono text-sm font-semibold text-white">{stat.value}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Limited Drop History Showcase with Interactive Filters & Inspection */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Limited Drop History
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Recent Everfall Limited Edition vehicle discoveries sorted newest first.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-zinc-300 tabular-nums">
                {isFetching && listingsData ? (
                  <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />
                ) : null}
                Last Checked:{" "}
                {lastCheckedAt ? formatLocalTime(lastCheckedAt) : "Awaiting scheduled check"}
              </span>
              <BotHealthBadge status={botStatus} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filter Tabs */}
            <Tabs
              value={statusFilter}
              onValueChange={(val) => setStatusFilter(val as any)}
              className="w-auto"
            >
              <TabsList>
                <TabsTrigger value="all">All ({allListings.length})</TabsTrigger>
                <TabsTrigger value="in_stock">In Stock ({inStockCount})</TabsTrigger>
                <TabsTrigger value="sold_out">Sold Out ({soldOutCount})</TabsTrigger>
              </TabsList>
            </Tabs>

            {session?.authenticated ? (
              <Button variant="outline" size="sm" asChild>
                <Link to="/history">
                  <History className="h-4 w-4" />
                  Full Archive
                </Link>
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void startLogin({ targetAfter: "/history" })}
                disabled={isLoggingIn}
              >
                <History className="h-4 w-4" />
                Full Archive
              </Button>
            )}
          </div>
        </div>

        {/* Listings Content */}
        {isLoading ? (
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {[0, 1, 2].map((skeleton) => (
              <div
                key={skeleton}
                className="h-[420px] animate-pulse rounded-xl border border-border bg-card"
              />
            ))}
          </div>
        ) : filteredListings.length === 0 ? (
          <Card className="mt-8 p-10 text-center">
            <p className="text-sm text-muted-foreground">
              {statusFilter === "in_stock"
                ? "No limited vehicles are currently in stock. The store monitor checks every 7 minutes."
                : "No limited vehicle releases recorded matching this filter."}
            </p>
          </Card>
        ) : (
          <>
            {/* Desktop Grid: 3 initially, Load More up to 10 */}
            <div className="mt-8 hidden gap-6 md:grid md:grid-cols-2 lg:grid-cols-3">
              {desktopListings.map((car) => (
                <VehicleCard
                  key={car.id}
                  listing={car}
                  isRefreshing={false}
                  onInspect={openInspect}
                />
              ))}
            </div>

            {filteredListings.length > desktopListings.length && desktopVisibleCount < 10 && (
              <div className="mt-8 hidden justify-center md:flex">
                <Button
                  variant="secondary"
                  onClick={() => setDesktopVisibleCount((c) => Math.min(10, c + 3))}
                >
                  Load More ({filteredListings.length - desktopListings.length} remaining)
                </Button>
              </div>
            )}

            {(listingsData?.hasMoreArchive || (desktopVisibleCount >= 10 && filteredListings.length >= 10)) && (
              <div className="mt-6 hidden items-center justify-center gap-3 md:flex">
                <span className="text-xs text-muted-foreground">
                  Showing up to the 10 most recent public drops.
                </span>
                {session?.authenticated ? (
                  <Link
                    to="/history"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-200 underline decoration-zinc-600 underline-offset-4 hover:text-white hover:decoration-white"
                  >
                    Open Full Drop History
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => void startLogin({ targetAfter: "/history" })}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-200 underline decoration-zinc-600 underline-offset-4 hover:text-white hover:decoration-white cursor-pointer"
                  >
                    Sign in to browse complete archive
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}

            {/* Mobile Horizontal Swipeable Carousel */}
            <div className="mt-6 md:hidden">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  Swipe to browse ({filteredListings.length})
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-label="Scroll left"
                    onClick={() => scrollCarousel("left")}
                    className="rounded-lg border border-border bg-card p-1.5 text-zinc-300"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Scroll right"
                    onClick={() => scrollCarousel("right")}
                    className="rounded-lg border border-border bg-card p-1.5 text-zinc-300"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div
                ref={carouselRef}
                className="thin-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3"
              >
                {filteredListings.map((car) => (
                  <div key={`mobile-${car.id}`} className="w-[86vw] max-w-[360px] shrink-0 snap-start">
                    <VehicleCard
                      listing={car}
                      isRefreshing={false}
                      onInspect={openInspect}
                    />
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </section>

      {/* Feature Cards (Flat white Lucide SVG icons + shadcn card hover) */}
      <section className="border-t border-border bg-zinc-950/70">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="grid gap-6 md:grid-cols-3">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <Card
                  key={feature.title}
                  className="flex flex-col p-6 transition-all duration-200 hover:border-zinc-700 hover:bg-card/90 hover:shadow-lg"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-zinc-950">
                    <Icon className="h-5 w-5 text-white" strokeWidth={1.75} />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-white">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {feature.description}
                  </p>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Slash Commands Reference */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <Card className="p-6 sm:p-8">
          <div className="flex items-center gap-2.5">
            <Terminal className="h-5 w-5 text-white" />
            <h2 className="text-xl font-bold text-white">Discord Slash Commands</h2>
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Server configuration commands require Manage Server or Administrator permissions inside your Discord server.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SLASH_COMMANDS.map((item) => (
              <div
                key={item.command}
                className="rounded-lg border border-border bg-zinc-950/80 p-4 transition-colors hover:border-zinc-700"
              >
                <code className="select-all cursor-text font-mono text-xs font-semibold text-zinc-100">
                  {item.command}
                </code>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  {item.summary}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </section>

      {/* Detailed Vehicle Inspection Dialog Modal */}
      <Dialog open={Boolean(selectedListing)} onOpenChange={(open) => !open && setSelectedListing(null)}>
        {selectedListing && (
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <div className="flex flex-wrap items-center justify-between gap-2 pr-8">
                <DialogTitle className="text-xl font-bold text-white">{selectedListing.name}</DialogTitle>
                <StockStatusPill isAvailable={selectedListing.isAvailable} />
              </div>
              <DialogDescription className="font-mono text-xs text-muted-foreground">
                Package ID:{" "}
                <button
                  type="button"
                  onClick={() => handleCopyId(selectedListing.id)}
                  title="Copy package ID"
                  className="inline-flex items-center gap-1 text-zinc-300 underline decoration-zinc-600 hover:text-white"
                >
                  #{selectedListing.id}
                  {copiedId ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                </button>
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Image Carousel */}
              {selectedListing.images.length > 0 && (
                <div className="relative overflow-hidden rounded-lg border border-border bg-zinc-950">
                  <img
                    src={selectedListing.images[Math.min(modalImgIdx, selectedListing.images.length - 1)]}
                    alt={selectedListing.name}
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
                            (prev) => (prev - 1 + selectedListing.images.length) % selectedListing.images.length
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
                        {Math.min(modalImgIdx, selectedListing.images.length - 1) + 1} / {selectedListing.images.length}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Technical Metadata Table */}
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
                    {selectedListing.lastHttpStatus ? `HTTP ${selectedListing.lastHttpStatus}` : "200 OK (Verified)"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Archived Views</span>
                  <p className="mt-0.5 font-medium text-zinc-200">
                    {selectedListing.images.length} High-Res Angle{selectedListing.images.length === 1 ? "" : "s"}
                  </p>
                </div>
                {selectedListing.soldOutAt && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Confirmed Sold Out</span>
                    <p className="mt-0.5 font-medium text-red-300">
                      {formatLocalDateTime(selectedListing.soldOutAt)}
                    </p>
                  </div>
                )}
              </div>

              {/* Description */}
              <div className="rounded-lg border border-border/70 bg-card/60 p-3.5">
                <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Package Details
                </span>
                <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-300">
                  {selectedListing.description}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <a
                  href={
                    selectedListing.isAvailable
                      ? safeExternalUrl(selectedListing.url) || `https://store.everfallcommunity.com/package/${selectedListing.id}`
                      : "https://store.everfallcommunity.com/"
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow transition hover:bg-zinc-200 sm:w-auto sm:py-2"
                >
                  {selectedListing.isAvailable ? "View Package on Everfall" : "Open Everfall Store"}
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
