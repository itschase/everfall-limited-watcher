import { PublicExtraSections } from "@/components/common/PublicExtraSections";
import { Link } from "@tanstack/react-router";
import { ArrowRight, History } from "lucide-react";
import type { AboutPageContentConfig, AboutSectionKey } from "@/lib/api";
import { DEFAULT_ABOUT_SECTION_ORDER } from "../../../shared/presentation";
import { cn } from "@/lib/utils";
import { SiteIcon } from "@/components/common/SiteIcon";
import {
  getHeaderAlignmentClasses,
  getSpacingClasses,
  getSurfaceCardClass,
} from "@/components/common/pageLayoutPresets";
import { Card } from "@/components/ui/card";

export function AboutPageSections({
  about,
  previewMode = false,
}: {
  about: AboutPageContentConfig;
  previewMode?: boolean;
}) {
  const spacing = getSpacingClasses(about.spacingPreset);
  const alignment = getHeaderAlignmentClasses(about.sectionAlignment);
  const surfaceCls = getSurfaceCardClass(about.surfaceStyle);

  const visibleSteps = (about.workflowSteps || []).filter((s) => s.enabled !== false);
  const order: AboutSectionKey[] =
    about.sectionOrder && about.sectionOrder.length > 0
      ? about.sectionOrder
      : DEFAULT_ABOUT_SECTION_ORDER;

  const renderSection = (key: AboutSectionKey) => {
    if (key === "header") {
      if (about.showHeader === false) return null;
      return (
        <section key="header" className="relative w-full overflow-hidden overflow-x-clip border-b border-border bg-background">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -top-28 left-1/2 h-[380px] w-full max-w-[680px] -translate-x-1/2 rounded-full bg-gradient-to-tr from-emerald-500/10 via-zinc-700/15 to-transparent blur-[140px] opacity-70" />
          </div>

          <div
            className={cn(
              "relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8",
              spacing.heroPadding,
              alignment.container
            )}
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3.5 py-1 text-xs font-medium text-zinc-300 backdrop-blur-sm">
              <SiteIcon name="sparkles" className="h-3.5 w-3.5 text-amber-400" />
              {about.badgeText}
            </span>

            <h1 className="mt-5 text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
              {about.heading}
            </h1>

            <p
              className={cn(
                "mt-4 max-w-2xl text-base leading-relaxed text-zinc-300 sm:text-lg",
                about.sectionAlignment !== "left" && "mx-auto"
              )}
            >
              {about.subheading}
            </p>

            <div className={cn("mt-8 flex flex-wrap items-center gap-3", alignment.ctaRow)}>
              {previewMode ? (
                <>
                  <span className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg sm:w-auto">
                    {about.primaryCtaLabel}
                    <ArrowRight className="h-4 w-4" />
                  </span>
                  <span className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-6 py-3 text-sm font-semibold text-zinc-100 sm:w-auto">
                    <History className="h-4 w-4" />
                    {about.secondaryCtaLabel}
                  </span>
                </>
              ) : (
                <>
                  <Link
                    to={(about.primaryCtaUrl || "/features") as any}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg transition hover:bg-zinc-200 sm:w-auto"
                  >
                    {about.primaryCtaLabel}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    to={(about.secondaryCtaUrl || "/history") as any}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-6 py-3 text-sm font-semibold text-zinc-100 transition hover:bg-zinc-800 hover:text-white sm:w-auto"
                  >
                    <History className="h-4 w-4" />
                    {about.secondaryCtaLabel}
                  </Link>
                </>
              )}
            </div>
          </div>
        </section>
      );
    }

    if (key === "mission") {
      if (about.showMission === false) return null;
      return (
        <section key="mission" className={cn("mx-auto max-w-5xl px-4 sm:px-6 lg:px-8", spacing.sectionPadding)}>
          <Card className={cn("p-6 sm:p-8", surfaceCls)}>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-zinc-950">
                <SiteIcon name={about.missionIcon} fallback="layers" className="h-5 w-5 text-white" />
              </div>
              <div className="space-y-2 min-w-0">
                <h2 className="text-xl font-bold text-white">{about.missionHeading}</h2>
                <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-300">
                  {about.missionBody}
                </p>
              </div>
            </div>
          </Card>
        </section>
      );
    }

    if (key === "workflow") {
      if (about.showWorkflow === false || visibleSteps.length === 0) return null;
      return (
        <section key="workflow" className={cn("mx-auto max-w-5xl px-4 sm:px-6 lg:px-8", spacing.sectionPadding)}>
          <h2 className={cn("text-2xl font-bold tracking-tight text-white", alignment.container === "text-center" && "sm:text-left")}>
            {about.workflowHeading}
          </h2>
          <div
            className={cn(
              "mt-5 grid gap-4",
              about.workflowColumns === 3 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2"
            )}
          >
            {visibleSteps.map((step) => (
              <Card key={step.id} className={cn("p-5 transition hover:border-zinc-700", surfaceCls)}>
                <div className="flex items-start gap-3">
                  {step.icon && (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-zinc-950">
                      <SiteIcon name={step.icon} fallback="sparkles" className="h-4 w-4 text-zinc-200" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-white">{step.title}</h3>
                    <p className="mt-1.5 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      );
    }

    if (key === "architecture_disclaimer") {
      const showArch = about.showArchitecture !== false;
      const showDisc = about.showDisclaimer !== false;
      if (!showArch && !showDisc) return null;
      return (
        <section
          key="architecture_disclaimer"
          className={cn("mx-auto max-w-5xl px-4 sm:px-6 lg:px-8", spacing.sectionPadding)}
        >
          <div className={cn("grid gap-6", showArch && showDisc ? "md:grid-cols-2" : "grid-cols-1")}>
            {showArch && (
              <Card className={cn("p-6", surfaceCls)}>
                <div className="flex items-center gap-2.5">
                  <SiteIcon
                    name={about.architectureIcon}
                    fallback="database"
                    className="h-5 w-5 shrink-0 text-emerald-400"
                  />
                  <h2 className="text-lg font-semibold text-white">{about.architectureHeading}</h2>
                </div>
                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-zinc-300">
                  {about.architectureBody}
                </p>
              </Card>
            )}

            {showDisc && (
              <Card className={cn("p-6", surfaceCls)}>
                <div className="flex items-center gap-2.5">
                  <SiteIcon
                    name={about.disclaimerIcon}
                    fallback="shield-check"
                    className="h-5 w-5 shrink-0 text-zinc-300"
                  />
                  <h2 className="text-lg font-semibold text-white">{about.disclaimerHeading}</h2>
                </div>
                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-zinc-300">
                  {about.disclaimerBody}
                </p>
              </Card>
            )}
          </div>
        </section>
      );
    }

    return null;
  };

  return <>{order.map((key) => renderSection(key))}<PublicExtraSections sections={about.extraSections} previewMode={previewMode} /></>;
}
