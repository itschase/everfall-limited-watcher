import { useQuery } from "@tanstack/react-query";
import { apiFetch, PublicPresentationResponse, PublicStatusResponse } from "@/lib/api";
import { DEFAULT_SITE_PAGES_CONFIG } from "../../../shared/presentation";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { PageSeo } from "@/components/seo/PageSeo";
import { LegalPageSections } from "./LegalPageSections";
import { AutomationNotice } from "./AutomationNotice";

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
      <section className="mx-auto w-full max-w-6xl px-4 pb-8" aria-labelledby="presence-terms-title">
        <div className="rounded-xl border border-border bg-card/70 p-5">
          <h2 id="presence-terms-title" className="text-base font-semibold text-foreground">
            Bot Presence and Status Cards
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Discord activity settings apply globally to the Everfall Limited Watcher bot and are
            visible to Discord users. Activity text is based on public store-monitoring data.
            Administrators may separately configure a webhook status card and HTTPS link; publishing
            the card requires an explicit action, after which the Cloudflare Gateway edits the same message
            rather than posting on every settings save. Administrators are responsible for the
            accuracy and destination of their configured text and links.
          </p>
        </div>
      </section>
      <section className="mx-auto w-full max-w-6xl px-4 pb-8" aria-labelledby="discord-profile-terms-title">
        <div className="rounded-xl border border-border bg-card/70 p-5">
          <h2 id="discord-profile-terms-title" className="text-base font-semibold text-foreground">
            Discord Profiles and External Links
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            When you sign in, Discord profile appearance details it makes available may be shown
            in your account menu and dashboard. The creator&apos;s Discord profile and GitHub link are
            displayed publicly on the creator card. Everfall Limited Watcher does not control
            Discord or GitHub, and your use of those services is subject to their respective terms
            and policies.
          </p>
        </div>
      </section>
      <AutomationNotice kind="terms" includeTestEvents />
    </PublicLayout>
  );
}
