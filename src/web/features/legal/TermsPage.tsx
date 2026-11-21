import { useQuery } from "@tanstack/react-query";
import { apiFetch, PublicPresentationResponse, PublicStatusResponse } from "@/lib/api";
import { DEFAULT_SITE_PAGES_CONFIG } from "../../../shared/presentation";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { PageSeo } from "@/components/seo/PageSeo";
import { LegalPageSections } from "./LegalPageSections";

export function TermsPage() {
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

  const terms =
    presentationData?.pages?.terms ||
    statusData?.pages?.terms ||
    DEFAULT_SITE_PAGES_CONFIG.terms;

  return (
    <PublicLayout>
      <PageSeo
        title={`${terms.heading} | Everfall Limited Watcher`}
        description={terms.subheading}
      />
      <LegalPageSections kind="terms" config={terms} />
    </PublicLayout>
  );
}
