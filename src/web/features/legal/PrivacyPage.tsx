import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, PublicPresentationResponse, PublicStatusResponse } from "@/lib/api";
import { DEFAULT_SITE_PAGES_CONFIG } from "../../../shared/presentation";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { PageSeo } from "@/components/seo/PageSeo";
import { Card } from "@/components/ui/card";

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
    statusData?.pages?.privacy ||
    presentationData?.pages?.privacy ||
    DEFAULT_SITE_PAGES_CONFIG.privacy;
  const requiredSectionIds = new Set(["priv-1", "priv-2", "priv-3"]);
  const requiredSections = DEFAULT_SITE_PAGES_CONFIG.privacy.sections.filter((section) =>
    requiredSectionIds.has(section.id)
  );
  const sectionsById = new Map(requiredSections.map((section) => [section.id, section]));
  const privacySections = privacy.sections.map(
    (section) => sectionsById.get(section.id) || section
  );
  for (const section of requiredSections) {
    if (!privacySections.some((existing) => existing.id === section.id)) {
      privacySections.push(section);
    }
  }

  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(privacy.contactEmail);

  return (
    <PublicLayout>
      <PageSeo
        title={`${privacy.heading} | Everfall Limited Watcher`}
        description={privacy.subheading}
      />
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <Card className="p-6 sm:p-10">
          <div className="border-b border-border pb-6">
            <span className="inline-block rounded-full border border-border bg-zinc-950 px-3 py-0.5 text-xs font-medium text-zinc-300">
              {privacy.badgeText}
            </span>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-white">
              {privacy.heading}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Effective Date: {privacy.effectiveDate} &bull; Operated by {privacy.operatorName}
            </p>
            {privacy.subheading && (
              <p className="mt-3 text-sm leading-relaxed text-zinc-300">{privacy.subheading}</p>
            )}
          </div>

          <div className="mt-8 space-y-7 text-sm leading-relaxed text-zinc-300">
            {privacySections.map((sec) => (
              <section key={sec.id} className="space-y-2">
                <h2 className="text-lg font-semibold text-white">{sec.heading}</h2>
                <p className="whitespace-pre-line">{sec.body}</p>
              </section>
            ))}

            <section className="space-y-2 border-t border-border pt-6">
              <h2 className="text-lg font-semibold text-white">Contact &amp; Related Terms</h2>
              <p>
                For questions regarding this Privacy Policy or data access/deletion requests, contact{" "}
                {isEmail ? (
                  <a
                    href={`mailto:${privacy.contactEmail}`}
                    className="text-zinc-100 underline decoration-zinc-500 underline-offset-4 hover:decoration-white"
                  >
                    {privacy.contactEmail}
                  </a>
                ) : (
                  <span className="text-white">{privacy.contactEmail}</span>
                )}
                . Review our{" "}
                <Link
                  to="/terms-of-service"
                  className="text-zinc-100 underline decoration-zinc-500 underline-offset-4 hover:decoration-white"
                >
                  Terms of Service
                </Link>{" "}
                for usage guidelines.
              </p>
            </section>
          </div>
        </Card>
      </div>
    </PublicLayout>
  );
}
