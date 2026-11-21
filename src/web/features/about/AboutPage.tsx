import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, PublicPresentationResponse, PublicStatusResponse } from "@/lib/api";
import { DEFAULT_SITE_PAGES_CONFIG } from "../../../shared/presentation";
import { useSession } from "@/features/auth/useAuthActions";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { PageSeo } from "@/components/seo/PageSeo";
import { AboutPageSections } from "./AboutPageSections";

export function AboutPage() {
  const { data: session } = useSession();

  const { data: statusData } = useQuery<PublicStatusResponse>({
    queryKey: ["public-status"],
    queryFn: () => apiFetch<PublicStatusResponse>("/api/public/status"),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const { data: presentationData } = useQuery<PublicPresentationResponse>({
    queryKey: ["public-presentation"],
    queryFn: () => apiFetch<PublicPresentationResponse>("/api/public/presentation"),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const about =
    presentationData?.pages?.about ||
    statusData?.pages?.about ||
    DEFAULT_SITE_PAGES_CONFIG.about;

  const publicOrigin =
    presentationData?.publicOrigin ||
    session?.publicOrigin ||
    (typeof window !== "undefined"
      ? window.location.origin
      : "https://everfall-limited-watcher.itschase.workers.dev");

  const canonicalUrl = `${publicOrigin.replace(/\/+$/, "")}/about`;
  const aboutJsonLd = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@type": "AboutPage",
      name: `${about.heading} | Everfall Limited Watcher`,
      url: canonicalUrl,
      description: about.subheading,
    }),
    [about.heading, about.subheading, canonicalUrl]
  );

  return (
    <PublicLayout>
      <PageSeo
        title="About | Everfall Limited Watcher"
        description={about.subheading}
        canonicalUrl={canonicalUrl}
        jsonLd={aboutJsonLd}
      />

      <AboutPageSections about={about} />
    </PublicLayout>
  );
}
