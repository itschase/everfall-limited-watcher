import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Database,
  History,
  Layers,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { apiFetch, PublicPresentationResponse, PublicStatusResponse } from "@/lib/api";
import { DEFAULT_SITE_PAGES_CONFIG } from "../../../shared/presentation";
import { useSession } from "@/features/auth/useAuthActions";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { PageSeo } from "@/components/seo/PageSeo";
import { Card } from "@/components/ui/card";

export function AboutPage() {
  const { data: session } = useSession();

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

  const about =
    statusData?.pages?.about ||
    presentationData?.pages?.about ||
    DEFAULT_SITE_PAGES_CONFIG.about;

  const publicOrigin =
    presentationData?.publicOrigin ||
    session?.publicOrigin ||
    (typeof window !== "undefined"
      ? window.location.origin
      : "https://everfall-limited-watcher.itschase.workers.dev");

  const canonicalUrl = `${publicOrigin.replace(/\/+$/, "")}/about`;
  const aboutJsonLd = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@type": "AboutPage",
      name: `${about.heading} | Everfall Limited Watcher`,
      url: canonicalUrl,
      description: about.subheading,
    }),
    [about.heading, about.subheading, canonicalUrl]
  );

  return (
    <PublicLayout>
      <PageSeo
        title="About | Everfall Limited Watcher"
        description={about.subheading}
        canonicalUrl={canonicalUrl}
        jsonLd={aboutJsonLd}
      />

      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-border bg-background">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-28 left-1/2 h-[380px] w-[680px] -translate-x-1/2 rounded-full bg-gradient-to-tr from-emerald-500/10 via-zinc-700/15 to-transparent blur-[140px] opacity-70" />
        </div>

        <div className="relative mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 sm:py-22 lg:px-8">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3.5 py-1 text-xs font-medium text-zinc-300 backdrop-blur-sm">
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            {about.badgeText}
          </span>

          <h1 className="mt-5 text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
            {about.heading}
          </h1>

          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-zinc-300 sm:text-lg">
            {about.subheading}
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/features"
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg transition hover:bg-zinc-200 sm:w-auto"
            >
              {about.primaryCtaLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/history"
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-6 py-3 text-sm font-semibold text-zinc-100 transition hover:bg-zinc-800 hover:text-white sm:w-auto"
            >
              <History className="h-4 w-4" />
              {about.secondaryCtaLabel}
            </Link>
          </div>
        </div>
      </section>

      {/* Mission & Purpose */}
      <section className="mx-auto max-w-5xl space-y-8 px-4 py-14 sm:px-6 lg:px-8">
        <Card className="p-6 sm:p-8">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-zinc-950">
              <Layers className="h-5 w-5 text-white" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-white">{about.missionHeading}</h2>
              <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-300">
                {about.missionBody}
              </p>
            </div>
          </div>
        </Card>

        {/* 4-Step Verification Workflow */}
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">
            {about.workflowHeading}
          </h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {about.workflowSteps.map((step) => (
              <Card key={step.id} className="p-5 transition hover:border-zinc-700">
                <h3 className="text-base font-semibold text-white">{step.title}</h3>
                <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
                  {step.description}
                </p>
              </Card>
            ))}
          </div>
        </div>

        {/* Infrastructure & Independence */}
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="p-6">
            <div className="flex items-center gap-2.5">
              <Database className="h-5 w-5 text-emerald-400" />
              <h2 className="text-lg font-semibold text-white">{about.architectureHeading}</h2>
            </div>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-zinc-300">
              {about.architectureBody}
            </p>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="h-5 w-5 text-zinc-300" />
              <h2 className="text-lg font-semibold text-white">{about.disclaimerHeading}</h2>
            </div>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-zinc-300">
              {about.disclaimerBody}
            </p>
          </Card>
        </div>
      </section>
    </PublicLayout>
  );
}
