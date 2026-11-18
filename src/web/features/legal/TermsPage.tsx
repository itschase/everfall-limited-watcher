import { Link } from "@tanstack/react-router";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Card } from "@/components/ui/card";

export function TermsPage() {
  return (
    <PublicLayout>
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <Card className="p-6 sm:p-10">
          <div className="border-b border-border pb-6">
            <h1 className="text-3xl font-extrabold tracking-tight text-white">Terms of Service</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Effective Date: November 17, 2026 &bull; Operated by xchasex
            </p>
          </div>

          <div className="mt-8 space-y-7 text-sm leading-relaxed text-zinc-300">
            <p>
              Welcome to Everfall Limited Watcher. These Terms of Service govern your access to and use of the
              Everfall Limited Watcher website and Discord application, operated by xchasex (&ldquo;we,&rdquo;
              &ldquo;us,&rdquo; or &ldquo;our&rdquo;). By accessing or using Everfall Limited Watcher, you agree to
              these Terms.
            </p>

            <section className="space-y-2">
              <h2 className="text-lg font-semibold text-white">1. About Everfall Limited Watcher</h2>
              <p>
                Everfall Limited Watcher is an independent service that monitors publicly accessible Everfall limited
                vehicle store listings and provides notifications, listing previews, and historical
                information through a website, Discord bot, server configuration tools, and historical
                listing records.
              </p>
              <p>
                Everfall Limited Watcher is not the seller of the products displayed. Purchases are completed
                through the relevant external storefront. Everfall Limited Watcher is an independent,
                community-created utility and is not affiliated with, endorsed by, sponsored by, or powered
                by Everfall, Tebex, or the associated store operators unless expressly stated otherwise.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-semibold text-white">2. Eligibility and Discord Access</h2>
              <p>
                You must comply with Discord&apos;s applicable terms and minimum age requirements when using
                the Discord application. Some functionality requires a Discord account and authorization
                through Discord OAuth. Server configuration features are intended only for users with
                appropriate Manage Server or Administrator permissions in the relevant Discord server.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-semibold text-white">3. Service Functionality</h2>
              <p>
                Everfall Limited Watcher attempts to monitor supported store listings and provide updates about newly
                discovered products and changes in availability. Monitoring results depend on external
                storefront availability, network conditions, and technical factors. We do not guarantee that
                every listing will be detected immediately or that stock information will always be
                accurate. Information displayed by Everfall Limited Watcher should not be treated as a guarantee
                that a product is available for purchase.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-semibold text-white">4. Discord Server Management</h2>
              <p>
                Users with appropriate Discord permissions may configure notification channels and mention
                roles for servers where Everfall Limited Watcher is installed. You are responsible for ensuring
                that your configuration complies with your server&apos;s rules and Discord&apos;s policies. We may
                restrict functionality or disable access where necessary to protect the service, prevent
                abuse, or comply with applicable requirements.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-semibold text-white">5. Acceptable Use</h2>
              <p>You agree not to:</p>
              <ul className="list-disc space-y-1 pl-5 text-zinc-300">
                <li>Attempt to access administrative features without authorization.</li>
                <li>Abuse application commands or automated endpoints.</li>
                <li>Interfere with monitoring or notification delivery.</li>
                <li>Attempt to circumvent security or rate-limiting mechanisms.</li>
                <li>Use the service to violate applicable laws or Discord policies.</li>
              </ul>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-semibold text-white">6. External Services and Links</h2>
              <p>
                Everfall Limited Watcher may provide links to Discord and third-party storefronts. These services
                operate independently and maintain their own terms, privacy practices, pricing, purchasing
                conditions, and availability. We are not responsible for transactions or disputes arising
                from purchases made through external websites.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-semibold text-white">7. Availability and Changes</h2>
              <p>
                The service may be updated, modified, temporarily unavailable, or discontinued. We may take
                reasonable measures to maintain reliability and protect the service, including limiting
                access during technical incidents or abuse.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-semibold text-white">8. Intellectual Property</h2>
              <p>
                Everfall Limited Watcher&apos;s original application code, branding, and interface are subject to
                applicable ownership rights. Third-party names, images, trademarks, and product
                descriptions remain the property of their respective owners.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-semibold text-white">9. Disclaimer &amp; Limitation of Liability</h2>
              <p>
                Everfall Limited Watcher is provided on an &ldquo;as available&rdquo; basis. To the extent permitted
                by applicable law, we disclaim warranties concerning uninterrupted operation, accuracy,
                availability, or suitability for a particular purpose, and the operator will not be liable
                for indirect, incidental, or consequential losses arising from use of the service, including
                missed vehicle releases or interruptions in notification delivery. Nothing in these Terms
                excludes liability that cannot legally be excluded.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-semibold text-white">10. Privacy &amp; Contact</h2>
              <p>
                Information about how Everfall Limited Watcher handles user information is available in our{" "}
                <Link to="/privacy-policy" className="text-zinc-100 underline decoration-zinc-500 underline-offset-4 hover:decoration-white">
                  Privacy Policy
                </Link>
                . For questions regarding these Terms, contact{" "}
                <a href="mailto:21324442+itschase@users.noreply.github.com" className="text-zinc-100 underline decoration-zinc-500 underline-offset-4 hover:decoration-white">
                  21324442+itschase@users.noreply.github.com
                </a>
                .
              </p>
            </section>
          </div>
        </Card>
      </div>
    </PublicLayout>
  );
}
