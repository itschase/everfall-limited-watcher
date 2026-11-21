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
      <section className="mx-auto w-full max-w-6xl px-4 pb-8" aria-labelledby="presence-privacy-title">
        <div className="rounded-xl border border-border bg-card/70 p-5">
          <h2 id="presence-privacy-title" className="text-base font-semibold text-foreground">
            Discord Bot Presence
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            When enabled by an administrator, a Cloudflare Durable Object connects to the Discord
            Gateway to set the bot&apos;s global activity. It uses public listing and store-check
            data with administrator-configured text; it does not subscribe to member presence
            events or read private messages. Rich Presence settings and optional status-card
            publishing state are stored in Cloudflare D1, while Gateway session and connection
            status are stored in Durable Object storage. An optional Discord status-card webhook
            URL is held as a Cloudflare Worker secret. The card is created only after an
            administrator explicitly publishes it; later changes edit that same message.
          </p>
        </div>
      </section>
      <AutomationNotice kind="privacy" includeTestEvents />
    </PublicLayout>
  );
}
