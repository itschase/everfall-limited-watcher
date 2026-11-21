import { Link } from "@tanstack/react-router";
import type { LegalPageContentConfig } from "@/lib/api";
import { DEFAULT_SITE_PAGES_CONFIG } from "../../../shared/presentation";
import { cn } from "@/lib/utils";
import { SiteIcon } from "@/components/common/SiteIcon";
import { getSpacingClasses } from "@/components/common/pageLayoutPresets";
import { Card } from "@/components/ui/card";

export function LegalPageSections({
  kind,
  config,
  previewMode = false,
}: {
  kind: "privacy" | "terms";
  config: LegalPageContentConfig;
  previewMode?: boolean;
}) {
  const spacing = getSpacingClasses(config.spacingPreset);
  const leftAligned = config.sectionAlignment !== "center";

  const requiredIds =
    kind === "privacy" ? new Set(["priv-1", "priv-2", "priv-3"]) : new Set(["terms-3"]);
  const defaultSections =
    kind === "privacy"
      ? DEFAULT_SITE_PAGES_CONFIG.privacy.sections
      : DEFAULT_SITE_PAGES_CONFIG.terms.sections;
  const requiredById = new Map(
    defaultSections.filter((s) => requiredIds.has(s.id)).map((s) => [s.id, s])
  );

  // Preserve canonical mandatory sections and allow non-locked custom sections to toggle cleanly
  const normalizedSections = (config.sections || []).map((sec) => {
    const canonical = requiredById.get(sec.id);
    if (canonical) {
      return {
        ...canonical,
        icon: sec.icon || canonical.icon,
        enabled: true,
        locked: true,
      };
    }
    return sec;
  });
  for (const [reqId, reqSec] of requiredById.entries()) {
    if (!normalizedSections.some((s) => s.id === reqId)) {
      normalizedSections.push({ ...reqSec, enabled: true, locked: true });
    }
  }

  const visibleSections = normalizedSections.filter(
    (s) => s.locked || requiredIds.has(s.id) || s.enabled !== false
  );
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.contactEmail || "");

  return (
    <div
      className={cn(
        "mx-auto max-w-4xl px-4 sm:px-6 lg:px-8",
        config.spacingPreset === "compact"
          ? "py-8"
          : config.spacingPreset === "spacious"
            ? "py-16"
            : "py-12"
      )}
    >
      <Card className={cn("p-5 sm:p-8 lg:p-10", spacing.stackGap)}>
        {config.showHeader !== false && (
          <div className={cn("border-b border-border pb-6", !leftAligned && "text-center")}>
            <span className="inline-block rounded-full border border-border bg-zinc-950 px-3 py-0.5 text-xs font-medium text-zinc-300">
              {config.badgeText}
            </span>
            <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
              {config.heading}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Effective Date: {config.effectiveDate} &bull; Operated by {config.operatorName}
            </p>
            {config.subheading && (
              <p className="mt-3 text-sm leading-relaxed text-zinc-300">{config.subheading}</p>
            )}
          </div>
        )}

        <div className="space-y-6 text-sm leading-relaxed text-zinc-300">
          {config.showSections !== false &&
            visibleSections.map((sec) => (
              <section key={sec.id} className="space-y-2">
                <h2 className="flex items-center gap-2 text-base font-semibold text-white sm:text-lg">
                  {sec.icon && (
                    <SiteIcon name={sec.icon} fallback="file-text" className="h-4 w-4 shrink-0 text-zinc-400" />
                  )}
                  <span>{sec.heading}</span>
                </h2>
                <p className="whitespace-pre-line">{sec.body}</p>
              </section>
            ))}

          {config.showContact !== false && (
            <section className="space-y-2 border-t border-border pt-6">
              <h2 className="text-base font-semibold text-white sm:text-lg">
                {kind === "privacy" ? "Contact & Related Terms" : "Privacy & Contact"}
              </h2>
              {kind === "privacy" ? (
                <p>
                  For questions regarding this Privacy Policy or data access/deletion requests, contact{" "}
                  {isEmail && !previewMode ? (
                    <a
                      href={`mailto:${config.contactEmail}`}
                      className="text-zinc-100 underline decoration-zinc-500 underline-offset-4 hover:decoration-white"
                    >
                      {config.contactEmail}
                    </a>
                  ) : (
                    <span className="text-white">{config.contactEmail}</span>
                  )}
                  . Review our{" "}
                  {previewMode ? (
                    <span className="text-zinc-100 underline decoration-zinc-500 underline-offset-4">
                      Terms of Service
                    </span>
                  ) : (
                    <Link
                      to="/terms-of-service"
                      className="text-zinc-100 underline decoration-zinc-500 underline-offset-4 hover:decoration-white"
                    >
                      Terms of Service
                    </Link>
                  )}{" "}
                  for usage guidelines.
                </p>
              ) : (
                <p>
                  Information about how Everfall Limited Watcher collects and stores configuration data is available in our{" "}
                  {previewMode ? (
                    <span className="text-zinc-100 underline decoration-zinc-500 underline-offset-4">
                      Privacy Policy
                    </span>
                  ) : (
                    <Link
                      to="/privacy-policy"
                      className="text-zinc-100 underline decoration-zinc-500 underline-offset-4 hover:decoration-white"
                    >
                      Privacy Policy
                    </Link>
                  )}
                  . For questions regarding these Terms, contact{" "}
                  {isEmail && !previewMode ? (
                    <a
                      href={`mailto:${config.contactEmail}`}
                      className="text-zinc-100 underline decoration-zinc-500 underline-offset-4 hover:decoration-white"
                    >
                      {config.contactEmail}
                    </a>
                  ) : (
                    <span className="text-white">{config.contactEmail}</span>
                  )}
                  .
                </p>
              )}
            </section>
          )}
        </div>
      </Card>
    </div>
  );
}
