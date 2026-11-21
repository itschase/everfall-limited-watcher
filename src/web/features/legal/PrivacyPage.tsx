import { useQuery } from "@tanstack/react-query";
import { apiFetch, PublicPresentationResponse, PublicStatusResponse } from "@/lib/api";
import { DEFAULT_SITE_PAGES_CONFIG } from "../../../shared/presentation";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { PageSeo } from "@/components/seo/PageSeo";
import { LegalPageSections } from "./LegalPageSections";
import { AutomationNotice } from "./AutomationNotice";

export function PrivacyPage() {
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

  const privacy =
    presentationData?.pages?.privacy ||
    statusData?.pages?.privacy ||
    DEFAULT_SITE_PAGES_CONFIG.privacy;

  return (
    <PublicLayout>
      <PageSeo
        title={`${privacy.heading} | Everfall Limited Watcher`}
        description={privacy.subheading}
      />
      <LegalPageSections kind="privacy" config={privacy} />
      <AutomationNotice kind="privacy" includeTestEvents />
    </PublicLayout>
  );
}
