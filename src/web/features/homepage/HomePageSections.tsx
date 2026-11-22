import { PublicExtraSections } from "@/components/common/PublicExtraSections";
import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Clock,
  History,
  Loader2,
  Plus,
} from "lucide-react";
import type {
  BotStatus,
  HeroConfig,
  HomePageContentConfig,
  HomeSectionKey,
  ListingItem,
  MonitorHealth,
} from "@/lib/api";
import {
  formatScheduledCadence,
  SCHEDULED_CRON_INTERVAL_MS,
} from "../../../shared/appConfig";
import {
  DEFAULT_HOME_SECTION_ORDER,
  DEFAULT_SITE_PAGES_CONFIG,
} from "../../../shared/presentation";
import { cn, formatLocalTime } from "@/lib/utils";
import { AnimatedHero } from "@/components/hero/AnimatedHero";
import { SlashCommandsSection } from "@/components/discord/SlashCommandsSection";
import { VehicleCard } from "@/components/listings/VehicleCard";
import { SiteIcon } from "@/components/common/SiteIcon";
import {
  getHeaderAlignmentClasses,
  getSpacingClasses,
  getSurfaceCardClass,
} from "@/components/common/pageLayoutPresets";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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

export function HomePageSections({
  homePageCopy,
  heroConfig,
  listings = [],
  isLoading = false,
  isFetching = false,
  isStatusFetching = false,
  hasListingsData = true,
  hasMoreArchive = false,
  botStatus = "online",
  monitorHealth = { state: "verification_successful", label: "Authoritative Verified" },
  scheduledIntervalMs = SCHEDULED_CRON_INTERVAL_MS,
  lastCheckedAt = null,
  lastVerifiedSuccessAt = null,
  inviteUrl = "https://discord.com/oauth2/authorize?client_id=1571958001928245378&permissions=8462935362366544&integration_type=0&scope=bot+applications.commands",
  isAuthenticated = false,
  isAdmin = false,
  isLoggingIn = false,
  onStartLogin,
  onInspectListing,
  previewMode = false,
  previewHeroSelection,
  previewReplayNonce = 0,
}: {
  homePageCopy: HomePageContentConfig;
  heroConfig?: HeroConfig;
  listings?: ListingItem[];
  isLoading?: boolean;
  isFetching?: boolean;
  isStatusFetching?: boolean;
  hasListingsData?: boolean;
  hasMoreArchive?: boolean;
  botStatus?: BotStatus;
  monitorHealth?: MonitorHealth;
  scheduledIntervalMs?: number;
  lastCheckedAt?: number | null;
  lastVerifiedSuccessAt?: number | null;
  inviteUrl?: string;
  isAuthenticated?: boolean;
  isAdmin?: boolean;
  isLoggingIn?: boolean;
  onStartLogin?: (targetAfter: string) => void;
  onInspectListing?: (listing: ListingItem) => void;
  previewMode?: boolean;
  previewHeroSelection?: number;
  previewReplayNonce?: number;
}) {
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const [desktopVisibleCount, setDesktopVisibleCount] = useState(3);
  const [statusFilter, setStatusFilter] = useState<"all" | "in_stock" | "sold_out">("all");

  const spacing = getSpacingClasses(homePageCopy.spacingPreset);
  const alignment = getHeaderAlignmentClasses(homePageCopy.sectionAlignment);
  const surfaceCls = getSurfaceCardClass(homePageCopy.surfaceStyle);

  const filteredListings = listings.filter((car) => {
    if (statusFilter === "in_stock") return car.isAvailable;
    if (statusFilter === "sold_out") return !car.isAvailable;
    return true;
  });
  const inStockCount = listings.filter((c) => c.isAvailable).length;
  const soldOutCount = listings.filter((c) => !c.isAvailable).length;
  const desktopListings = filteredListings.slice(0, Math.min(desktopVisibleCount, 10));

  const featureCards = (
    homePageCopy.featureCards && homePageCopy.featureCards.length > 0
      ? homePageCopy.featureCards
      : DEFAULT_SITE_PAGES_CONFIG.home.featureCards || []
  ).filter((f) => f.enabled !== false);

  const showHero = homePageCopy.showHero !== false;
  const showTelemetry = homePageCopy.showTelemetry !== false;
  const showListings = homePageCopy.showListingsSection !== false;
  const showFeatures = homePageCopy.showFeaturesSection !== false;
  const showSlashCommands = homePageCopy.showSlashCommands !== false;

  const order: HomeSectionKey[] =
    homePageCopy.sectionOrder && homePageCopy.sectionOrder.length > 0
      ? homePageCopy.sectionOrder
      : DEFAULT_HOME_SECTION_ORDER;

  const scrollCarousel = (direction: "left" | "right") => {
    if (!carouselRef.current) return;
    carouselRef.current.scrollBy({
      left: direction === "left" ? -320 : 320,
      behavior: "smooth",
    });
  };

  const renderTelemetryGrid = (withTopBorder: boolean) => (
    <div
      className={cn(
        "grid max-w-xl grid-cols-1 gap-3.5 sm:grid-cols-2",
        homePageCopy.sectionAlignment !== "left" && "mx-auto",
        withTopBorder && "mt-12 border-t border-border/60 pt-8"
      )}
    >
      {homePageCopy.showScheduledCheck !== false && <div className="flex flex-col items-center justify-center rounded-xl border border-border/70 bg-card/75 p-3.5 text-center shadow-sm backdrop-blur-sm transition-all hover:border-zinc-700">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5 text-zinc-400" />
          <span>{homePageCopy.scheduledCheckLabel || "Scheduled Store Check"}</span>
        </div>
        <div className="mt-1 font-mono text-sm font-semibold text-white tabular-nums">
          {formatScheduledCadence(scheduledIntervalMs, true)}
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
          {lastCheckedAt ? `Last check ${formatLocalTime(lastCheckedAt)}` : "Awaiting run"}
        </p>
      </div>}

      <div className="flex flex-col items-center justify-center rounded-xl border border-border/70 bg-card/75 p-3.5 text-center shadow-sm backdrop-blur-sm transition-all hover:border-zinc-700">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="relative flex h-2 w-2">
            <span
              className={cn(
                "absolute inline-flex h-full w-full animate-ping rounded-full opacity-80 duration-1000",
                monitorHealth.state === "verification_successful"
                  ? "bg-emerald-400"
                  : monitorHealth.state === "verification_blocked"
                    ? "bg-red-400"
                    : "bg-amber-400"
              )}
            />
            <span
              className={cn(
                "relative inline-flex h-2 w-2 rounded-full",
                monitorHealth.state === "verification_successful"
                  ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,1)]"
                  : monitorHealth.state === "verification_blocked"
                    ? "bg-red-400"
                    : "bg-amber-400"
              )}
            />
          </span>
          <Activity className="h-3.5 w-3.5 text-zinc-400" />
          <span>Monitor Health</span>
        </div>
        <div className="mt-1 font-mono text-sm font-semibold text-white">
          {monitorHealth.label}
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
          {lastVerifiedSuccessAt
            ? `Verified ${formatLocalTime(lastVerifiedSuccessAt)}`
            : `Bot: ${botStatus === "online" ? "Authenticated" : "Offline"}`}
        </p>
      </div>
    </div>
  );

  // Pair hero + telemetry seamlessly when telemetry immediately follows hero in sectionOrder
  const heroIdx = order.indexOf("hero");
  const telemetryIdx = order.indexOf("telemetry");
  const combineHeroAndTelemetry = showHero && showTelemetry && telemetryIdx === heroIdx + 1;

  return (
    <>
      {order.map((sectionKey) => {
        if (sectionKey === "hero") {
          if (!showHero) return null;
          return (
            <section
              key="hero"
              className="relative w-full overflow-hidden overflow-x-clip border-b border-border bg-background"
            >
              <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute -top-32 left-1/2 h-[450px] w-full max-w-[700px] -translate-x-1/2 rounded-full bg-gradient-to-tr from-emerald-500/10 via-zinc-800/15 to-transparent blur-[140px] opacity-70" />
              </div>

              <div
                className={cn(
                  "relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8",
                  spacing.heroPadding,
                  alignment.container
                )}
              >
                {homePageCopy.showHeroBadge !== false && Boolean(homePageCopy.badgeText) && <div
                  className={cn(
                    "mb-4 flex",
                    homePageCopy.sectionAlignment === "left" ? "justify-start" : "justify-center"
                  )}
                >
                  <span className={cn("inline-flex max-w-full items-center gap-2 rounded-full border border-border px-3.5 py-1 text-xs font-medium", homePageCopy.heroBadgeStyle === "solid" ? "bg-zinc-200 text-zinc-950" : homePageCopy.heroBadgeStyle === "outline" ? "bg-transparent text-zinc-300" : "bg-card/80 text-zinc-300")}><SiteIcon name={homePageCopy.heroBadgeIcon || "none"} className="h-3.5 w-3.5 shrink-0" />
                    {homePageCopy.badgeText}
                  </span>
                </div>}

                <AnimatedHero
                  config={heroConfig}
                  previewIndex={previewHeroSelection}
                  replayNonce={previewReplayNonce}
                />

                <div className={cn("mt-8 flex flex-wrap items-center gap-3", alignment.ctaRow)}>
                  {previewMode ? (
                    <>
                      <span className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg">
                        <Plus className="h-4 w-4" />
                        {homePageCopy.primaryCtaLabel || "Add to Discord"}
                      </span>
                      <span className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-5 py-3 text-sm font-semibold text-zinc-100">
                        {homePageCopy.featuresCtaLabel}
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    </>
                  ) : (
                    <>
                      <a
                        href={homePageCopy.primaryCtaUrl || inviteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg transition-all duration-150 hover:bg-zinc-200 hover:shadow-white/10"
                      >
                        <Plus className="h-4 w-4" />
                        {homePageCopy.primaryCtaLabel || "Add to Discord"}
                      </a>
                      <Link
                        to={(homePageCopy.secondaryCtaUrl || "/features") as any}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-5 py-3 text-sm font-semibold text-zinc-100 transition hover:bg-zinc-800 hover:text-white"
                      >
                        {homePageCopy.featuresCtaLabel}
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </>
                  )}
                </div>

                {combineHeroAndTelemetry && renderTelemetryGrid(true)}
              </div>
            </section>
          );
        }

        if (sectionKey === "telemetry") {
          if (!showTelemetry || combineHeroAndTelemetry) return null;
          return (
            <section
              key="telemetry"
              className="w-full overflow-x-clip border-b border-border bg-zinc-950/70"
            >
              <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
                {renderTelemetryGrid(false)}
              </div>
            </section>
          );
        }

        if (sectionKey === "listings") {
          if (!showListings) return null;
          return (
            <section
              key="listings"
              className={cn("mx-auto w-full min-w-0 max-w-7xl overflow-x-clip px-4 sm:px-6 lg:px-8", spacing.sectionPadding)}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    {homePageCopy.sectionBadge}
                  </p>
                  <h2 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                    {homePageCopy.sectionTitle}
                  </h2>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    {homePageCopy.sectionSubtitle}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2.5">
                    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-zinc-300 tabular-nums">
                      {(isFetching || isStatusFetching) && hasListingsData ? (
                        <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />
                      ) : null}
                      Last Checked:{" "}
                      {lastCheckedAt ? formatLocalTime(lastCheckedAt) : "Awaiting scheduled check"}
                    </span>
                    <BotHealthBadge status={botStatus} />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Tabs
                    value={statusFilter}
                    onValueChange={(val) => setStatusFilter(val as any)}
                    className="w-full max-w-full sm:w-auto"
                  >
                    <TabsList>
                      <TabsTrigger value="all">All ({listings.length})</TabsTrigger>
                      <TabsTrigger value="in_stock">In Stock ({inStockCount})</TabsTrigger>
                      <TabsTrigger value="sold_out">Sold Out ({soldOutCount})</TabsTrigger>
                    </TabsList>
                  </Tabs>

                  {previewMode ? (
                    <Button variant="outline" size="sm" type="button">
                      <History className="h-4 w-4" />
                      View All Vehicles
                    </Button>
                  ) : isAuthenticated ? (
                    <Button variant="outline" size="sm" asChild>
                      <Link to="/history">
                        <History className="h-4 w-4" />
                        View All Vehicles
                      </Link>
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onStartLogin?.("/history")}
                      disabled={isLoggingIn}
                    >
                      <History className="h-4 w-4" />
                      View All Vehicles
                    </Button>
                  )}
                </div>
              </div>

              {isLoading ? (
                <div className="mt-8 grid gap-6 md:grid-cols-3">
                  {[0, 1, 2].map((skeleton) => (
                    <Skeleton key={skeleton} className="h-[420px] w-full rounded-xl" />
                  ))}
                </div>
              ) : filteredListings.length === 0 ? (
                <Card className={cn("mt-8 p-10 text-center", surfaceCls)}>
                  <p className="text-sm font-semibold text-white">
                    {statusFilter === "all" ? homePageCopy.archiveEmptyTitle : "No Matching Releases"}
                  </p>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    {statusFilter === "in_stock"
                      ? `No limited vehicles are currently in stock. Scheduled checks run ${formatScheduledCadence(scheduledIntervalMs).toLowerCase()}.`
                      : statusFilter === "all"
                        ? homePageCopy.archiveEmptyDescription
                        : "No limited vehicle releases recorded matching this filter."}
                  </p>
                </Card>
              ) : (
                <>
                  <div className="mt-8 hidden gap-6 md:grid md:grid-cols-2 lg:grid-cols-3">
                    {desktopListings.map((car) => (
                      <VehicleCard
                        key={car.id}
                        listing={car}
                        isRefreshing={false}
                        onInspect={previewMode ? undefined : onInspectListing}
                        editImagesHref={
                          !previewMode && isAdmin
                            ? `/admin/images?listingId=${encodeURIComponent(car.id)}`
                            : undefined
                        }
                        editMetadataHref={
                          !previewMode && isAdmin
                            ? `/admin/metadata?listingId=${encodeURIComponent(car.id)}`
                            : undefined
                        }
                      />
                    ))}
                  </div>

                  {filteredListings.length > desktopListings.length &&
                    desktopVisibleCount < 10 &&
                    !previewMode && (
                      <div className="mt-8 hidden justify-center md:flex">
                        <Button
                          variant="secondary"
                          onClick={() => setDesktopVisibleCount((c) => Math.min(10, c + 3))}
                        >
                          Load More ({filteredListings.length - desktopListings.length} remaining)
                        </Button>
                      </div>
                    )}

                  {!previewMode &&
                    (hasMoreArchive ||
                      (desktopVisibleCount >= 10 && filteredListings.length >= 10)) && (
                      <div className="mt-6 hidden items-center justify-center gap-3 md:flex">
                        <span className="text-xs text-muted-foreground">
                          Showing up to the 10 most recent public drops.
                        </span>
                        {isAuthenticated ? (
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
                            onClick={() => onStartLogin?.("/history")}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-200 underline decoration-zinc-600 underline-offset-4 hover:text-white hover:decoration-white cursor-pointer"
                          >
                            Sign in to browse complete archive
                            <ArrowRight className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    )}

                  <div className="mt-6 w-full min-w-0 md:hidden">
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
                      className="thin-scrollbar relative flex w-full max-w-full snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain pb-3"
                    >
                      {filteredListings.map((car) => (
                        <div
                          key={`mobile-${car.id}`}
                          className="w-[82vw] max-w-[340px] min-w-0 shrink-0 snap-start"
                        >
                          <VehicleCard
                            listing={car}
                            isRefreshing={false}
                            onInspect={previewMode ? undefined : onInspectListing}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </section>
          );
        }

        if (sectionKey === "features") {
          if (!showFeatures || featureCards.length === 0) return null;
          return (
            <section key="features" className="w-full overflow-x-clip border-t border-border bg-zinc-950/70">
              <div className={cn("mx-auto max-w-7xl px-4 sm:px-6 lg:px-8", spacing.sectionPadding)}>
                <div
                  className={cn(
                    "grid gap-6",
                    homePageCopy.featureColumns === 2 ? "md:grid-cols-2" : "md:grid-cols-3"
                  )}
                >
                  {featureCards.map((feature, idx) => (
                    <Card
                      key={feature.id || `${feature.title}-${idx}`}
                      className={cn(
                        "flex flex-col p-6 transition-all duration-200 hover:border-zinc-700 hover:bg-card/90 hover:shadow-lg",
                        surfaceCls
                      )}
                    >
                      <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-zinc-950">
                        <SiteIcon
                          name={feature.icon}
                          fallback={idx === 0 ? "bell" : idx === 1 ? "images" : "users"}
                          className="h-5 w-5 text-white"
                          strokeWidth={1.75}
                        />
                      </div>
                      <h3 className="mt-4 text-lg font-semibold text-white">{feature.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        {feature.description}
                      </p>
                    </Card>
                  ))}
                </div>
              </div>
            </section>
          );
        }

        if (sectionKey === "slash_commands") {
          if (!showSlashCommands) return null;
          return (
            <section
              key="slash_commands"
              className={cn("mx-auto w-full min-w-0 max-w-7xl overflow-x-clip px-4 sm:px-6 lg:px-8", spacing.sectionPadding)}
            >
              <SlashCommandsSection variant="compact" />
            </section>
          );
        }

        return null;
      })}
      <PublicExtraSections sections={homePageCopy.extraSections} previewMode={previewMode} />
    </>
  );
}
