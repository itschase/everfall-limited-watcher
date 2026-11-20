import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  Eye,
  FileText,
  Info,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  AboutPageContentConfig,
  apiFetch,
  FeaturesPageContentConfig,
  HeroAnimationStyle,
  HeroConfig,
  HeroMessageItem,
  HomePageContentConfig,
  LegalPageContentConfig,
  PresentationBundleResponse,
  SitePagesConfig,
} from "@/lib/api";
import {
  DEFAULT_HERO_CONFIG,
  DEFAULT_SITE_PAGES_CONFIG,
  normalizeSitePagesConfig,
} from "../../../shared/presentation";
import { cn } from "@/lib/utils";
import { AppShell } from "@/components/layout/AppShell";
import { AnimatedHero } from "@/components/hero/AnimatedHero";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type PageTabKey = "home" | "features" | "about" | "privacy" | "terms";

const ANIMATION_STYLES: Array<{
  value: HeroAnimationStyle;
  label: string;
  description: string;
}> = [
  {
    value: "soft_reveal",
    label: "Soft Reveal",
    description: "Smooth opacity and scale settle into crisp headline focus.",
  },
  {
    value: "float_down",
    label: "Float Down",
    description: "Gentle downward entrance with subtle blur clearance.",
  },
  {
    value: "fade_slide",
    label: "Fade Slide",
    description: "Lateral slide entrance synced with highlight fade-in.",
  },
  {
    value: "character_reveal",
    label: "Character Reveal",
    description: "Staggered per-character reveal across the hero headline.",
  },
  {
    value: "word_stagger",
    label: "Word Stagger",
    description: "Sequential word-by-word motion respecting spacing.",
  },
  {
    value: "decrypting_text",
    label: "Decrypting Text",
    description: "Deterministic scramble settling left-to-right to exact text.",
  },
];

const TEXTAREA_CLS =
  "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring select-text";

const TAB_LABELS: Record<PageTabKey, { label: string; route: string }> = {
  home: { label: "Home & Hero", route: "/" },
  features: { label: "Features", route: "/features" },
  about: { label: "About", route: "/about" },
  privacy: { label: "Privacy Policy", route: "/privacy-policy" },
  terms: { label: "Terms of Service", route: "/terms-of-service" },
};

