import { useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Bell,
  ChevronLeft,
  ChevronRight,
  History,
  Images,
  Loader2,
  Plus,
  Terminal,
  Users,
} from "lucide-react";
import { apiFetch, BotStatus, PublicListingsResponse } from "@/lib/api";
import { formatLocalTime } from "@/lib/utils";
import { useAuthActions, useSession } from "@/features/auth/useAuthActions";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { VehicleCard } from "@/components/listings/VehicleCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

function BotHealthBadge({ status }: { status: BotStatus }) {
  if (status === "checking") {
    return (
      <span className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-zinc-300">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-300" />
        Refreshing
      </span>
    );
  }
  if (status === "offline") {
    return (
      <span className="inline-flex items-center gap-2 rounded-md border border-red-500/35 bg-red-950/60 px-2.5 py-1 text-xs font-medium text-red-300">
        <span className="h-2 w-2 rounded-full bg-red-400" />
        Bot Offline
      </span>
    );
  }
  if (status === "degraded") {
    return (
      <span className="inline-flex items-center gap-2 rounded-md border border-amber-500/35 bg-amber-950/60 px-2.5 py-1 text-xs font-medium text-amber-300">
        <span className="h-2 w-2 rounded-full bg-amber-400" />
        Verification Degraded
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 rounded-md border border-emerald-500/35 bg-emerald-950/60 px-2.5 py-1 text-xs font-medium text-emerald-300">
      <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
      Bot Online
    </span>
  );
}

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

  const { data: session } = useSession();
  const { startLogin, isLoggingIn } = useAuthActions((dest) => {
    if (dest) void navigate({ to: dest as any });
  });

  const { data: listingsData, isLoading, isFetching } = useQuery({
    queryKey: ["public-listings"],
    queryFn: () => apiFetch<PublicListingsResponse>("/api/public/listings"),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  const listings = listingsData?.listings || [];
  const desktopListings = listings.slice(0, Math.min(desktopVisibleCount, 10));
  const botStatus: BotStatus = listingsData?.botStatus || session?.botStatus || "online";
  const lastCheckedAt = listingsData?.lastCheckedAt || listingsData?.lastSuccessAt;
  const inviteUrl =
    session?.inviteUrl ||
    "https://discord.com/oauth2/authorize?client_id=1571958001928245378&permissions=8462935362366544&integration_type=0&scope=bot+applications.commands";

  const scrollCarousel = (direction: "left" | "right") => {
    if (!carouselRef.current) return;
    const delta = direction === "left" ? -320 : 320;
    carouselRef.current.scrollBy({ left: delta, behavior: "smooth" });
  };

  return (
    <PublicLayout>
      {/* Simplified Hero Section (No 24/7 STORE MONITORING badge, No Preview Drops button) */}
      <section className="border-b border-border bg-background">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 sm:py-24 lg:px-8">
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            Never Miss an Everfall Limited Drop
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Track Everfall's limited vehicle releases, inspect verified stock availability, and receive structured Discord alerts with archived multi-image galleries.
          </p>
          <div className="mt-8 flex justify-center">
            <a
              href={inviteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-zinc-200"
            >
              <Plus className="h-4 w-4" />
              Add to Discord
            </a>
          </div>
        </div>
      </section>

      {/* Limited Drop History Showcase */}
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
              <span className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1 text-xs font-medium text-zinc-300 tabular-nums">
                {isFetching && listingsData ? (
                  <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />
                ) : null}
                Last Checked:{" "}
                {lastCheckedAt ? formatLocalTime(lastCheckedAt) : "Awaiting scheduled check"}
              </span>
              <BotHealthBadge status={botStatus} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            {session?.authenticated ? (
              <Button variant="outline" size="sm" asChild>
                <Link to="/history">
                  <History className="h-4 w-4" />
                  Full History Archive
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
                Sign in for Full Archive
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
        ) : listings.length === 0 ? (
          <Card className="mt-8 p-10 text-center">
            <p className="text-sm text-muted-foreground">
              No limited vehicle releases have been recorded yet.
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
                  isRefreshing={botStatus === "checking"}
                />
              ))}
            </div>

            {listings.length > desktopListings.length && desktopVisibleCount < 10 && (
              <div className="mt-8 hidden justify-center md:flex">
                <Button
                  variant="secondary"
                  onClick={() => setDesktopVisibleCount((c) => Math.min(10, c + 3))}
                >
                  Load More ({listings.length - desktopListings.length} remaining)
                </Button>
              </div>
            )}

            {(listingsData?.hasMoreArchive || (desktopVisibleCount >= 10 && listings.length >= 10)) && (
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

            {/* Mobile Horizontal Swipeable Carousel (capped at 10 recent vehicles) */}
            <div className="mt-6 md:hidden">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  Swipe to browse recent drops ({listings.length})
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
                {listings.map((car) => (
                  <div key={`mobile-${car.id}`} className="w-[86vw] max-w-[360px] shrink-0 snap-start">
                    <VehicleCard
                      listing={car}
                      isRefreshing={botStatus === "checking"}
                    />
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </section>

      {/* Feature Cards (Flat white Lucide SVG icons) */}
      <section className="border-t border-border bg-zinc-950/70">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="grid gap-6 md:grid-cols-3">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <Card key={feature.title} className="flex flex-col p-6">
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
                className="rounded-lg border border-border bg-zinc-950/80 p-4"
              >
                <code className="font-mono text-xs font-semibold text-zinc-100">
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
    </PublicLayout>
  );
}
