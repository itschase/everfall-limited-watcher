import { PublicExtraSections } from "@/components/common/PublicExtraSections";
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Archive,
  ArrowRight,
  Bell,
  CarFront,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Database,
  ExternalLink,
  FileText,
  HardDrive,
  History,
  Images,
  Layers,
  LayoutDashboard,
  RefreshCw,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Users,
} from "lucide-react";
import type {
  AnnouncementTemplate,
  FeaturesPageContentConfig,
  FeaturesSectionKey,
  ListingItem,
  MonitorStatus,
  WidgetTemplateConfig,
} from "@/lib/api";
import { resolveListingPresentation, sortAndFilterFeatures } from "../../../shared/features";
import {
  DEFAULT_FEATURES_SECTION_ORDER,
  DEFAULT_IN_STOCK_TEMPLATE,
  DEFAULT_SITE_PAGES_CONFIG,
  DEFAULT_SOLD_OUT_TEMPLATE,
  DEFAULT_WIDGET_TEMPLATE,
} from "../../../shared/presentation";
import { CHECK_INTERVAL_LABEL, refreshStoreMonitorCadenceCopy } from "../../../shared/appConfig";
import { cn, formatLocalDateTime, safeExternalUrl } from "@/lib/utils";
import { SiteIcon } from "@/components/common/SiteIcon";
import {
  getHeaderAlignmentClasses,
  getSpacingClasses,
  getSurfaceCardClass,
} from "@/components/common/pageLayoutPresets";
import {
  AnnouncementPreviewCard,
  WidgetPreviewCard,
} from "@/components/discord/DiscordMessagePreview";
import { SlashCommandsSection } from "@/components/discord/SlashCommandsSection";
import {
  FeatureChipList,
  StockStatusPill,
  VehicleCard,
} from "@/components/listings/VehicleCard";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const SERVER_CONTROL_FEATURES = [
  {
    title: "Notification Channels",
    description:
      "Bind any text channel with /setup or your Server Dashboard. Saving settings never triggers surprise test broadcasts.",
    icon: Server,
  },
  {
    title: "Mention Roles",
    description:
      "Notify collectors with /add-role and /remove-role on initial In Stock drops, while suppressing role pings on Sold Out edits.",
    icon: Users,
  },
  {
    title: "Live Status Widgets",
    description:
      "Run /widget for a private preview before posting publicly, or deploy, move, template-switch, and sync directly from your dashboard.",
    icon: LayoutDashboard,
  },
  {
    title: "Controlled Updates & Scans",
    description:
      "Trigger /check for on-demand verification, keep stock accurate when the storefront blocks crawlers, and inspect server sync health.",
    icon: RefreshCw,
  },
];