export function AdminPagesPage() {
  const queryClient = useQueryClient();

  const {
    data: presentationRes,
    isLoading,
    isFetching,
    refetch,
  } = useQuery<PresentationBundleResponse>({
    queryKey: ["admin-presentation"],
    queryFn: () => apiFetch<PresentationBundleResponse>("/api/admin/presentation"),
    staleTime: 20_000,
  });

  const [activeTab, setActiveTab] = useState<PageTabKey>("home");
  const [heroDraft, setHeroDraft] = useState<HeroConfig>(DEFAULT_HERO_CONFIG);
  const [pagesDraft, setPagesDraft] = useState<SitePagesConfig>(
    normalizeSitePagesConfig(DEFAULT_SITE_PAGES_CONFIG, DEFAULT_SITE_PAGES_CONFIG)
  );
  const [previewSelection, setPreviewSelection] = useState<string>("auto");
  const [replayNonce, setReplayNonce] = useState<number>(0);
  const [resetTarget, setResetTarget] = useState<PageTabKey | null>(null);

  useEffect(() => {
    if (presentationRes?.bundle?.hero) {
      setHeroDraft(presentationRes.bundle.hero);
    }
    if (presentationRes?.bundle?.pages) {
      setPagesDraft(
        normalizeSitePagesConfig(presentationRes.bundle.pages, DEFAULT_SITE_PAGES_CONFIG)
      );
    }
  }, [presentationRes?.bundle?.hero, presentationRes?.bundle?.pages]);

  const saveMutation = useMutation({
    mutationFn: (payload: {
      tab: PageTabKey;
      hero?: HeroConfig;
      pages?: Partial<SitePagesConfig>;
    }) =>
      apiFetch<PresentationBundleResponse>("/api/admin/presentation", {
        method: "PUT",
        body: JSON.stringify({
          ...(payload.hero ? { hero: payload.hero } : {}),
          ...(payload.pages ? { pages: payload.pages } : {}),
        }),
      }),
    onSuccess: (res, vars) => {
      queryClient.setQueryData(["admin-presentation"], res);
      if (res.bundle.hero) setHeroDraft(res.bundle.hero);
      if (res.bundle.pages) {
        setPagesDraft(
          normalizeSitePagesConfig(res.bundle.pages, DEFAULT_SITE_PAGES_CONFIG)
        );
      }
      void queryClient.invalidateQueries({ queryKey: ["public-listings"] });
      void queryClient.invalidateQueries({ queryKey: ["public-status"] });
      void queryClient.invalidateQueries({ queryKey: ["public-presentation"] });
      toast.success(`Saved ${TAB_LABELS[vars.tab].label} page changes.`);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to save page changes.");
    },
  });

  const activeMessages = heroDraft.messages.filter((m) => m.enabled);
  const previewIndex =
    previewSelection === "auto"
      ? undefined
      : Math.max(
          0,
          activeMessages.findIndex((m) => m.id === previewSelection)
        );

  const updateHeroMessage = (index: number, patch: Partial<HeroMessageItem>) => {
    setHeroDraft((prev) => {
      const next = [...prev.messages];
      next[index] = { ...next[index], ...patch };
      return { ...prev, messages: next };
    });
  };

  const setDefaultHeroMessage = (index: number) => {
    setHeroDraft((prev) => ({
      ...prev,
      messages: prev.messages.map((m, idx) => ({
        ...m,
        isDefault: idx === index,
      })),
    }));
  };

  const moveHeroMessage = (index: number, delta: -1 | 1) => {
    setHeroDraft((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.messages.length) return prev;
      const next = [...prev.messages];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return { ...prev, messages: next };
    });
  };

  const removeHeroMessage = (index: number) => {
    setHeroDraft((prev) => {
      if (prev.messages.length <= 1) return prev;
      const next = prev.messages.filter((_, idx) => idx !== index);
      if (!next.some((m) => m.isDefault)) {
        next[0] = { ...next[0], isDefault: true };
      }
      return { ...prev, messages: next };
    });
  };

  const addHeroMessage = () => {
    if (heroDraft.messages.length >= 12) {
      toast.error("Maximum of 12 hero messages reached.");
      return;
    }
    const id = `hero-${Date.now()}`;
    setHeroDraft((prev) => ({
      ...prev,
      messages: [
        ...prev.messages,
        {
          id,
          text: "Verified Limited Drop",
          highlightText: "Monitoring",
          subtext: prev.secondaryDescription,
          enabled: true,
          isDefault: false,
        },
      ],
    }));
  };

  const patchHome = (patch: Partial<HomePageContentConfig>) =>
    setPagesDraft((prev) => ({ ...prev, home: { ...prev.home, ...patch } }));

  const patchFeatures = (patch: Partial<FeaturesPageContentConfig>) =>
    setPagesDraft((prev) => ({ ...prev, features: { ...prev.features, ...patch } }));

  const patchAbout = (patch: Partial<AboutPageContentConfig>) =>
    setPagesDraft((prev) => ({ ...prev, about: { ...prev.about, ...patch } }));

  const patchLegal = (
    key: "privacy" | "terms",
    patch: Partial<LegalPageContentConfig>
  ) =>
    setPagesDraft((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const handleSaveTab = (tab: PageTabKey) => {
    if (tab === "home") {
      saveMutation.mutate({
        tab: "home",
        hero: heroDraft,
        pages: { home: pagesDraft.home },
      });
      return;
    }
    saveMutation.mutate({
      tab,
      pages: { [tab]: pagesDraft[tab] },
    });
  };

  const handleCancelTab = (tab: PageTabKey) => {
    const serverPages = normalizeSitePagesConfig(
      presentationRes?.bundle?.pages,
      DEFAULT_SITE_PAGES_CONFIG
    );
    if (tab === "home") {
      if (presentationRes?.bundle?.hero) setHeroDraft(presentationRes.bundle.hero);
      patchHome(serverPages.home);
    } else {
      setPagesDraft((prev) => ({ ...prev, [tab]: serverPages[tab] }));
    }
    toast.info(`Reverted unsaved changes for ${TAB_LABELS[tab].label}.`);
  };

  const handleConfirmReset = () => {
    if (!resetTarget) return;
    const tab = resetTarget;
    setResetTarget(null);
    const defaults = normalizeSitePagesConfig(
      DEFAULT_SITE_PAGES_CONFIG,
      DEFAULT_SITE_PAGES_CONFIG
    );
    if (tab === "home") {
      setHeroDraft(DEFAULT_HERO_CONFIG);
      patchHome(defaults.home);
      setPreviewSelection("auto");
      setReplayNonce((n) => n + 1);
      saveMutation.mutate({
        tab: "home",
        hero: DEFAULT_HERO_CONFIG,
        pages: { home: defaults.home },
      });
      return;
    }
    setPagesDraft((prev) => ({ ...prev, [tab]: defaults[tab] }));
    saveMutation.mutate({
      tab,
      pages: { [tab]: defaults[tab] },
    });
  };

  const renderTabActionFooter = (tab: PageTabKey) => (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <FileText className="h-3.5 w-3.5 text-zinc-400" />
          <span>
            Editing <strong className="text-white">{TAB_LABELS[tab].label}</strong> (
            <code className="text-zinc-200">{TAB_LABELS[tab].route}</code>) independently.
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={saveMutation.isPending}
            onClick={() => setResetTarget(tab)}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset Page to Default
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={saveMutation.isPending}
            onClick={() => handleCancelTab(tab)}
          >
            Cancel Changes
          </Button>
          <Button
            type="button"
            disabled={saveMutation.isPending}
            onClick={() => handleSaveTab(tab)}
          >
            {saveMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save {TAB_LABELS[tab].label}
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const renderLegalEditor = (key: "privacy" | "terms") => {
    const legal = pagesDraft[key];
    return (
      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-12">
          <Card className="lg:col-span-7">
            <CardHeader>
              <CardTitle className="text-base">
                {key === "privacy" ? "Privacy Policy Content" : "Terms of Service Content"}
              </CardTitle>
              <CardDescription>
                Edit page metadata and numbered sections. Changes apply live on{" "}
                <code>{TAB_LABELS[key].route}</code> without affecting application logic.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Top Badge</Label>
                  <Input
                    value={legal.badgeText}
                    maxLength={80}
                    onChange={(e) => patchLegal(key, { badgeText: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Page Heading</Label>
                  <Input
                    value={legal.heading}
                    maxLength={120}
                    onChange={(e) => patchLegal(key, { heading: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Intro Subheading</Label>
                <textarea
                  rows={2}
                  maxLength={400}
                  value={legal.subheading}
                  onChange={(e) => patchLegal(key, { subheading: e.target.value })}
                  className={TEXTAREA_CLS}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Effective Date</Label>
                  <Input
                    value={legal.effectiveDate}
                    maxLength={60}
                    onChange={(e) => patchLegal(key, { effectiveDate: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Operator Name</Label>
                  <Input
                    value={legal.operatorName}
                    maxLength={120}
                    onChange={(e) => patchLegal(key, { operatorName: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Contact Email / Handle</Label>
                  <Input
                    value={legal.contactEmail}
                    maxLength={120}
                    onChange={(e) => patchLegal(key, { contactEmail: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-3 border-t border-border pt-4">
                <div className="flex items-center justify-between">
                  <Label>Document Sections ({legal.sections.length}/12)</Label>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={legal.sections.length >= 12}
                    onClick={() =>
                      patchLegal(key, {
                        sections: [
                          ...legal.sections,
                          {
                            id: `${key}-sec-${Date.now()}`,
                            heading: `${legal.sections.length + 1}. Additional Section`,
                            body: "Enter plain-text policy details here.",
                          },
                        ],
                      })
                    }
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Section
                  </Button>
                </div>

                {legal.sections.map((sec, idx) => (
                  <div
                    key={sec.id}
                    className="space-y-2.5 rounded-lg border border-border bg-zinc-950/70 p-3.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-muted-foreground">
                        Section #{idx + 1}
                      </span>
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="h-7 w-7"
                        disabled={legal.sections.length <= 1}
                        aria-label="Remove section"
                        onClick={() =>
                          patchLegal(key, {
                            sections: legal.sections.filter((_, sIdx) => sIdx !== idx),
                          })
                        }
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    <Input
                      value={sec.heading}
                      maxLength={160}
                      placeholder="Section heading"
                      onChange={(e) => {
                        const next = [...legal.sections];
                        next[idx] = { ...next[idx], heading: e.target.value };
                        patchLegal(key, { sections: next });
                      }}
                    />
                    <textarea
                      rows={3}
                      maxLength={2400}
                      value={sec.body}
                      onChange={(e) => {
                        const next = [...legal.sections];
                        next[idx] = { ...next[idx], body: e.target.value };
                        patchLegal(key, { sections: next });
                      }}
                      className={TEXTAREA_CLS}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Live Preview Pane */}
          <Card className="lg:col-span-5 h-fit border-zinc-800">
            <CardHeader className="border-b border-border bg-zinc-950/60">
              <CardTitle className="flex items-center gap-2 text-base">
                <Eye className="h-4 w-4 text-zinc-300" />
                Live Page Preview ({TAB_LABELS[key].route})
              </CardTitle>
              <CardDescription>
                Plain-text sanitized preview of how visitors see this document.
              </CardDescription>
            </CardHeader>
            <CardContent className="max-h-[680px] space-y-5 overflow-y-auto bg-zinc-950/40 p-5 thin-scrollbar">
              <div className="border-b border-border pb-4">
                <span className="inline-block rounded-full border border-border bg-card px-2.5 py-0.5 text-[11px] text-zinc-300">
                  {legal.badgeText}
                </span>
                <h2 className="mt-2 text-2xl font-bold text-white">{legal.heading}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Effective Date: {legal.effectiveDate} &bull; Operated by {legal.operatorName}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-zinc-300">{legal.subheading}</p>
              </div>
              <div className="space-y-4">
                {legal.sections.map((sec) => (
                  <div key={sec.id} className="space-y-1">
                    <h3 className="text-sm font-semibold text-white">{sec.heading}</h3>
                    <p className="whitespace-pre-line text-xs leading-relaxed text-zinc-300">
                      {sec.body}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {renderTabActionFooter(key)}
      </div>
    );
  };

  return (
    <AppShell
      requireAdmin
      title="Pages & Content Editor"
      description="Manage public Home (including Hero animation & queue), Features, About, Privacy Policy, and Terms of Service copy independently."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to={TAB_LABELS[activeTab].route as any}>
              View Live {TAB_LABELS[activeTab].label}
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
            Reload
          </Button>
        </div>
      }
    >
      {isLoading ? (
        <div className="space-y-6">
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-80 w-full rounded-xl" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex items-start gap-2.5 rounded-xl border border-border bg-zinc-950/80 px-4 py-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
            <span>
              All HTML tags and unsafe scripts are stripped automatically on save. Editing public pages persists cleanly to Cloudflare D1 and never sends Discord notifications.
            </span>
          </div>

          <Tabs
            value={activeTab}
            onValueChange={(val) => setActiveTab(val as PageTabKey)}
            className="space-y-6"
          >
            <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 p-1">
              <TabsTrigger value="home">Home &amp; Hero</TabsTrigger>
              <TabsTrigger value="features">Features</TabsTrigger>
              <TabsTrigger value="about">About</TabsTrigger>
              <TabsTrigger value="privacy">Privacy Policy</TabsTrigger>
              <TabsTrigger value="terms">Terms of Service</TabsTrigger>
            </TabsList>

            {/* ==================== TAB 1: HOME + HERO CONTROLLER ==================== */}
            <TabsContent value="home" className="space-y-6">
              {/* Live Hero Interactive Preview */}
              <Card className="overflow-hidden border-zinc-800">
                <CardHeader className="flex flex-col gap-3 border-b border-border bg-zinc-950/60 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Sparkles className="h-4 w-4 text-amber-400" />
                      Live Homepage Hero Preview
                    </CardTitle>
                    <CardDescription>
                      Preview rotating headlines, animation curves, and Homepage section framing cleanly.
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={previewSelection} onValueChange={setPreviewSelection}>
                      <SelectTrigger className="h-8 w-52 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">
                          Auto Rotate ({activeMessages.length} active)
                        </SelectItem>
                        {activeMessages.map((msg, idx) => (
                          <SelectItem key={msg.id} value={msg.id}>
                            #{idx + 1}: {msg.text.slice(0, 28)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setReplayNonce((n) => n + 1)}
                    >
                      <Play className="h-3.5 w-3.5" />
                      Replay
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="relative bg-zinc-950 px-6 py-10">
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.06),transparent_65%)]" />
                  <div className="relative mx-auto max-w-4xl">
                    <div className="mb-3 flex justify-center">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/80 px-3 py-1 text-[11px] font-medium text-zinc-300">
                        {pagesDraft.home.badgeText}
                      </span>
                    </div>
                    <AnimatedHero
                      config={heroDraft}
                      previewIndex={previewIndex}
                      replayNonce={replayNonce}
                      compact
                    />
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-6 lg:grid-cols-12">
                {/* Motion, Timing & Homepage Section Copy */}
                <div className="space-y-6 lg:col-span-5">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Hero Motion &amp; Timing</CardTitle>
                      <CardDescription>
                        Tune animation style, cycle cadence, and fallback copy.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-1.5">
                        <Label>Animation Style</Label>
                        <Select
                          value={heroDraft.animationStyle}
                          onValueChange={(style) => {
                            setHeroDraft({
                              ...heroDraft,
                              animationStyle: style as HeroAnimationStyle,
                            });
                            setReplayNonce((n) => n + 1);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ANIMATION_STYLES.map((st) => (
                              <SelectItem key={st.value} value={st.value}>
                                {st.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          {
                            ANIMATION_STYLES.find((s) => s.value === heroDraft.animationStyle)
                              ?.description
                          }
                        </p>
                      </div>

                      <div className="flex items-center justify-between rounded-lg border border-border bg-zinc-950/60 px-3.5 py-2.5">
                        <div>
                          <Label htmlFor="hero-autorotate" className="cursor-pointer">
                            Auto-Rotate Active Messages
                          </Label>
                          <p className="text-[11px] text-muted-foreground">
                            Pauses automatically while browser tab is hidden.
                          </p>
                        </div>
                        <Switch
                          id="hero-autorotate"
                          checked={heroDraft.autoRotate}
                          onCheckedChange={(autoRotate) =>
                            setHeroDraft({ ...heroDraft, autoRotate })
                          }
                        />
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label htmlFor="hero-interval">Cycle Interval (ms)</Label>
                          <Input
                            id="hero-interval"
                            type="number"
                            min={2500}
                            max={20000}
                            step={250}
                            value={heroDraft.intervalMs}
                            onChange={(e) =>
                              setHeroDraft({
                                ...heroDraft,
                                intervalMs: Number(e.target.value) || 5500,
                              })
                            }
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="hero-duration">Transition Duration (ms)</Label>
                          <Input
                            id="hero-duration"
                            type="number"
                            min={200}
                            max={2500}
                            step={50}
                            value={heroDraft.durationMs}
                            onChange={(e) =>
                              setHeroDraft({
                                ...heroDraft,
                                durationMs: Number(e.target.value) || 650,
                              })
                            }
                          />
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label htmlFor="hero-delay">Token Stagger Delay (ms)</Label>
                          <Input
                            id="hero-delay"
                            type="number"
                            min={0}
                            max={600}
                            step={10}
                            value={heroDraft.delayMs}
                            onChange={(e) =>
                              setHeroDraft({
                                ...heroDraft,
                                delayMs: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label>Font Size Preset</Label>
                          <Select
                            value={heroDraft.fontSizePreset}
                            onValueChange={(preset) =>
                              setHeroDraft({
                                ...heroDraft,
                                fontSizePreset: preset as HeroConfig["fontSizePreset"],
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="compact">Compact</SelectItem>
                              <SelectItem value="standard">Standard</SelectItem>
                              <SelectItem value="display">Display</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="hero-secondary-desc">
                          Global Fallback Subtext ({heroDraft.secondaryDescription.length}/340)
                        </Label>
                        <textarea
                          id="hero-secondary-desc"
                          rows={2}
                          maxLength={340}
                          value={heroDraft.secondaryDescription}
                          onChange={(e) =>
                            setHeroDraft({ ...heroDraft, secondaryDescription: e.target.value })
                          }
                          className={TEXTAREA_CLS}
                        />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Homepage Section Copy</CardTitle>
                      <CardDescription>
                        Customize section headers, badges, and empty-archive text on <code>/</code>.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label>Hero Eyebrow Badge</Label>
                          <Input
                            value={pagesDraft.home.badgeText}
                            maxLength={80}
                            onChange={(e) => patchHome({ badgeText: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Features Button Label</Label>
                          <Input
                            value={pagesDraft.home.featuresCtaLabel}
                            maxLength={50}
                            onChange={(e) => patchHome({ featuresCtaLabel: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Listings Section Badge</Label>
                        <Input
                          value={pagesDraft.home.sectionBadge}
                          maxLength={80}
                          onChange={(e) => patchHome({ sectionBadge: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Listings Section Heading</Label>
                        <Input
                          value={pagesDraft.home.sectionTitle}
                          maxLength={120}
                          onChange={(e) => patchHome({ sectionTitle: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Listings Section Subtitle</Label>
                        <textarea
                          rows={2}
                          maxLength={340}
                          value={pagesDraft.home.sectionSubtitle}
                          onChange={(e) => patchHome({ sectionSubtitle: e.target.value })}
                          className={TEXTAREA_CLS}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Empty Archive Title</Label>
                        <Input
                          value={pagesDraft.home.archiveEmptyTitle}
                          maxLength={120}
                          onChange={(e) => patchHome({ archiveEmptyTitle: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Empty Archive Description</Label>
                        <textarea
                          rows={2}
                          maxLength={340}
                          value={pagesDraft.home.archiveEmptyDescription}
                          onChange={(e) => patchHome({ archiveEmptyDescription: e.target.value })}
                          className={TEXTAREA_CLS}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Hero Messages Queue */}
                <Card className="lg:col-span-7 h-fit">
                  <CardHeader className="flex flex-row items-center justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">
                        Hero Messages ({heroDraft.messages.length}/12)
                      </CardTitle>
                      <CardDescription>
                        Manage rotating headlines, highlighted phrases, and per-slide subtitles.
                      </CardDescription>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={addHeroMessage}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Message
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {heroDraft.messages.map((msg, idx) => (
                      <div
                        key={msg.id}
                        className={cn(
                          "space-y-3 rounded-xl border p-4 transition",
                          msg.enabled
                            ? "border-border bg-zinc-950/75"
                            : "border-border/50 bg-zinc-950/30 opacity-65"
                        )}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-zinc-400">
                              #{idx + 1}
                            </span>
                            {msg.isDefault && (
                              <Badge variant="warning" className="text-[10px]">
                                Default Fallback
                              </Badge>
                            )}
                            {!msg.enabled && (
                              <Badge variant="secondary" className="text-[10px]">
                                Disabled
                              </Badge>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            <div className="mr-2 flex items-center gap-1.5">
                              <Label
                                htmlFor={`msg-enabled-${msg.id}`}
                                className="cursor-pointer text-[11px] text-muted-foreground"
                              >
                                Enabled
                              </Label>
                              <Switch
                                id={`msg-enabled-${msg.id}`}
                                checked={msg.enabled}
                                onCheckedChange={(enabled) => updateHeroMessage(idx, { enabled })}
                              />
                            </div>

                            <Button
                              type="button"
                              variant={msg.isDefault ? "secondary" : "outline"}
                              size="sm"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => setDefaultHeroMessage(idx)}
                            >
                              <Star
                                className={cn("h-3 w-3", msg.isDefault && "text-amber-400")}
                              />
                              Default
                            </Button>

                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => {
                                if (!msg.enabled) updateHeroMessage(idx, { enabled: true });
                                setPreviewSelection(msg.id);
                                setReplayNonce((n) => n + 1);
                              }}
                            >
                              <Play className="h-3 w-3" />
                              Preview
                            </Button>

                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-7 w-7"
                              disabled={idx === 0}
                              aria-label="Move message up"
                              onClick={() => moveHeroMessage(idx, -1)}
                            >
                              <ArrowUp className="h-3 w-3" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-7 w-7"
                              disabled={idx === heroDraft.messages.length - 1}
                              aria-label="Move message down"
                              onClick={() => moveHeroMessage(idx, 1)}
                            >
                              <ArrowDown className="h-3 w-3" />
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              className="h-7 w-7"
                              disabled={heroDraft.messages.length <= 1}
                              aria-label="Delete message"
                              onClick={() => removeHeroMessage(idx)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1">
                            <Label className="text-[11px]">Primary Headline</Label>
                            <Input
                              value={msg.text}
                              maxLength={140}
                              placeholder="Never Miss an Everfall"
                              onChange={(e) => updateHeroMessage(idx, { text: e.target.value })}
                              className="h-8 text-xs"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[11px]">Highlight Accent Phrase</Label>
                            <Input
                              value={msg.highlightText || ""}
                              maxLength={80}
                              placeholder="Limited Drop"
                              onChange={(e) =>
                                updateHeroMessage(idx, { highlightText: e.target.value })
                              }
                              className="h-8 text-xs"
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-[11px]">
                            Message Subtext (optional — falls back to global description)
                          </Label>
                          <Input
                            value={msg.subtext || ""}
                            maxLength={320}
                            placeholder={heroDraft.secondaryDescription}
                            onChange={(e) => updateHeroMessage(idx, { subtext: e.target.value })}
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>

              {renderTabActionFooter("home")}
            </TabsContent>

            {/* ==================== TAB 2: FEATURES PAGE ==================== */}
            <TabsContent value="features" className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-12">
                <Card className="lg:col-span-7">
                  <CardHeader>
                    <CardTitle className="text-base">Features Showcase Content</CardTitle>
                    <CardDescription>
                      Edit hero messaging, capability highlights, preview section headings, and CTA block on <code>/features</code>.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Hero Badge</Label>
                        <Input
                          value={pagesDraft.features.badgeText}
                          maxLength={80}
                          onChange={(e) => patchFeatures({ badgeText: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Primary CTA Label</Label>
                        <Input
                          value={pagesDraft.features.primaryCtaLabel}
                          maxLength={50}
                          onChange={(e) => patchFeatures({ primaryCtaLabel: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label>Hero Heading</Label>
                      <Input
                        value={pagesDraft.features.heading}
                        maxLength={160}
                        onChange={(e) => patchFeatures({ heading: e.target.value })}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label>Hero Subheading</Label>
                      <textarea
                        rows={2}
                        maxLength={400}
                        value={pagesDraft.features.subheading}
                        onChange={(e) => patchFeatures({ subheading: e.target.value })}
                        className={TEXTAREA_CLS}
                      />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Secondary CTA Label</Label>
                        <Input
                          value={pagesDraft.features.secondaryCtaLabel}
                          maxLength={50}
                          onChange={(e) => patchFeatures({ secondaryCtaLabel: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Previews Section Heading</Label>
                        <Input
                          value={pagesDraft.features.previewsHeading}
                          maxLength={120}
                          onChange={(e) => patchFeatures({ previewsHeading: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label>Previews Section Subheading</Label>
                      <Input
                        value={pagesDraft.features.previewsSubheading}
                        maxLength={340}
                        onChange={(e) => patchFeatures({ previewsSubheading: e.target.value })}
                      />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Capabilities Heading</Label>
                        <Input
                          value={pagesDraft.features.capabilitiesHeading}
                          maxLength={120}
                          onChange={(e) => patchFeatures({ capabilitiesHeading: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Workflow Heading</Label>
                        <Input
                          value={pagesDraft.features.workflowHeading}
                          maxLength={120}
                          onChange={(e) => patchFeatures({ workflowHeading: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label>Capabilities Subheading</Label>
                      <Input
                        value={pagesDraft.features.capabilitiesSubheading}
                        maxLength={340}
                        onChange={(e) =>
                          patchFeatures({ capabilitiesSubheading: e.target.value })
                        }
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label>Workflow Subheading</Label>
                      <Input
                        value={pagesDraft.features.workflowSubheading}
                        maxLength={340}
                        onChange={(e) => patchFeatures({ workflowSubheading: e.target.value })}
                      />
                    </div>

                    <div className="space-y-3 border-t border-border pt-4">
                      <div className="flex items-center justify-between">
                        <Label>
                          Platform Capability Cards ({pagesDraft.features.capabilities.length}/8)
                        </Label>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={pagesDraft.features.capabilities.length >= 8}
                          onClick={() =>
                            patchFeatures({
                              capabilities: [
                                ...pagesDraft.features.capabilities,
                                {
                                  id: `cap-${Date.now()}`,
                                  title: "New Capability",
                                  description: "Describe platform functionality concisely.",
                                },
                              ],
                            })
                          }
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add Card
                        </Button>
                      </div>
                      {pagesDraft.features.capabilities.map((cap, idx) => (
                        <div
                          key={cap.id}
                          className="space-y-2 rounded-lg border border-border bg-zinc-950/70 p-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[11px] text-muted-foreground">
                              Card #{idx + 1}
                            </span>
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              className="h-7 w-7"
                              disabled={pagesDraft.features.capabilities.length <= 1}
                              onClick={() =>
                                patchFeatures({
                                  capabilities: pagesDraft.features.capabilities.filter(
                                    (_, cIdx) => cIdx !== idx
                                  ),
                                })
                              }
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                          <Input
                            value={cap.title}
                            maxLength={80}
                            onChange={(e) => {
                              const next = [...pagesDraft.features.capabilities];
                              next[idx] = { ...next[idx], title: e.target.value };
                              patchFeatures({ capabilities: next });
                            }}
                          />
                          <textarea
                            rows={2}
                            maxLength={360}
                            value={cap.description}
                            onChange={(e) => {
                              const next = [...pagesDraft.features.capabilities];
                              next[idx] = { ...next[idx], description: e.target.value };
                              patchFeatures({ capabilities: next });
                            }}
                            className={TEXTAREA_CLS}
                          />
                        </div>
                      ))}
                    </div>

                    <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Bottom CTA Heading</Label>
                        <Input
                          value={pagesDraft.features.ctaTitle}
                          maxLength={140}
                          onChange={(e) => patchFeatures({ ctaTitle: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Bottom CTA Description</Label>
                        <Input
                          value={pagesDraft.features.ctaDescription}
                          maxLength={340}
                          onChange={(e) => patchFeatures({ ctaDescription: e.target.value })}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Live Features Preview */}
                <Card className="lg:col-span-5 h-fit border-zinc-800">
                  <CardHeader className="border-b border-border bg-zinc-950/60">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Eye className="h-4 w-4 text-zinc-300" />
                      Live Features Preview (/features)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="max-h-[720px] space-y-5 overflow-y-auto bg-zinc-950/40 p-5 thin-scrollbar">
                    <div className="space-y-2 text-center border-b border-border pb-4">
                      <span className="inline-block rounded-full border border-border bg-card px-2.5 py-0.5 text-[11px] text-zinc-300">
                        {pagesDraft.features.badgeText}
                      </span>
                      <h2 className="text-xl font-bold text-white">
                        {pagesDraft.features.heading}
                      </h2>
                      <p className="text-xs leading-relaxed text-zinc-300">
                        {pagesDraft.features.subheading}
                      </p>
                      <div className="flex justify-center gap-2 pt-2">
                        <span className="rounded-md bg-primary px-3 py-1 text-[11px] font-semibold text-primary-foreground">
                          {pagesDraft.features.primaryCtaLabel}
                        </span>
                        <span className="rounded-md border border-border bg-secondary px-3 py-1 text-[11px] font-semibold text-zinc-200">
                          {pagesDraft.features.secondaryCtaLabel}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-white">
                        {pagesDraft.features.capabilitiesHeading}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {pagesDraft.features.capabilitiesSubheading}
                      </p>
                      <div className="grid gap-2 pt-1">
                        {pagesDraft.features.capabilities.map((cap) => (
                          <div
                            key={cap.id}
                            className="rounded-lg border border-border bg-card/70 p-3 text-xs"
                          >
                            <p className="font-semibold text-white">{cap.title}</p>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              {cap.description}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-lg border border-border bg-zinc-900/60 p-4 text-center">
                      <p className="text-sm font-bold text-white">
                        {pagesDraft.features.ctaTitle}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {pagesDraft.features.ctaDescription}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {renderTabActionFooter("features")}
            </TabsContent>

            {/* ==================== TAB 3: ABOUT PAGE ==================== */}
            <TabsContent value="about" className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-12">
                <Card className="lg:col-span-7">
                  <CardHeader>
                    <CardTitle className="text-base">About Page Content (/about)</CardTitle>
                    <CardDescription>
                      Manage the public mission, workflow steps, D1/R2/KV infrastructure overview, and disclaimer.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Hero Badge</Label>
                        <Input
                          value={pagesDraft.about.badgeText}
                          maxLength={80}
                          onChange={(e) => patchAbout({ badgeText: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Hero Heading</Label>
                        <Input
                          value={pagesDraft.about.heading}
                          maxLength={160}
                          onChange={(e) => patchAbout({ heading: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label>Hero Subheading</Label>
                      <textarea
                        rows={2}
                        maxLength={400}
                        value={pagesDraft.about.subheading}
                        onChange={(e) => patchAbout({ subheading: e.target.value })}
                        className={TEXTAREA_CLS}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label>Mission Heading</Label>
                      <Input
                        value={pagesDraft.about.missionHeading}
                        maxLength={120}
                        onChange={(e) => patchAbout({ missionHeading: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Mission Narrative</Label>
                      <textarea
                        rows={3}
                        maxLength={1200}
                        value={pagesDraft.about.missionBody}
                        onChange={(e) => patchAbout({ missionBody: e.target.value })}
                        className={TEXTAREA_CLS}
                      />
                    </div>

                    <div className="space-y-3 border-t border-border pt-4">
                      <div className="space-y-1.5">
                        <Label>Workflow Section Heading</Label>
                        <Input
                          value={pagesDraft.about.workflowHeading}
                          maxLength={120}
                          onChange={(e) => patchAbout({ workflowHeading: e.target.value })}
                        />
                      </div>
                      {pagesDraft.about.workflowSteps.map((step, idx) => (
                        <div
                          key={step.id}
                          className="space-y-2 rounded-lg border border-border bg-zinc-950/70 p-3"
                        >
                          <Input
                            value={step.title}
                            maxLength={80}
                            onChange={(e) => {
                              const next = [...pagesDraft.about.workflowSteps];
                              next[idx] = { ...next[idx], title: e.target.value };
                              patchAbout({ workflowSteps: next });
                            }}
                          />
                          <textarea
                            rows={2}
                            maxLength={360}
                            value={step.description}
                            onChange={(e) => {
                              const next = [...pagesDraft.about.workflowSteps];
                              next[idx] = { ...next[idx], description: e.target.value };
                              patchAbout({ workflowSteps: next });
                            }}
                            className={TEXTAREA_CLS}
                          />
                        </div>
                      ))}
                    </div>

                    <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Infrastructure Heading</Label>
                        <Input
                          value={pagesDraft.about.architectureHeading}
                          maxLength={120}
                          onChange={(e) => patchAbout({ architectureHeading: e.target.value })}
                        />
                        <textarea
                          rows={3}
                          maxLength={1200}
                          value={pagesDraft.about.architectureBody}
                          onChange={(e) => patchAbout({ architectureBody: e.target.value })}
                          className={TEXTAREA_CLS}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Disclaimer Heading</Label>
                        <Input
                          value={pagesDraft.about.disclaimerHeading}
                          maxLength={120}
                          onChange={(e) => patchAbout({ disclaimerHeading: e.target.value })}
                        />
                        <textarea
                          rows={3}
                          maxLength={1000}
                          value={pagesDraft.about.disclaimerBody}
                          onChange={(e) => patchAbout({ disclaimerBody: e.target.value })}
                          className={TEXTAREA_CLS}
                        />
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Primary CTA Label</Label>
                        <Input
                          value={pagesDraft.about.primaryCtaLabel}
                          maxLength={50}
                          onChange={(e) => patchAbout({ primaryCtaLabel: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Secondary CTA Label</Label>
                        <Input
                          value={pagesDraft.about.secondaryCtaLabel}
                          maxLength={50}
                          onChange={(e) => patchAbout({ secondaryCtaLabel: e.target.value })}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="lg:col-span-5 h-fit border-zinc-800">
                  <CardHeader className="border-b border-border bg-zinc-950/60">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Eye className="h-4 w-4 text-zinc-300" />
                      Live About Preview (/about)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="max-h-[720px] space-y-4 overflow-y-auto bg-zinc-950/40 p-5 thin-scrollbar text-xs">
                    <div className="border-b border-border pb-4 text-center">
                      <span className="inline-block rounded-full border border-border bg-card px-2.5 py-0.5 text-[11px] text-zinc-300">
                        {pagesDraft.about.badgeText}
                      </span>
                      <h2 className="mt-2 text-xl font-bold text-white">
                        {pagesDraft.about.heading}
                      </h2>
                      <p className="mt-1 text-zinc-300">{pagesDraft.about.subheading}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-card p-3.5">
                      <p className="font-semibold text-white">{pagesDraft.about.missionHeading}</p>
                      <p className="mt-1 leading-relaxed text-zinc-300">
                        {pagesDraft.about.missionBody}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <p className="font-semibold text-white">{pagesDraft.about.workflowHeading}</p>
                      {pagesDraft.about.workflowSteps.map((s) => (
                        <div key={s.id} className="rounded-lg border border-border bg-card/70 p-3">
                          <p className="font-semibold text-white">{s.title}</p>
                          <p className="mt-1 text-[11px] text-muted-foreground">{s.description}</p>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-lg border border-border bg-card p-3.5">
                      <p className="font-semibold text-white">
                        {pagesDraft.about.architectureHeading}
                      </p>
                      <p className="mt-1 text-zinc-300">{pagesDraft.about.architectureBody}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-card p-3.5">
                      <p className="font-semibold text-white">
                        {pagesDraft.about.disclaimerHeading}
                      </p>
                      <p className="mt-1 text-zinc-300">{pagesDraft.about.disclaimerBody}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {renderTabActionFooter("about")}
            </TabsContent>

            {/* ==================== TAB 4: PRIVACY POLICY ==================== */}
            <TabsContent value="privacy">{renderLegalEditor("privacy")}</TabsContent>

            {/* ==================== TAB 5: TERMS OF SERVICE ==================== */}
            <TabsContent value="terms">{renderLegalEditor("terms")}</TabsContent>
          </Tabs>
        </div>
      )}

      {/* Factory Reset Confirmation */}
      <Dialog
        open={Boolean(resetTarget)}
        onOpenChange={(open) => !open && setResetTarget(null)}
      >
        {resetTarget && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Reset {TAB_LABELS[resetTarget].label} to Factory Defaults
              </DialogTitle>
              <DialogDescription>
                Restores default copy and settings for{" "}
                <code>{TAB_LABELS[resetTarget].route}</code> without affecting your other pages.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setResetTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={saveMutation.isPending}
                onClick={handleConfirmReset}
              >
                Reset &amp; Save
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </AppShell>
  );
}
