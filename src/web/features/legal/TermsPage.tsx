import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, PublicPresentationResponse, PublicStatusResponse } from "@/lib/api";
import { DEFAULT_SITE_PAGES_CONFIG } from "../../../shared/presentation";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { PageSeo } from "@/components/seo/PageSeo";
import { Card } from "@/components/ui/card";

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
    statusData?.pages?.terms ||
    presentationData?.pages?.terms ||
    DEFAULT_SITE_PAGES_CONFIG.terms;
  const requiredSection = DEFAULT_SITE_PAGES_CONFIG.terms.sections.find(
    (section) => section.id === "terms-3"
  );
  const termsSections = terms.sections.map((section) =>
    requiredSection && section.id === requiredSection.id ? requiredSection : section
  );
  if (requiredSection && !termsSections.some((section) => section.id === requiredSection.id)) {
    termsSections.push(requiredSection);
  }

  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(terms.contactEmail);

  return (
    <PublicLayout>
      <PageSeo
        title={`${terms.heading} | Everfall Limited Watcher`}
        description={terms.subheading}
      />
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <Card className="p-6 sm:p-10">
          <div className="border-b border-border pb-6">
            <span className="inline-block rounded-full border border-border bg-zinc-950 px-3 py-0.5 text-xs font-medium text-zinc-300">
              {terms.badgeText}
            </span>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-white">
              {terms.heading}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Effective Date: {terms.effectiveDate} &bull; Operated by {terms.operatorName}
            </p>
            {terms.subheading && (
              <p className="mt-3 text-sm leading-relaxed text-zinc-300">{terms.subheading}</p>
            )}
          </div>

          <div className="mt-8 space-y-7 text-sm leading-relaxed text-zinc-300">
            {termsSections.map((sec) => (
              <section key={sec.id} className="space-y-2">
                <h2 className="text-lg font-semibold text-white">{sec.heading}</h2>
                <p className="whitespace-pre-line">{sec.body}</p>
              </section>
            ))}

            <section className="space-y-2 border-t border-border pt-6">
              <h2 className="text-lg font-semibold text-white">Privacy &amp; Contact</h2>
              <p>
                Information about how Everfall Limited Watcher collects and stores configuration data is available in our{" "}
                <Link
                  to="/privacy-policy"
                  className="text-zinc-100 underline decoration-zinc-500 underline-offset-4 hover:decoration-white"
                >
                  Privacy Policy
                </Link>
                . For questions regarding these Terms, contact{" "}
                {isEmail ? (
                  <a
                    href={`mailto:${terms.contactEmail}`}
                    className="text-zinc-100 underline decoration-zinc-500 underline-offset-4 hover:decoration-white"
                  >
                    {terms.contactEmail}
                  </a>
                ) : (
                  <span className="text-white">{terms.contactEmail}</span>
                )}
                .
              </p>
            </section>
          </div>
        </Card>
      </div>
    </PublicLayout>
  );
}
