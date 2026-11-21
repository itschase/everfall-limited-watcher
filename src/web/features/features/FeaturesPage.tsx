import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  apiFetch,
  PublicListingsResponse,
  PublicPresentationResponse,
  PublicStatusResponse,
} from "@/lib/api";
import {
  DEFAULT_IN_STOCK_TEMPLATE,
  DEFAULT_SITE_PAGES_CONFIG,
  DEFAULT_SOLD_OUT_TEMPLATE,
  DEFAULT_WIDGET_TEMPLATE,
} from "../../../shared/presentation";
import { useSession } from "@/features/auth/useAuthActions";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { PageSeo } from "@/components/seo/PageSeo";
import { FeaturesPageSections } from "./FeaturesPageSections";

export function FeaturesPage() {
  const queryClient = useQueryClient();
  const { data: session } = useSession();

  const { data: listingsData, isLoading: isListingsLoading } = useQuery({
    queryKey: ["public-listings"],
    queryFn: () => apiFetch<PublicListingsResponse>("/api/public/listings"),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const { data: presentationData, isLoading: isPresentationLoading } = useQuery({
    queryKey: ["public-presentation"],
    queryFn: () => apiFetch<PublicPresentationResponse>("/api/public/presentation"),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const { data: statusHeartbeat } = useQuery({
    queryKey: ["public-status"],
    queryFn: () => apiFetch<PublicStatusResponse>("/api/public/status"),
    staleTime: 30_000,
    refetchInterval: 45_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!statusHeartbeat || !listingsData) return;
    const nextCat = statusHeartbeat.catalogVersion || 0;
    const prevCat = listingsData.catalogVersion || 0;
    if (nextCat > 0 && prevCat > 0 && nextCat !== prevCat) {
      void queryClient.invalidateQueries({ queryKey: ["public-listings"] });
    }
  }, [statusHeartbeat, listingsData, queryClient]);

  useEffect(() => {
    if (!statusHeartbeat || !presentationData) return;
    const nextPres = statusHeartbeat.presentationVersion || 0;
    const prevPres = presentationData.version || 0;
    if (nextPres > 0 && prevPres > 0 && nextPres !== prevPres) {
      void queryClient.invalidateQueries({ queryKey: ["public-presentation"] });
    }
  }, [statusHeartbeat, presentationData, queryClient]);

  const inviteUrl =
    session?.inviteUrl ||
    "https://discord.com/oauth2/authorize?client_id=1571958001928245378&permissions=8462935362366544&integration_type=0&scope=bot+applications.commands";

  const publicOrigin =
    presentationData?.publicOrigin ||
    session?.publicOrigin ||
    (typeof window !== "undefined"
      ? window.location.origin
      : "https://everfall-limited-watcher.itschase.workers.dev");

  const listings = listingsData?.listings || [];
  const inStockTemplate =
    presentationData?.announcements?.inStock || DEFAULT_IN_STOCK_TEMPLATE;
  const soldOutTemplate =
    presentationData?.announcements?.soldOut || DEFAULT_SOLD_OUT_TEMPLATE;
  const widgetTemplate =
    presentationData?.widgetDefault || DEFAULT_WIDGET_TEMPLATE;
  const featuresCopy =
    presentationData?.pages?.features ||
    statusHeartbeat?.pages?.features ||
    DEFAULT_SITE_PAGES_CONFIG.features;
  const monitorStatus =
    statusHeartbeat?.monitorStatus || listingsData?.monitorStatus || null;

  const featuresCanonical = `${publicOrigin.replace(/\/+$/, "")}/features`;
  const featuresJsonLd = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: `${featuresCopy.heading} | Everfall Limited Watcher`,
      url: featuresCanonical,
      description:
        "Discover how Everfall Limited Watcher tracks limited vehicle releases with automated Discord embeds, in-place sold-out updates, multi-image galleries, live server status widgets, and preserved drop history.",
      mainEntity: {
        "@type": "SoftwareApplication",
        name: "Everfall Limited Watcher",
        applicationCategory: "UtilitiesApplication",
        operatingSystem: "Discord, Web",
        isAccessibleForFree: true,
        url: publicOrigin,
      },
    }),
    [featuresCanonical, featuresCopy.heading, publicOrigin]
  );

  return (
    <PublicLayout>
      <PageSeo
        title="Features | Everfall Limited Watcher — Discord Limited Vehicle Alerts"
        description="See what your Discord server receives: instant In Stock embeds, in-place Sold Out updates, multi-image galleries, live /widget status boards, and preserved drop history."
        canonicalUrl={featuresCanonical}
        jsonLd={featuresJsonLd}
      />

      <FeaturesPageSections
        featuresCopy={featuresCopy}
        listings={listings}
        inStockTemplate={inStockTemplate}
        soldOutTemplate={soldOutTemplate}
        widgetTemplate={widgetTemplate}
        monitorStatus={monitorStatus}
        publicOrigin={publicOrigin}
        inviteUrl={inviteUrl}
        isPreviewLoading={isListingsLoading || isPresentationLoading}
      />
    </PublicLayout>
  );
}
