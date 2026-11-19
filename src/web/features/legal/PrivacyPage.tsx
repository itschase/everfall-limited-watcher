import { Link } from "@tanstack/react-router";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Card } from "@/components/ui/card";

export function PrivacyPage() {
  return (
    <PublicLayout>
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <Card className="p-6 sm:p-10">
          <div className="border-b border-border pb-6">
            <h1 className="text-3xl font-extrabold tracking-tight text-white">Privacy Policy</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Effective Date: November 17, 2026 &bull; Operated by xchasex
            </p>
          </div>

          <div className="mt-8 space-y-7 text-sm leading-relaxed text-zinc-300">
            <p>
              Everfall Limited Watcher (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) is operated by
              xchasex. This Privacy Policy explains how information is collected, used, stored, and handled
              when you access the Everfall Limited Watcher website or use its Discord application.
            </p>

            <section className="space-y-2">
              <h2 className="text-lg font-semibold text-white">1. Information We Collect</h2>
              <p>
                <strong className="text-white">Discord Account Information:</strong> When you sign in using
                Discord OAuth (<code>identify</code> and <code>guilds</code> scopes), we receive your
                Discord user ID, username, avatar URL, and your accessible Discord server list and server
                permissions.
              </p>
              <p>
                <strong className="text-white">Discord Server Configuration &amp; Widget Tracking:</strong> When Everfall Limited Watcher
                is configured in a Discord server, we store server IDs, selected notification channel IDs,
                configured mention role IDs, environment designations (production vs. test), deployed live
                status widget channel and message IDs (only when explicitly deployed by an administrator via{" "}
                <code>/widget</code>), and sent listing message IDs so posted Discord embeds can be updated
                when vehicles become sold out.
              </p>
              <p>
                <strong className="text-white">Application Activity &amp; Monitoring Logs:</strong> We retain
                recent notification delivery logs (up to the most recent 100 dispatch entries containing
                server ID, channel ID, Discord message ID, timestamp, and delivery outcome) and store
                verification monitor logs (retained for up to 7 days) alongside store check status timestamps to operate and troubleshoot the service.
              </p>
              <p>
                <strong className="text-white">Store Listing Information &amp; Media:</strong> Everfall Limited Watcher collects
                publicly accessible product metadata from the Everfall storefront, including listing names,
                descriptions, product URLs, archived or administrator-managed vehicle images, availability state, and detection or
                verification timestamps.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-semibold text-white">2. How We Use Information</h2>
              <ul className="list-disc space-y-1 pl-5 text-zinc-300">
                <li>Authenticate users through Discord and verify Manage Server or Administrator rights.</li>
                <li>Save notification channel and mention role preferences per Discord server.</li>
                <li>Deliver Discord notifications and manual/test dispatches to configured channels.</li>
                <li>Display public recent drops and authenticated historical vehicle archives.</li>
                <li>Prevent duplicate notifications, maintain security, and diagnose delivery errors.</li>
              </ul>
              <p>
                We do not require or collect payment information. Everfall Limited Watcher processes application
                interactions and server configuration rather than reading ordinary Discord chat messages.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-semibold text-white">3. Cookies and Authentication</h2>
              <p>
                Everfall Limited Watcher uses essential cookies only: an HMAC-signed authenticated session cookie (
                <code>everfall_session</code>) with a maximum lifetime of 24 hours, and a temporary OAuth
                state cookie (<code>everfall_oauth_state</code>) lasting up to 10 minutes during login. No
                advertising or third-party tracking cookies are used.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-semibold text-white">4. Data Storage and Retention</h2>
              <p>
                Everfall Limited Watcher runs on Cloudflare infrastructure (Cloudflare Workers, Workers KV,
                and Cloudflare R2 object storage for archived listing media). Cached user Discord server lists (
                <code>user_guilds:*</code>) automatically expire after 24 hours, and temporary Discord API
                guild caches expire within 10 minutes to 24 hours. Server configurations, widget deployment
                pointers, and historical public vehicle records (alongside archived listing images stored in
                Cloudflare R2) are retained to provide ongoing drop notifications, live embed updates, and
                historical reference until modified or removed. Removing the bot from a Discord server does
                not automatically purge shared public vehicle history or historical delivery records unless
                requested.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-semibold text-white">5. Third-Party Infrastructure</h2>
              <p>
                We rely on <strong className="text-white">Discord</strong> (OAuth authentication, slash
                commands, and message delivery/editing; see{" "}
                <a
                  href="https://discord.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-100 underline decoration-zinc-500 underline-offset-4 hover:decoration-white"
                >
                  discord.com/privacy
                </a>
                ) and <strong className="text-white">Cloudflare</strong> (edge application execution, Workers KV,
                and Cloudflare R2 object storage). We do not sell personal information or use Discord account
                data for advertising.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-semibold text-white">6. Your Choices, Access &amp; Deletion</h2>
              <p>
                You can browse recent drops without signing in, log out at any time to clear your session
                cookie, clear your server&apos;s configuration or mention roles from the Server Dashboard, or
                remove the bot from your Discord server. To request inspection or deletion of user or
                server-specific configuration records, contact us using the address below.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-semibold text-white">7. Contact &amp; Related Terms</h2>
              <p>
                For questions about this Privacy Policy or data requests, contact{" "}
                <a href="mailto:21324442+itschase@users.noreply.github.com" className="text-zinc-100 underline decoration-zinc-500 underline-offset-4 hover:decoration-white">
                  21324442+itschase@users.noreply.github.com
                </a>
                . Review our{" "}
                <Link to="/terms-of-service" className="text-zinc-100 underline decoration-zinc-500 underline-offset-4 hover:decoration-white">
                  Terms of Service
                </Link>{" "}
                for usage rules.
              </p>
            </section>
          </div>
        </Card>
      </div>
    </PublicLayout>
  );
}