export function FeaturesPageSections({
  featuresCopy,
  listings = [],
  inStockTemplate = DEFAULT_IN_STOCK_TEMPLATE,
  soldOutTemplate = DEFAULT_SOLD_OUT_TEMPLATE,
  widgetTemplate = DEFAULT_WIDGET_TEMPLATE,
  monitorStatus = null,
  publicOrigin = "https://everfall-limited-watcher.itschase.workers.dev",
  inviteUrl = "https://discord.com/oauth2/authorize?client_id=1571958001928245378&permissions=8462935362366544&integration_type=0&scope=bot+applications.commands",
  isPreviewLoading = false,
  previewMode = false,
}: {
  featuresCopy: FeaturesPageContentConfig;
  listings?: ListingItem[];
  inStockTemplate?: AnnouncementTemplate;
  soldOutTemplate?: AnnouncementTemplate;
  widgetTemplate?: WidgetTemplateConfig;
  monitorStatus?: MonitorStatus | null;
  publicOrigin?: string;
  inviteUrl?: string;
  isPreviewLoading?: boolean;
  previewMode?: boolean;
}) {
  const [previewTab, setPreviewTab] = useState<"in_stock" | "sold_out" | "widget">("in_stock");
  const [galleryIdx, setGalleryIdx] = useState(0);

  const spacing = getSpacingClasses(featuresCopy.spacingPreset);
  const alignment = getHeaderAlignmentClasses(featuresCopy.sectionAlignment);
  const surfaceCls = getSurfaceCardClass(featuresCopy.surfaceStyle);

  const latestListing: ListingItem | null = useMemo(() => {
    if (listings.length === 0) return null;
    return [...listings].sort((a, b) => b.detectedAt - a.detectedAt)[0] || null;
  }, [listings]);

  const recentArchivePreview = useMemo(
    () => [...listings].sort((a, b) => b.detectedAt - a.detectedAt).slice(0, 3),
    [listings]
  );

  const latestPresentation = useMemo(() => {
    if (!latestListing) return null;
    return (
      latestListing.presentation ||
      resolveListingPresentation({
        id: latestListing.id,
        name: latestListing.name,
        description: latestListing.description,
        url: latestListing.url,
        images: latestListing.images,
      })
    );
  }, [latestListing]);

  const latestFeatures = useMemo(() => {
    if (!latestPresentation) return [];
    return sortAndFilterFeatures(latestPresentation.effective.features, "card");
  }, [latestPresentation]);

  const galleryImages = latestListing?.images || [];
  const safeGalleryIdx =
    galleryImages.length > 0 ? Math.min(galleryIdx, galleryImages.length - 1) : 0;

  const visibleWorkflowSteps = (
    featuresCopy.workflowSteps && featuresCopy.workflowSteps.length > 0
      ? featuresCopy.workflowSteps
      : DEFAULT_SITE_PAGES_CONFIG.features.workflowSteps || []
  ).filter((s) => s.enabled !== false);

  const visibleCapabilities = (featuresCopy.capabilities || []).filter(
    (c) => c.enabled !== false
  );

  const order: FeaturesSectionKey[] =
    featuresCopy.sectionOrder && featuresCopy.sectionOrder.length > 0
      ? featuresCopy.sectionOrder
      : DEFAULT_FEATURES_SECTION_ORDER;

  const scrollToShowcase = () => {
    if (previewMode || typeof document === "undefined") return;
    const el = document.getElementById("discord-showcase");
    if (!el) return;
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    el.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
  };

  return (
    <>
      {order.map((sectionKey) => {
        if (sectionKey === "header") {
          if (featuresCopy.showHeader === false) return null;
          return (
            <section
              key="header"
              className="relative w-full overflow-hidden overflow-x-clip border-b border-border bg-background"
            >
              <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute -top-28 left-1/2 h-[420px] w-full max-w-[720px] -translate-x-1/2 rounded-full bg-gradient-to-tr from-emerald-500/10 via-zinc-700/15 to-transparent blur-[140px] opacity-70" />
              </div>

              <div
                className={cn(
                  "relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8",
                  spacing.heroPadding,
                  alignment.container
                )}
              >
                <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3.5 py-1 text-xs font-medium text-zinc-300 backdrop-blur-sm">
                  <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                  {featuresCopy.badgeText}
                </span>

                <h1 className="mt-5 text-3xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-[3.25rem] lg:leading-[1.12]">
                  {featuresCopy.heading}
                </h1>

                <p
                  className={cn(
                    "mt-5 max-w-2xl text-base leading-relaxed text-zinc-300 sm:text-lg",
                    featuresCopy.sectionAlignment !== "left" && "mx-auto"
                  )}
                >
                  {featuresCopy.subheading}
                </p>

                <div className={cn("mt-8 flex flex-wrap items-center gap-3.5", alignment.ctaRow)}>
                  {previewMode ? (
                    <>
                      <span className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg sm:w-auto">
                        <SiteIcon name={featuresCopy.primaryCtaIcon} fallback="zap" className="h-4 w-4" />
                        {featuresCopy.primaryCtaLabel}
                      </span>
                      <span className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-6 py-3 text-sm font-semibold text-zinc-100 sm:w-auto">
                        <SiteIcon name={featuresCopy.secondaryCtaIcon} fallback="eye" className="h-4 w-4 text-zinc-300" />
                        {featuresCopy.secondaryCtaLabel}
                      </span>
                    </>
                  ) : (
                    <>
                      <a
                        href={featuresCopy.primaryCtaUrl || inviteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg transition hover:bg-zinc-200 sm:w-auto"
                      >
                        <SiteIcon name={featuresCopy.primaryCtaIcon} fallback="zap" className="h-4 w-4" />
                        {featuresCopy.primaryCtaLabel}
                      </a>
                      <button
                        type="button"
                        onClick={() => { if (featuresCopy.secondaryCtaUrl) window.location.assign(featuresCopy.secondaryCtaUrl); else scrollToShowcase(); }}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-6 py-3 text-sm font-semibold text-zinc-100 transition hover:bg-zinc-800 hover:text-white cursor-pointer sm:w-auto"
                      >
                        <SiteIcon name={featuresCopy.secondaryCtaIcon} fallback="eye" className="h-4 w-4 text-zinc-300" />
                        {featuresCopy.secondaryCtaLabel}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </section>
          );
        }

        if (sectionKey === "previews") {
          if (featuresCopy.showPreviews === false) return null;
          return (
            <section
              key="previews"
              id={previewMode ? undefined : "discord-showcase"}
              className="scroll-mt-20 border-b border-border bg-zinc-950/75"
            >
              <div className={cn("mx-auto max-w-7xl px-4 sm:px-6 lg:px-8", spacing.sectionPadding)}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div className="max-w-2xl">
                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                      Live Discord Notification Preview
                    </p>
                    <h2 className="mt-1.5 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                      {featuresCopy.previewsHeading}
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {featuresCopy.previewsSubheading}
                    </p>
                  </div>

                  {latestListing && (
                    <div className="flex flex-wrap items-center gap-2.5 text-xs text-muted-foreground">
                      <span>Preview Listing:</span>
                      <span className="font-semibold text-white">
                        {latestPresentation?.effective.name || latestListing.name}
                      </span>
                      <StockStatusPill isAvailable={latestListing.isAvailable} />
                    </div>
                  )}
                </div>

                <Tabs
                  value={previewTab}
                  onValueChange={(val) => setPreviewTab(val as "in_stock" | "sold_out" | "widget")}
                  className="mt-8"
                >
                  <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
                    <TabsTrigger value="in_stock">In Stock</TabsTrigger>
                    <TabsTrigger value="sold_out">Sold Out</TabsTrigger>
                    <TabsTrigger value="widget">Live Widget</TabsTrigger>
                  </TabsList>

                  <div className="mt-6 grid items-start gap-8 lg:grid-cols-12">
                    <div className="min-w-0 lg:col-span-7">
                      {isPreviewLoading ? (
                        <Card className={cn("space-y-4 p-5", surfaceCls)}>
                          <Skeleton className="h-6 w-48" />
                          <Skeleton className="h-56 w-full" />
                          <Skeleton className="h-12 w-full" />
                        </Card>
                      ) : (
                        <>
                          <TabsContent value="in_stock" className="mt-0 space-y-3">
                            {latestListing ? (
                              <>
                                {!latestListing.isAvailable && (
                                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-950/30 px-3.5 py-2 text-xs text-amber-200">
                                    <span>
                                      <strong className="font-semibold">Demonstration Preview:</strong>{" "}
                                      Showing how this vehicle appears while In Stock. Stored availability remains untouched.
                                    </span>
                                    <span className="font-mono text-[11px] text-amber-300">
                                      Actual State: Sold Out
                                    </span>
                                  </div>
                                )}
                                <AnnouncementPreviewCard
                                  mode="in_stock"
                                  template={inStockTemplate}
                                  listing={latestListing}
                                  portalOrigin={publicOrigin}
                                />
                              </>
                            ) : (
                              <Card className={cn("p-8 text-center", surfaceCls)}>
                                <CarFront className="mx-auto h-9 w-9 text-zinc-500" />
                                <p className="mt-3 text-sm font-semibold text-white">
                                  No Tracked Drops Stored Yet
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Once Everfall Limited Watcher detects a limited vehicle release, the live In Stock Discord Components V2 preview automatically populates here.
                                </p>
                              </Card>
                            )}
                          </TabsContent>

                          <TabsContent value="sold_out" className="mt-0 space-y-3">
                            {latestListing ? (
                              <>
                                {latestListing.isAvailable && (
                                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-950/30 px-3.5 py-2 text-xs text-amber-200">
                                    <span>
                                      <strong className="font-semibold">Demonstration Preview:</strong>{" "}
                                      Simulating an in-place Sold Out edit for this vehicle without modifying its active stock state.
                                    </span>
                                    <span className="font-mono text-[11px] text-emerald-300">
                                      Actual State: In Stock
                                    </span>
                                  </div>
                                )}
                                <AnnouncementPreviewCard
                                  mode="sold_out"
                                  template={soldOutTemplate}
                                  listing={latestListing}
                                  portalOrigin={publicOrigin}
                                />
                              </>
                            ) : (
                              <Card className={cn("p-8 text-center", surfaceCls)}>
                                <Archive className="mx-auto h-9 w-9 text-zinc-500" />
                                <p className="mt-3 text-sm font-semibold text-white">
                                  No Archived Vehicles to Preview Yet
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Sold Out update previews activate automatically once at least one historical drop is recorded.
                                </p>
                              </Card>
                            )}
                          </TabsContent>

                          <TabsContent value="widget" className="mt-0 space-y-3">
                            {listings.length === 0 && (
                              <div className="rounded-lg border border-border bg-card px-3.5 py-2 text-xs text-muted-foreground">
                                <strong className="text-zinc-200">Empty Archive State:</strong> Rendering live widget empty-state behavior with configured templates.
                              </div>
                            )}
                            <WidgetPreviewCard
                              template={widgetTemplate}
                              listings={listings.slice(0, widgetTemplate.vehicleCount || 3)}
                              monitorStatus={monitorStatus}
                              portalOrigin={publicOrigin}
                            />
                          </TabsContent>
                        </>
                      )}
                    </div>

                    <div className="space-y-4 lg:col-span-5">
                      <Card className={cn("p-5 sm:p-6", surfaceCls)}>
                        <h3 className="text-base font-semibold text-white">
                          {previewTab === "in_stock"
                            ? "In Stock Drop Announcement"
                            : previewTab === "sold_out"
                              ? "In-Place Sold Out Update"
                              : "Persistent Live Status Widget"}
                        </h3>
                        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                          {previewTab === "in_stock"
                            ? "Published automatically once per new limited vehicle discovery, combining Components V2 layout, R2 archived photos, and direct storefront action buttons."
                            : previewTab === "sold_out"
                              ? "Replaces the existing message status cleanly when stock runs out—preserving your channel timeline and avoiding extra ping noise."
                              : "Maintains a compact at-a-glance status card displaying live check timestamps, active stock links, and up to three recent drops."}
                        </p>

                        <dl className="mt-5 space-y-3 border-t border-border pt-4 text-xs">
                          {previewTab === "widget" ? (
                            <>
                              <div className="flex items-start justify-between gap-4">
                                <dt className="text-muted-foreground">Vehicles Tracked</dt>
                                <dd className="text-right font-medium text-white">
                                  Up to {widgetTemplate.vehicleCount || 3} recent releases
                                </dd>
                              </div>
                              <div className="flex items-start justify-between gap-4">
                                <dt className="text-muted-foreground">Featured Angle</dt>
                                <dd className="text-right font-medium text-white">
                                  Image Slot {widgetTemplate.featuredImageSlot ?? 3} (fallback Slot 0)
                                </dd>
                              </div>
                              <div className="flex items-start justify-between gap-4">
                                <dt className="text-muted-foreground">Verification Cadence</dt>
                                <dd className="text-right font-medium text-white">
                                  {CHECK_INTERVAL_LABEL} &amp; synced on change
                                </dd>
                              </div>
                              <div className="flex items-start justify-between gap-4">
                                <dt className="text-muted-foreground">Deployment Control</dt>
                                <dd className="text-right font-medium text-white">
                                  Private /widget preview or Web Dashboard
                                </dd>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="flex items-start justify-between gap-4">
                                <dt className="text-muted-foreground">Accent Color</dt>
                                <dd className="inline-flex items-center gap-1.5 font-mono font-medium text-white">
                                  <span
                                    className="h-2.5 w-2.5 rounded-full border border-white/20"
                                    style={{
                                      backgroundColor:
                                        previewTab === "in_stock"
                                          ? inStockTemplate.accentColor
                                          : soldOutTemplate.accentColor,
                                    }}
                                  />
                                  {previewTab === "in_stock"
                                    ? inStockTemplate.accentColor
                                    : soldOutTemplate.accentColor}
                                </dd>
                              </div>
                              <div className="flex items-start justify-between gap-4">
                                <dt className="text-muted-foreground">Role Mentions</dt>
                                <dd className="text-right font-medium text-white">
                                  {previewTab === "in_stock"
                                    ? "Configured @roles pinged on launch"
                                    : "Suppressed on status edits"}
                                </dd>
                              </div>
                              <div className="flex items-start justify-between gap-4">
                                <dt className="text-muted-foreground">Timestamps</dt>
                                <dd className="text-right font-medium text-white">
                                  {previewTab === "in_stock"
                                    ? "First Detected & Last Verified"
                                    : "First Detected, Verified & Sold Out"}
                                </dd>
                              </div>
                              <div className="flex items-start justify-between gap-4">
                                <dt className="text-muted-foreground">Gallery Mode</dt>
                                <dd className="text-right font-medium text-white">
                                  {previewTab === "in_stock"
                                    ? inStockTemplate.galleryMode.replace(/_/g, " ")
                                    : soldOutTemplate.galleryMode.replace(/_/g, " ")}
                                </dd>
                              </div>
                            </>
                          )}
                        </dl>
                      </Card>

                      <div className="rounded-xl border border-border/80 bg-card/60 p-4 text-xs leading-relaxed text-muted-foreground">
                        Embed typography, emojis, colors, feature chips, and button labels are dynamically pulled from the active server presentation engine so previews match actual Discord dispatches.
                      </div>
                    </div>
                  </div>
                </Tabs>
              </div>
            </section>
          );
        }

        if (sectionKey === "workflow") {
          if (featuresCopy.showWorkflow === false || visibleWorkflowSteps.length === 0) return null;
          return (
            <section key="workflow" className="border-b border-border bg-background">
              <div className={cn("mx-auto max-w-7xl px-4 sm:px-6 lg:px-8", spacing.sectionPadding)}>
                <div className={cn("max-w-2xl", featuresCopy.sectionAlignment === "center" && "mx-auto text-center")}>
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    In-Place Lifecycle Tracking
                  </p>
                  <h2 className="mt-1.5 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                    {featuresCopy.workflowHeading}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {featuresCopy.workflowSubheading}
                  </p>
                </div>

                <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  {visibleWorkflowSteps.map((item, idx) => (
                    <Card
                      key={item.id}
                      className={cn(
                        "flex flex-col justify-between p-5 transition hover:border-zinc-700",
                        surfaceCls
                      )}
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-zinc-950">
                            <SiteIcon
                              name={item.icon}
                              fallback={
                                idx === 0
                                  ? "sparkles"
                                  : idx === 1
                                    ? "bell"
                                    : idx === 2
                                      ? "shield-check"
                                      : "refresh-cw"
                              }
                              className="h-4.5 w-4.5 text-white"
                            />
                          </div>
                          <span className="font-mono text-xs font-semibold text-zinc-500">
                            STEP {String(idx + 1).padStart(2, "0")}
                          </span>
                        </div>
                        <h3 className="mt-4 text-base font-semibold text-white">{item.title}</h3>
                        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                          {refreshStoreMonitorCadenceCopy(item.description)}
                        </p>
                      </div>
                    </Card>
                  ))}
                </div>

                <div className="mt-6 grid gap-3 rounded-xl border border-border bg-card/50 p-5 sm:grid-cols-3">
                  <div className="flex items-start gap-2.5 text-xs">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    <p className="text-zinc-300">
                      <strong className="text-white">Zero duplicate alerts:</strong>{" "}
                      Deduplication guards against repeated notifications on subsequent store scans.
                    </p>
                  </div>
                  <div className="flex items-start gap-2.5 text-xs">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    <p className="text-zinc-300">
                      <strong className="text-white">Respectful notifications:</strong>{" "}
                      Configured roles are never re-pinged when an existing drop switches to Sold Out.
                    </p>
                  </div>
                  <div className="flex items-start gap-2.5 text-xs">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    <p className="text-zinc-300">
                      <strong className="text-white">Protected stock state:</strong>{" "}
                      If storefront verification encounters a temporary block, stored stock availability stays intact.
                    </p>
                  </div>
                </div>
              </div>
            </section>
          );
        }

        if (sectionKey === "metadata_demo") {
          if (featuresCopy.showMetadataDemo === false) return null;
          return (
            <section key="metadata_demo" className="border-b border-border bg-zinc-950/75">
              <div className={cn("mx-auto max-w-7xl px-4 sm:px-6 lg:px-8", spacing.sectionPadding)}>
                <div className="max-w-2xl">
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Metadata Normalization
                  </p>
                  <h2 className="mt-1.5 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                    Detailed Listings Without the Clutter
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Raw storefront copy is automatically parsed into consistent structured chips, trading rules, and concise summaries—only displaying facts explicitly present in the listing.
                  </p>
                </div>

                {latestListing && latestPresentation ? (
                  <div className="mt-8 grid gap-6 lg:grid-cols-2">
                    <Card className={cn("flex flex-col justify-between p-6", surfaceCls)}>
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                            <FileText className="h-3.5 w-3.5" />
                            Raw Storefront Source
                          </span>
                          <span className="font-mono text-xs text-zinc-500">
                            Package #{latestListing.id}
                          </span>
                        </div>
                        <h3 className="mt-3 text-lg font-bold text-white">
                          {latestPresentation.source.name}
                        </h3>
                        <p className="mt-3 whitespace-pre-line rounded-lg border border-border bg-zinc-950 p-4 text-xs leading-relaxed text-zinc-300 select-text">
                          {latestPresentation.source.description ||
                            "No extended description text provided on storefront package."}
                        </p>
                      </div>

                      <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
                        <span>Source URL preserved intact</span>
                        {!previewMode && (
                          <a
                            href={
                              safeExternalUrl(latestPresentation.source.url) ||
                              `https://store.everfallcommunity.com/package/${latestListing.id}`
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-zinc-200 hover:text-white"
                          >
                            Open Store Page
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </Card>

                    <Card className={cn("flex flex-col justify-between p-6", surfaceCls)}>
                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-400">
                            <SlidersHorizontal className="h-3.5 w-3.5" />
                            Structured Presentation Output
                          </span>
                          <StockStatusPill isAvailable={latestListing.isAvailable} />
                        </div>

                        <h3 className="mt-3 text-lg font-bold text-white">
                          {latestPresentation.effective.name}
                        </h3>

                        {latestFeatures.length > 0 ? (
                          <FeatureChipList features={latestFeatures} className="mt-3" />
                        ) : (
                          <p className="mt-3 text-xs text-zinc-400">
                            No optional custom badges detected on this listing—nothing fabricated or assumed.
                          </p>
                        )}

                        <div className="mt-4 space-y-3 rounded-lg border border-border bg-zinc-950 p-4 text-xs">
                          <div>
                            <span className="text-[11px] uppercase tracking-wider text-zinc-500">
                              Short Summary (Cards &amp; Sold Out Mode)
                            </span>
                            <p className="mt-1 leading-relaxed text-zinc-200">
                              {latestPresentation.effective.shortDescription}
                            </p>
                          </div>
                          {(latestPresentation.effective.tradingRestriction ||
                            latestPresentation.effective.deliveryInfo) && (
                            <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
                              {latestPresentation.effective.tradingRestriction && (
                                <div>
                                  <span className="text-[11px] uppercase tracking-wider text-zinc-500">
                                    Trading Restriction
                                  </span>
                                  <p className="mt-0.5 font-medium text-zinc-200">
                                    {latestPresentation.effective.tradingRestriction}
                                  </p>
                                </div>
                              )}
                              {latestPresentation.effective.deliveryInfo && (
                                <div>
                                  <span className="text-[11px] uppercase tracking-wider text-zinc-500">
                                    Delivery Info
                                  </span>
                                  <p className="mt-0.5 font-medium text-zinc-200">
                                    {latestPresentation.effective.deliveryInfo}
                                  </p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
                        Admin overrides can refine titles, descriptions, and feature labels without erasing original extracted facts.
                      </p>
                    </Card>
                  </div>
                ) : (
                  <Card className={cn("mt-8 p-6 text-sm text-muted-foreground", surfaceCls)}>
                    Structured attribute parsing automatically extracts features like Quantity Limited, Custom Sound, Custom Options count, and trading rules as soon as a tracked vehicle is stored.
                  </Card>
                )}
              </div>
            </section>
          );
        }

        if (sectionKey === "galleries") {
          if (featuresCopy.showGalleries === false) return null;
          return (
            <section key="galleries" className="border-b border-border bg-background">
              <div className={cn("mx-auto max-w-7xl px-4 sm:px-6 lg:px-8", spacing.sectionPadding)}>
                <div className="grid items-center gap-10 lg:grid-cols-12">
                  <div className="space-y-4 lg:col-span-5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                      Archived R2 Galleries
                    </p>
                    <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                      Every Angle, One Announcement
                    </h2>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Every captured angle is archived cleanly in Cloudflare R2 so members can browse exterior, interior, and showcase shots right inside a single Discord announcement gallery—never cluttering the channel or expiring when Tebex removes old store listings.
                    </p>

                    <ul className="space-y-2.5 pt-2 text-xs text-zinc-300">
                      <li className="flex items-start gap-2">
                        <Layers className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
                        <span>
                          <strong className="text-white">Slot-ordered angles:</strong>{" "}
                          Announcements show full galleries (up to Discord&apos;s 10-image Components V2 limit), while widgets prefer Slot 3 with automatic fallback to Slot 0.
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <HardDrive className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
                        <span>
                          <strong className="text-white">Persistent R2 storage:</strong>{" "}
                          Historical galleries load instantaneously across web cards, Discord messages, and status boards.
                        </span>
                      </li>
                    </ul>
                  </div>

                  <div className="min-w-0 lg:col-span-7">
                    <Card className={cn("overflow-hidden p-4 sm:p-5", surfaceCls)}>
                      {galleryImages.length > 0 ? (
                        <div className="space-y-3">
                          <div className="relative aspect-[16/10] w-full overflow-hidden rounded-lg border border-border bg-zinc-950">
                            <img
                              src={galleryImages[safeGalleryIdx]}
                              alt={`${latestPresentation?.effective.name || "Vehicle"} — gallery angle ${safeGalleryIdx + 1}`}
                              referrerPolicy="no-referrer"
                              className="h-full w-full object-cover"
                            />
                            <div className="absolute left-3 top-3 rounded-md border border-white/15 bg-black/75 px-2.5 py-1 font-mono text-[11px] font-medium text-zinc-200 backdrop-blur-sm">
                              Slot {safeGalleryIdx}
                              {safeGalleryIdx === 0
                                ? " • Primary"
                                : safeGalleryIdx === (widgetTemplate.featuredImageSlot ?? 3)
                                  ? " • Widget Featured"
                                  : ""}
                            </div>

                            {galleryImages.length > 1 && (
                              <>
                                <button
                                  type="button"
                                  aria-label="Previous vehicle angle"
                                  onClick={() =>
                                    setGalleryIdx(
                                      (prev) =>
                                        (prev - 1 + galleryImages.length) % galleryImages.length
                                    )
                                  }
                                  className="absolute left-2.5 top-1/2 -translate-y-1/2 rounded-lg border border-white/15 bg-black/70 p-2 text-white transition hover:bg-black/90 cursor-pointer"
                                >
                                  <ChevronLeft className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  aria-label="Next vehicle angle"
                                  onClick={() =>
                                    setGalleryIdx((prev) => (prev + 1) % galleryImages.length)
                                  }
                                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg border border-white/15 bg-black/70 p-2 text-white transition hover:bg-black/90 cursor-pointer"
                                >
                                  <ChevronRight className="h-4 w-4" />
                                </button>
                                <div className="absolute bottom-2.5 right-3 rounded-md border border-white/10 bg-black/75 px-2.5 py-0.5 font-mono text-[11px] text-zinc-200 tabular-nums">
                                  {safeGalleryIdx + 1} / {galleryImages.length}
                                </div>
                              </>
                            )}
                          </div>

                          {galleryImages.length > 1 && (
                            <div className="thin-scrollbar flex items-center gap-2 overflow-x-auto overscroll-x-contain pb-1">
                              {galleryImages.map((src, idx) => (
                                <button
                                  key={`${latestListing?.id}-gallery-${idx}`}
                                  type="button"
                                  onClick={() => setGalleryIdx(idx)}
                                  aria-label={`Select Slot ${idx} image`}
                                  className={cn(
                                    "relative h-12 w-20 shrink-0 overflow-hidden rounded-md border transition cursor-pointer",
                                    idx === safeGalleryIdx
                                      ? "border-white ring-1 ring-white"
                                      : "border-border opacity-60 hover:opacity-100"
                                  )}
                                >
                                  <img
                                    src={src}
                                    alt=""
                                    loading="lazy"
                                    referrerPolicy="no-referrer"
                                    className="h-full w-full object-cover"
                                  />
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex aspect-[16/10] flex-col items-center justify-center rounded-lg border border-border bg-zinc-950 text-center">
                          <Images className="h-8 w-8 text-zinc-500" />
                          <p className="mt-2 text-xs text-muted-foreground">
                            Archived R2 images will display interactively here when listings exist.
                          </p>
                        </div>
                      )}
                    </Card>
                  </div>
                </div>
              </div>
            </section>
          );
        }

        if (sectionKey === "widget_showcase") {
          if (featuresCopy.showWidgetShowcase === false) return null;
          return (
            <section key="widget_showcase" className="border-b border-border bg-zinc-950/75">
              <div className={cn("mx-auto max-w-7xl px-4 sm:px-6 lg:px-8", spacing.sectionPadding)}>
                <div className="grid items-start gap-10 lg:grid-cols-12">
                  <div className="space-y-5 lg:col-span-5">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                        Live Status Board
                      </p>
                      <h2 className="mt-1.5 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                        A Live Status Board for Your Discord Server
                      </h2>
                      <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
                        Keep a single, pinned-friendly board in any channel showing when the store was last verified, currently active limited drops with direct store links, and recent releases.
                      </p>
                    </div>
                  </div>
                  <div className="min-w-0 lg:col-span-7">
                    <WidgetPreviewCard
                      template={widgetTemplate}
                      listings={listings.slice(0, widgetTemplate.vehicleCount || 3)}
                      monitorStatus={monitorStatus}
                      portalOrigin={publicOrigin}
                    />
                  </div>
                </div>
              </div>
            </section>
          );
        }

        if (sectionKey === "archive_showcase") {
          if (featuresCopy.showArchiveShowcase === false) return null;
          return (
            <section key="archive_showcase" className="border-b border-border bg-background">
              <div className={cn("mx-auto max-w-7xl px-4 sm:px-6 lg:px-8", spacing.sectionPadding)}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div className="max-w-2xl">
                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                      Permanent Archive
                    </p>
                    <h2 className="mt-1.5 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                      A History Worth Keeping
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      Every discovered limited vehicle, its detection and sold-out timestamps, extracted attributes, and R2 photo gallery remain searchable—even after Everfall retires store links.
                    </p>
                  </div>

                  {!previewMode && (
                    <Link
                      to="/history"
                      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2.5 text-xs font-semibold text-zinc-100 transition hover:bg-zinc-800 hover:text-white"
                    >
                      <History className="h-4 w-4" />
                      Explore Drop History
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </div>

                {recentArchivePreview.length > 0 ? (
                  <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {recentArchivePreview.map((listing) => (
                      <VehicleCard key={listing.id} listing={listing} />
                    ))}
                  </div>
                ) : (
                  <Card className={cn("mt-8 flex flex-col items-center justify-center p-10 text-center", surfaceCls)}>
                    <Database className="h-9 w-9 text-zinc-500" />
                    <h3 className="mt-3 text-base font-semibold text-white">
                      Historical Archive Ready
                    </h3>
                    <p className="mt-1 max-w-md text-xs text-muted-foreground">
                      Once store verification detects limited vehicles, searchable cards with stock filters and full multi-angle galleries populate across Drop History.
                    </p>
                  </Card>
                )}
              </div>
            </section>
          );
        }

        if (sectionKey === "server_controls") {
          if (featuresCopy.showServerControls === false) return null;
          return (
            <section key="server_controls" className="border-b border-border bg-zinc-950/75">
              <div className={cn("mx-auto max-w-7xl px-4 sm:px-6 lg:px-8", spacing.sectionPadding)}>
                <div className="max-w-2xl">
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Server Administration &amp; Isolation
                  </p>
                  <h2 className="mt-1.5 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                    Configured for Your Server
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Server administrators manage channels, mention roles, and server widgets independently while inheriting clean, platform-maintained embed templates and verified store data.
                  </p>
                </div>

                <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  {SERVER_CONTROL_FEATURES.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Card
                        key={item.title}
                        className={cn("p-5 transition hover:border-zinc-700", surfaceCls)}
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-zinc-950">
                          <Icon className="h-4.5 w-4.5 text-white" />
                        </div>
                        <h3 className="mt-4 text-base font-semibold text-white">{item.title}</h3>
                        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                          {item.description}
                        </p>
                      </Card>
                    );
                  })}
                </div>
              </div>
            </section>
          );
        }

        if (sectionKey === "capabilities") {
          if (featuresCopy.showCapabilities === false || visibleCapabilities.length === 0) {
            return null;
          }
          return (
            <section key="capabilities" className="border-b border-border bg-background">
              <div className={cn("mx-auto max-w-7xl px-4 sm:px-6 lg:px-8", spacing.sectionPadding)}>
                <div className="grid gap-10 lg:grid-cols-12">
                  <div className="space-y-4 lg:col-span-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                      Built for Reliability
                    </p>
                    <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                      {featuresCopy.capabilitiesHeading}
                    </h2>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {featuresCopy.capabilitiesSubheading}
                    </p>
                    {monitorStatus?.checkedAt && (
                      <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-zinc-300 tabular-nums">
                        <Clock className="h-3.5 w-3.5 text-zinc-400" />
                        Last Store Check: {formatLocalDateTime(monitorStatus.checkedAt)}
                      </div>
                    )}
                  </div>

                  <div
                    className={cn(
                      "grid gap-4 lg:col-span-8",
                      featuresCopy.capabilitiesColumns === 3
                        ? "sm:grid-cols-2 lg:grid-cols-3"
                        : "sm:grid-cols-2"
                    )}
                  >
                    {visibleCapabilities.map((cap, idx) => (
                      <div
                        key={cap.id}
                        className={cn(
                          "flex items-start gap-3.5 rounded-xl border p-4 transition hover:border-zinc-700",
                          surfaceCls
                        )}
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-zinc-950">
                          <SiteIcon
                            name={cap.icon}
                            fallback={
                              idx % 4 === 0
                                ? "shield-check"
                                : idx % 4 === 1
                                  ? "bell"
                                  : idx % 4 === 2
                                    ? "hard-drive"
                                    : "images"
                            }
                            className="h-4 w-4 text-zinc-200"
                          />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-white">{cap.title}</h3>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            {cap.description}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          );
        }

        if (sectionKey === "slash_commands") {
          if (featuresCopy.showSlashCommands === false) return null;
          return (
            <section
              key="slash_commands"
              className={cn("mx-auto max-w-7xl px-4 sm:px-6 lg:px-8", spacing.sectionPadding)}
            >
              <SlashCommandsSection
                variant="detailed"
                title="Discord Slash Commands"
                description="Control alert destinations, mention roles, manual checks, and live status boards right inside Discord—restricted cleanly to authorized server managers."
              />
            </section>
          );
        }

        if (sectionKey === "cta") {
          if (featuresCopy.showCta === false) return null;
          return (
            <section key="cta" className="border-t border-border bg-zinc-950">
              <div
                className={cn(
                  "mx-auto max-w-4xl px-4 sm:px-6 lg:px-8",
                  spacing.sectionPadding,
                  alignment.container
                )}
              >
                <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  {featuresCopy.ctaTitle}
                </h2>
                <p
                  className={cn(
                    "mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground",
                    featuresCopy.sectionAlignment !== "left" && "mx-auto"
                  )}
                >
                  {featuresCopy.ctaDescription}
                </p>

                <div className={cn("mt-7 flex flex-wrap items-center gap-3.5", alignment.ctaRow)}>
                  {previewMode ? (
                    <>
                      <span className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg sm:w-auto">
                        <SiteIcon name={featuresCopy.primaryCtaIcon} fallback="zap" className="h-4 w-4" />
                        {featuresCopy.primaryCtaLabel}
                      </span>
                      <span className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-6 py-3 text-sm font-semibold text-zinc-100 sm:w-auto">
                        <History className="h-4 w-4" />
                        Explore Drop History
                      </span>
                    </>
                  ) : (
                    <>
                      <a
                        href={featuresCopy.primaryCtaUrl || inviteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg transition hover:bg-zinc-200 sm:w-auto"
                      >
                        <SiteIcon name={featuresCopy.primaryCtaIcon} fallback="zap" className="h-4 w-4" />
                        {featuresCopy.primaryCtaLabel}
                      </a>
                      <Link
                        to="/history"
                        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-6 py-3 text-sm font-semibold text-zinc-100 transition hover:bg-zinc-800 hover:text-white sm:w-auto"
                      >
                        <History className="h-4 w-4" />
                        Explore Drop History
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </section>
          );
        }

        return null;
      })}
      <PublicExtraSections sections={featuresCopy.extraSections} previewMode={previewMode} />
    </>
  );
}
