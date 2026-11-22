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
      <section className="mx-auto w-full max-w-6xl px-4 pb-8" aria-labelledby="discord-profile-privacy-title">
        <div className="rounded-xl border border-border bg-card/70 p-5">
          <h2 id="discord-profile-privacy-title" className="text-base font-semibold text-foreground">
            Discord Profile Information
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Discord sign-in uses the existing profile authorization to display the information
            Discord provides, which may include your username and display name, avatar, banner,
            accent color, avatar decoration, nameplate, and primary-server tag or badge. For
            signed-in users, these appearance details are carried in the signed session cookie,
            which expires after 24 hours; we do not persist them as a separate user profile. The
            bot creator&apos;s public profile appearance is cached in D1 (with the configured legacy
            KV fallback) so the public creator card can be rendered while the creator is signed
            out. Profile images are loaded from Discord&apos;s CDN. The creator card also links to the
            creator&apos;s GitHub profile; following that link takes you to GitHub and is subject to
            GitHub&apos;s privacy practices.
          </p>
        </div>
      </section>
      <section className="mx-auto max-w-4xl px-4 pb-6 sm:px-6"><h2 className="text-base font-semibold">Automation recovery and test previews</h2><p className="mt-2 text-sm text-muted-foreground">We store per-operation automation errors and check, success, and cooldown timestamps so server managers can diagnose and retry a specific failed operation. Administrator test previews temporarily store the chosen settings, vehicle names, and generated cover in the existing application database for ten minutes. Expired previews cannot be deployed and are removed during subsequent preview generation. Permission checks read bot role and channel permissions without posting messages. Generated listing covers may be cached in server memory for up to fifteen minutes; archived image changes invalidate those cached covers.</p></section>
      <AutomationNotice kind="privacy" includeTestEvents />
    </PublicLayout>
  );
}
