import { STORE_MONITOR_INTERVAL_MINUTES } from "../../../shared/appConfig";
import { PageExtensionsEditor } from "./PageExtensionsEditor";
import { AutomationNotice } from "@/features/legal/AutomationNotice";
import { ResponsivePreview } from "@/components/common/ResponsivePreview";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  ExternalLink,
  Eye,
  FileText,
  Info,
  Laptop,
  Loader2,
  Lock,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Smartphone,
  Sparkles,
  Star,
  Tablet,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  AboutPageContentConfig,
  AboutSectionKey,
  apiFetch,
  EditableFeatureCard,
  EditableTextSection,
  FeaturesPageContentConfig,
  FeaturesSectionKey,
  HeroAnimationStyle,
  HeroConfig,
  HeroMessageItem,
  HomePageContentConfig,
  HomeSectionKey,
  LegalPageContentConfig,
  PageLayoutSpacing,
  PageSectionAlignment,
  PageSurfaceStyle,
  PresentationBundleResponse,
  PublicListingsResponse,
  SitePagesConfig,
} from "@/lib/api";
import {
  DEFAULT_ABOUT_SECTION_ORDER,
  DEFAULT_FEATURES_SECTION_ORDER,
  DEFAULT_HERO_CONFIG,
  DEFAULT_HOME_SECTION_ORDER,
  DEFAULT_IN_STOCK_TEMPLATE,
  DEFAULT_SITE_PAGES_CONFIG,
  DEFAULT_SOLD_OUT_TEMPLATE,
  DEFAULT_WIDGET_TEMPLATE,
  normalizeHeroConfig,
  normalizeSitePagesConfig,
} from "../../../shared/presentation";
import { cn } from "@/lib/utils";
import { AppShell } from "@/components/layout/AppShell";
import { IconPicker } from "@/components/common/IconPicker";
import { HomePageSections } from "@/features/homepage/HomePageSections";
import { FeaturesPageSections } from "@/features/features/FeaturesPageSections";
import { AboutPageSections } from "@/features/about/AboutPageSections";
import { LegalPageSections } from "@/features/legal/LegalPageSections";
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
type PreviewViewport = "desktop" | "tablet" | "mobile";

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

const HOME_SECTION_META: Record<
  HomeSectionKey,
  { label: string; toggleField: keyof HomePageContentConfig }
> = {
  hero: { label: "Show Homepage Hero", toggleField: "showHero" },
  telemetry: { label: "Operational Telemetry Strip", toggleField: "showTelemetry" },
  listings: { label: "Verified Release Archive Grid", toggleField: "showListingsSection" },
  features: { label: "Feature Highlights Row", toggleField: "showFeaturesSection" },
  slash_commands: { label: "Discord Slash Commands Reference", toggleField: "showSlashCommands" },
};

const FEATURES_SECTION_META: Record<
  FeaturesSectionKey,
  { label: string; toggleField: keyof FeaturesPageContentConfig }
> = {
  header: { label: "Page Header & CTA", toggleField: "showHeader" },
  previews: { label: "Interactive Discord Output Previews", toggleField: "showPreviews" },
  workflow: { label: "Verification Pipeline Steps", toggleField: "showWorkflow" },
  metadata_demo: { label: "Metadata Normalization Comparison", toggleField: "showMetadataDemo" },
  galleries: { label: "Archived R2 Galleries Showcase", toggleField: "showGalleries" },
  widget_showcase: { label: "Persistent Widget Spotlight", toggleField: "showWidgetShowcase" },
  archive_showcase: { label: "Drop Archive Preview Strip", toggleField: "showArchiveShowcase" },
  server_controls: { label: "Server Controls Overview", toggleField: "showServerControls" },
  capabilities: { label: "Platform Capabilities Grid", toggleField: "showCapabilities" },
  slash_commands: { label: "Slash Commands Directory", toggleField: "showSlashCommands" },
  cta: { label: "Bottom Call-to-Action Banner", toggleField: "showCta" },
};

const ABOUT_SECTION_META: Record<
  AboutSectionKey,
  { label: string; toggleField?: keyof AboutPageContentConfig }
> = {
  header: { label: "Page Header & Hero Banner", toggleField: "showHeader" },
  mission: { label: "Mission Statement Card", toggleField: "showMission" },
  workflow: { label: "Architecture & Verification Steps", toggleField: "showWorkflow" },
  architecture_disclaimer: { label: "Infrastructure & Disclaimer Cards" },
};

const REQUIRED_PRIVACY_IDS = new Set(["priv-1", "priv-2", "priv-3"]);
const REQUIRED_TERMS_IDS = new Set(["terms-3"]);

function LayoutPresetSelectors({
  spacingPreset = "standard",
  sectionAlignment = "center",
  surfaceStyle,
  columns,
  columnsLabel = "Grid Columns",
  onChange,
}: {
  spacingPreset?: PageLayoutSpacing;
  sectionAlignment?: PageSectionAlignment;
  surfaceStyle?: PageSurfaceStyle;
  columns?: 2 | 3;
  columnsLabel?: string;
  onChange: (patch: {
    spacingPreset?: PageLayoutSpacing;
    sectionAlignment?: PageSectionAlignment;
    surfaceStyle?: PageSurfaceStyle;
    columns?: 2 | 3;
  }) => void;
}) {
  return (
    <div className="grid gap-3 @xl/card:grid-cols-2 @4xl/main:grid-cols-4">
      <div className="space-y-1.5">
        <Label className="text-xs">Section Spacing</Label>
        <Select
          value={spacingPreset}
          onValueChange={(v) => onChange({ spacingPreset: v as PageLayoutSpacing })}
        >
          <SelectTrigger className="h-9 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="compact">Compact</SelectItem>
            <SelectItem value="standard">Standard</SelectItem>
            <SelectItem value="spacious">Spacious</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Header Alignment</Label>
        <Select
          value={sectionAlignment}
          onValueChange={(v) => onChange({ sectionAlignment: v as PageSectionAlignment })}
        >
          <SelectTrigger className="h-9 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="left">Left Aligned</SelectItem>
            <SelectItem value="center">Centered</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {surfaceStyle !== undefined && (
        <div className="space-y-1.5">
          <Label className="text-xs">Card Surface Style</Label>
          <Select
            value={surfaceStyle}
            onValueChange={(v) => onChange({ surfaceStyle: v as PageSurfaceStyle })}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="elevated">Elevated Card</SelectItem>
              <SelectItem value="subtle">Subtle Surface</SelectItem>
              <SelectItem value="bordered">Outlined Zinc</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {columns !== undefined && (
        <div className="space-y-1.5">
          <Label className="text-xs">{columnsLabel}</Label>
          <Select
            value={String(columns)}
            onValueChange={(v) => onChange({ columns: v === "2" ? 2 : 3 })}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2">2 Columns</SelectItem>
              <SelectItem value="3">3 Columns</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

function FeatureCardCrudList({
  title,
  description,
  items,
  maxItems,
  defaultIcon,
  newLabel,
  onChange,
}: {
  title: string;
  description: string;
  items: EditableFeatureCard[];
  maxItems: number;
  defaultIcon: EditableFeatureCard["icon"];
  newLabel: string;
  onChange: (next: EditableFeatureCard[]) => void;
}) {
  const moveItem = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    onChange(next);
  };

  const duplicateItem = (index: number) => {
    if (items.length >= maxItems) {
      toast.error(`Maximum of ${maxItems} items reached.`);
      return;
    }
    const source = items[index];
    const copy: EditableFeatureCard = {
      ...source,
      id: `item-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      title: `${source.title} (Copy)`.slice(0, 90),
    };
    const next = [...items];
    next.splice(index + 1, 0, copy);
    onChange(next);
  };

  const addItem = () => {
    if (items.length >= maxItems) {
      toast.error(`Maximum of ${maxItems} items reached.`);
      return;
    }
    onChange([
      ...items,
      {
        id: `item-${Date.now()}`,
        title: `${newLabel} ${items.length + 1}`,
        description: "Describe how collectors or server owners benefit from this capability.",
        icon: defaultIcon || "sparkles",
        enabled: true,
      },
    ]);
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 @2xl/main:flex-row @2xl/main:items-center @2xl/main:justify-between">
        <div>
          <CardTitle className="text-base">
            {title} ({items.length}/{maxItems})
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={items.length >= maxItems}
          onClick={addItem}
        >
          <Plus className="h-3.5 w-3.5" />
          Add {newLabel}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item, idx) => {
          const isEnabled = item.enabled !== false;
          return (
            <details
              key={item.id}
              className={cn(
                "space-y-3 rounded-xl border p-3.5 transition",
                isEnabled
                  ? "border-border bg-zinc-950/75"
                  : "border-border/50 bg-zinc-950/30 opacity-65"
              )}
            >
              <summary className="cursor-pointer text-sm font-medium">{idx + 1}. {item.title || "Untitled card"}{!isEnabled && " (Hidden)"}</summary>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-zinc-400">
                    #{idx + 1}
                  </span>
                  {!isEnabled && (
                    <Badge variant="secondary" className="text-[10px]">
                      Hidden
                    </Badge>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <div className="mr-1.5 flex items-center gap-1.5">
                    <Label
                      htmlFor={`card-vis-${item.id}`}
                      className="cursor-pointer text-[11px] text-muted-foreground"
                    >
                      Visible
                    </Label>
                    <Switch
                      id={`card-vis-${item.id}`}
                      checked={isEnabled}
                      onCheckedChange={(checked) => {
                        const next = [...items];
                        next[idx] = { ...next[idx], enabled: checked };
                        onChange(next);
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    title="Duplicate"
                    disabled={items.length >= maxItems}
                    onClick={() => duplicateItem(idx)}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    title="Move up"
                    disabled={idx === 0}
                    onClick={() => moveItem(idx, -1)}
                  >
                    <ArrowUp className="h-3 w-3" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    title="Move down"
                    disabled={idx === items.length - 1}
                    onClick={() => moveItem(idx, 1)}
                  >
                    <ArrowDown className="h-3 w-3" />
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="h-7 w-7"
                    title="Delete"
                    onClick={() => onChange(items.filter((_, i) => i !== idx))}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                  <Button type="button" variant="outline" size="icon" className="h-7 w-7" title="Restore card defaults" onClick={() => {
                    const defaults = [...(DEFAULT_SITE_PAGES_CONFIG.home.featureCards || []), ...(DEFAULT_SITE_PAGES_CONFIG.features.capabilities || []), ...(DEFAULT_SITE_PAGES_CONFIG.features.workflowSteps || []), ...DEFAULT_SITE_PAGES_CONFIG.about.workflowSteps];
                    const original = defaults.find(card => card.id === item.id);
                    onChange(items.map((card, index) => index === idx ? { ...(original || { id: item.id, title: newLabel, description: "", icon: defaultIcon, enabled: true }) } : card));
                  }}><RotateCcw className="h-3 w-3" /></Button>
                </div>
              </div>

              <div className="grid gap-3 @xl/card:grid-cols-12">
                <div className="space-y-1.5 @xl/card:col-span-5">
                  <Label className="text-[11px]">Icon</Label>
                  <IconPicker
                    value={item.icon || defaultIcon || "sparkles"}
                    fallback={defaultIcon}
                    onChange={(icon) => {
                      const next = [...items];
                      next[idx] = { ...next[idx], icon };
                      onChange(next);
                    }}
                  />
                </div>
                <div className="space-y-1.5 @xl/card:col-span-7">
                  <Label className="text-[11px]">Title</Label>
                  <Input
                    value={item.title}
                    maxLength={90}
                    className="h-9 text-xs"
                    onChange={(e) => {
                      const next = [...items];
                      next[idx] = { ...next[idx], title: e.target.value };
                      onChange(next);
                    }}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px]">Description</Label>
                <textarea
                  rows={2}
                  maxLength={420}
                  value={item.description}
                  className={TEXTAREA_CLS}
                  onChange={(e) => {
                    const next = [...items];
                    next[idx] = { ...next[idx], description: e.target.value };
                    onChange(next);
                  }}
                />
              </div>
            </details>
          );
        })}
      </CardContent>
    </Card>
  );
}

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

  const { data: listingsData } = useQuery<PublicListingsResponse>({
    queryKey: ["public-listings"],
    queryFn: () => apiFetch<PublicListingsResponse>("/api/public/listings"),
    staleTime: 120_000,
    refetchOnWindowFocus: false,
  });

  const [activeTab, setActiveTab] = useState<PageTabKey>("home");
  const [previewViewport, setPreviewViewport] = useState<PreviewViewport>("desktop");
  const [heroDraft, setHeroDraft] = useState<HeroConfig>(DEFAULT_HERO_CONFIG);
  const [pagesDraft, setPagesDraft] = useState<SitePagesConfig>(() =>
    normalizeSitePagesConfig(DEFAULT_SITE_PAGES_CONFIG, DEFAULT_SITE_PAGES_CONFIG)
  );
  const [previewSelection, setPreviewSelection] = useState<string>("auto");
  const [replayNonce, setReplayNonce] = useState<number>(0);
  const [resetTarget, setResetTarget] = useState<PageTabKey | null>(null);

  const previousBaseline = useRef<{ hero: HeroConfig; pages: SitePagesConfig } | null>(null);
  const saving = useRef(false);
  const [failedSnapshot, setFailedSnapshot] = useState<string | null>(null);
  useEffect(() => {
    if (!presentationRes?.bundle) return;
    const incoming = {
      hero: normalizeHeroConfig(presentationRes.bundle.hero),
      pages: normalizeSitePagesConfig(presentationRes.bundle.pages, DEFAULT_SITE_PAGES_CONFIG),
    };
    const previous = previousBaseline.current;
    previousBaseline.current = incoming;
    setHeroDraft(draft => !previous || JSON.stringify(draft) === JSON.stringify(previous.hero) ? incoming.hero : draft);
    setPagesDraft(draft => Object.fromEntries((Object.keys(TAB_LABELS) as PageTabKey[]).map(key => [key,
      !previous || JSON.stringify(draft[key]) === JSON.stringify(previous.pages[key]) ? incoming.pages[key] : draft[key],
    ])) as unknown as SitePagesConfig);
  }, [presentationRes?.bundle?.hero, presentationRes?.bundle?.pages]);

  const savedNormalizedHero = useMemo(
    () => normalizeHeroConfig(presentationRes?.bundle?.hero || DEFAULT_HERO_CONFIG),
    [presentationRes?.bundle?.hero]
  );

  const savedNormalizedPages = useMemo(
    () =>
      normalizeSitePagesConfig(
        presentationRes?.bundle?.pages,
        DEFAULT_SITE_PAGES_CONFIG
      ),
    [presentationRes?.bundle?.pages]
  );

  const dirtyTabs = useMemo<Record<PageTabKey, boolean>>(() => {
    if (!presentationRes?.bundle) {
      return { home: false, features: false, about: false, privacy: false, terms: false };
    }
    return {
      home:
        JSON.stringify(heroDraft) !== JSON.stringify(savedNormalizedHero) ||
        JSON.stringify(pagesDraft.home) !== JSON.stringify(savedNormalizedPages.home),
      features:
        JSON.stringify(pagesDraft.features) !== JSON.stringify(savedNormalizedPages.features),
      about: JSON.stringify(pagesDraft.about) !== JSON.stringify(savedNormalizedPages.about),
      privacy:
        JSON.stringify(pagesDraft.privacy) !== JSON.stringify(savedNormalizedPages.privacy),
      terms: JSON.stringify(pagesDraft.terms) !== JSON.stringify(savedNormalizedPages.terms),
    };
  }, [heroDraft, pagesDraft, presentationRes?.bundle, savedNormalizedHero, savedNormalizedPages]);

  const saveMutation = useMutation({
    onMutate: () => { saving.current = true; },
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
      // Preserve edits made during the request and drafts on every other page.
      if (vars.hero) setHeroDraft(prev => JSON.stringify(prev) === JSON.stringify(vars.hero) ? normalizeHeroConfig(res.bundle.hero) : prev);
      setPagesDraft(prev => {
        const submitted = vars.pages?.[vars.tab];
        return submitted && JSON.stringify(prev[vars.tab]) === JSON.stringify(submitted)
          ? { ...prev, [vars.tab]: res.bundle.pages![vars.tab] } : prev;
      });
      saving.current = false;
      setFailedSnapshot(null);
      void queryClient.invalidateQueries({ queryKey: ["public-listings"] });
      void queryClient.invalidateQueries({ queryKey: ["public-status"] });
      void queryClient.invalidateQueries({ queryKey: ["public-presentation"] });

    },
    onError: (err: Error, vars) => {
      saving.current = false;
      setFailedSnapshot(JSON.stringify(vars));
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

  const moveOrderKey = <T extends string>(order: T[], index: number, delta: -1 | 1): T[] => {
    const target = index + delta;
    if (target < 0 || target >= order.length) return order;
    const next = [...order];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    return next;
  };

  const handleSaveTab = (tab: PageTabKey) => {
    if (saving.current || !dirtyTabs[tab]) return;
    saving.current = true;
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

  const saveLatest = useRef(() => {});
  saveLatest.current = () => {
    const tab = (Object.keys(dirtyTabs) as PageTabKey[]).find(key => {
      if (!dirtyTabs[key]) return false;
      const payload = { tab: key, ...(key === "home" ? { hero: heroDraft } : {}), pages: { [key]: pagesDraft[key] } };
      return JSON.stringify(payload) !== failedSnapshot;
    });
    if (!tab || saving.current) return;
    const payload = { tab, ...(tab === "home" ? { hero: heroDraft } : {}), pages: { [tab]: pagesDraft[tab] } };
    if (JSON.stringify(payload) !== failedSnapshot) handleSaveTab(tab);
  };
  useEffect(() => {
    const timer = window.setTimeout(() => saveLatest.current(), 1000);
    return () => window.clearTimeout(timer);
  }, [heroDraft, pagesDraft, dirtyTabs, saveMutation.isPending, failedSnapshot]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (Object.values(dirtyTabs).some(Boolean)) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirtyTabs]);

  const handleCancelTab = (tab: PageTabKey) => {
    if (tab === "home") {
      setHeroDraft(savedNormalizedHero);
      patchHome(savedNormalizedPages.home);
    } else {
      setPagesDraft((prev) => ({ ...prev, [tab]: savedNormalizedPages[tab] }));
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

  const renderTabActionFooter = (tab: PageTabKey) => {
    const isDirty = dirtyTabs[tab];
    return (
      <Card className={cn(isDirty && "border-amber-500/40")}>
        <CardContent className="flex flex-col gap-3 p-4 @2xl/main:flex-row @2xl/main:items-center @2xl/main:justify-between">
          <div aria-live="polite" className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <FileText className="h-3.5 w-3.5 text-zinc-400" />
            <span>
              Editing <strong className="text-white">{TAB_LABELS[tab].label}</strong> (
              <code className="text-zinc-200">{TAB_LABELS[tab].route}</code>) independently.
            </span>
            {isDirty ? (
              <Badge variant="warning" className="text-[10px]">
                {saveMutation.isPending ? "Saving…" : failedSnapshot ? "Failed — retry available" : "Unsaved"}
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px]">
                Saved
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saveMutation.isPending}
              onClick={() => setResetTarget(tab)}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset Page to Default
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={saveMutation.isPending || !isDirty}
              onClick={() => handleCancelTab(tab)}
            >
              Discard Unsaved
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={saveMutation.isPending || !isDirty}
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
                  {failedSnapshot ? "Retry Save" : isDirty ? `Save ${TAB_LABELS[tab].label}` : "Saved"}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderLivePagePreview = (tab: PageTabKey) => {
    const publicListings = listingsData?.listings || [];
    const inStockTemplate =
      presentationRes?.bundle?.announcements?.inStock || DEFAULT_IN_STOCK_TEMPLATE;
    const soldOutTemplate =
      presentationRes?.bundle?.announcements?.soldOut || DEFAULT_SOLD_OUT_TEMPLATE;
    const widgetTemplate =
      presentationRes?.bundle?.widgetDefault || DEFAULT_WIDGET_TEMPLATE;

    return (
      <Card className="overflow-hidden border-zinc-800">
        <CardHeader className="flex flex-col gap-3 border-b border-border bg-zinc-950/75 @3xl/main:flex-row @3xl/main:items-center @3xl/main:justify-between">
          <div className="min-w-0">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <Eye className="h-4 w-4 shrink-0 text-zinc-300" />
              <span>Live Page Preview ({TAB_LABELS[tab].route})</span>
              {tab === "home" && pagesDraft.home.showHero === false && (
                <Badge variant="warning" className="text-[10px]">
                  Hero Hidden (Settings Preserved)
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Renders the exact shared public layout components live as you customize toggles, cards, icons, and spacing.
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {tab === "home" && pagesDraft.home.showHero !== false && (
              <>
                <Select value={previewSelection} onValueChange={setPreviewSelection}>
                  <SelectTrigger className="h-8 w-44 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">
                      Auto Rotate ({activeMessages.length})
                    </SelectItem>
                    {activeMessages.map((msg, idx) => (
                      <SelectItem key={msg.id} value={msg.id}>
                        #{idx + 1}: {msg.text.slice(0, 22)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-8"
                  onClick={() => setReplayNonce((n) => n + 1)}
                >
                  <Play className="h-3.5 w-3.5" />
                  Replay
                </Button>
              </>
            )}

            <div className="inline-flex rounded-lg border border-border bg-background p-0.5">
              <Button
                type="button"
                size="sm"
                variant={previewViewport === "desktop" ? "secondary" : "ghost"}
                className="h-7 px-2.5 text-xs"
                onClick={() => setPreviewViewport("desktop")}
                title="Desktop preview"
              >
                <Laptop className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Desktop</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant={previewViewport === "tablet" ? "secondary" : "ghost"}
                className="h-7 px-2.5 text-xs"
                onClick={() => setPreviewViewport("tablet")}
                title="Tablet 768px preview"
              >
                <Tablet className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Tablet</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant={previewViewport === "mobile" ? "secondary" : "ghost"}
                className="h-7 px-2.5 text-xs"
                onClick={() => setPreviewViewport("mobile")}
                title="Mobile 375px preview"
              >
                <Smartphone className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Mobile</span>
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="max-h-[640px] overflow-x-hidden overflow-y-auto bg-zinc-950/90 p-0 thin-scrollbar">
          <ResponsivePreview width={previewViewport === "mobile" ? 375 : previewViewport === "tablet" ? 768 : 1280}>
            {tab === "home" && (
              <HomePageSections
                homePageCopy={pagesDraft.home}
                heroConfig={heroDraft}
                listings={publicListings}
                botStatus={listingsData?.botStatus || "online"}
                monitorHealth={listingsData?.monitorHealth}
                scheduledIntervalMs={listingsData?.scheduledIntervalMs}
                lastCheckedAt={listingsData?.lastCheckedAt || null}
                lastVerifiedSuccessAt={listingsData?.lastSuccessAt || null}
                previewMode
                previewHeroSelection={previewIndex}
                previewReplayNonce={replayNonce}
              />
            )}
            {tab === "features" && (
              <FeaturesPageSections
                featuresCopy={pagesDraft.features}
                listings={publicListings}
                inStockTemplate={inStockTemplate}
                soldOutTemplate={soldOutTemplate}
                widgetTemplate={widgetTemplate}
                monitorStatus={listingsData?.monitorStatus || null}
                previewMode
              />
            )}
            {tab === "about" && (
              <AboutPageSections about={pagesDraft.about} previewMode />
            )}
            {tab === "privacy" && (
              <><LegalPageSections kind="privacy" config={pagesDraft.privacy} previewMode /><AutomationNotice kind="privacy" /></>
            )}
            {tab === "terms" && (
              <><LegalPageSections kind="terms" config={pagesDraft.terms} previewMode /><AutomationNotice kind="terms" /></>
            )}
          </ResponsivePreview>
        </CardContent>
      </Card>
    );
  };

  const renderLegalEditor = (key: "privacy" | "terms") => {
    const legal = pagesDraft[key];
    const requiredSet = key === "privacy" ? REQUIRED_PRIVACY_IDS : REQUIRED_TERMS_IDS;

    const duplicateSection = (index: number) => {
      if (legal.sections.length >= 12) {
        toast.error("Maximum of 12 sections reached.");
        return;
      }
      const src = legal.sections[index];
      const next = [...legal.sections];
      next.splice(index + 1, 0, {
        id: `${key}-sec-${Date.now()}`,
        heading: `${src.heading} (Copy)`.slice(0, 160),
        body: src.body,
        icon: src.icon || "file-text",
        enabled: true,
        locked: false,
      });
      patchLegal(key, { sections: next });
    };

    const moveSection = (index: number, delta: -1 | 1) => {
      const target = index + delta;
      if (target < 0 || target >= legal.sections.length) return;
      const next = [...legal.sections];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      patchLegal(key, { sections: next });
    };

    return (
      <div className="space-y-6">
        {renderLivePagePreview(key)}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {key === "privacy" ? "Privacy Policy" : "Terms of Service"} — Visibility &amp; Layout
            </CardTitle>
            <CardDescription>
              Control document spacing, header alignment, and section visibility. Mandatory runtime compliance policies remain locked to match actual behavior.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 @xl/main:grid-cols-3">
              <div className="flex items-center justify-between rounded-lg border border-border bg-zinc-950/60 px-3 py-2.5">
                <Label htmlFor={`${key}-show-header`} className="cursor-pointer text-xs">
                  Show Header Block
                </Label>
                <Switch
                  id={`${key}-show-header`}
                  checked={legal.showHeader !== false}
                  onCheckedChange={(checked) => patchLegal(key, { showHeader: checked })}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border bg-zinc-950/60 px-3 py-2.5">
                <Label htmlFor={`${key}-show-sections`} className="cursor-pointer text-xs">
                  Show Policy Sections
                </Label>
                <Switch
                  id={`${key}-show-sections`}
                  checked={legal.showSections !== false}
                  onCheckedChange={(checked) => patchLegal(key, { showSections: checked })}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border bg-zinc-950/60 px-3 py-2.5">
                <Label htmlFor={`${key}-show-contact`} className="cursor-pointer text-xs">
                  Show Contact Footer
                </Label>
                <Switch
                  id={`${key}-show-contact`}
                  checked={legal.showContact !== false}
                  onCheckedChange={(checked) => patchLegal(key, { showContact: checked })}
                />
              </div>
            </div>

            <LayoutPresetSelectors
              spacingPreset={legal.spacingPreset}
              sectionAlignment={legal.sectionAlignment}
              onChange={(patch) => patchLegal(key, patch)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Document Metadata &amp; Sections</CardTitle>
            <CardDescription>
              Edit metadata and custom sections for <code>{TAB_LABELS[key].route}</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 @xl/card:grid-cols-2">
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

            <div className="grid gap-3 @xl/main:grid-cols-3">
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
              <div className="flex flex-wrap items-center justify-between gap-2">
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
                          icon: "file-text",
                          enabled: true,
                          locked: false,
                        },
                      ],
                    })
                  }
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Section
                </Button>
              </div>

              {legal.sections.map((sec, idx) => {
                const isLocked = Boolean(sec.locked || requiredSet.has(sec.id));
                const isEnabled = isLocked || sec.enabled !== false;
                return (
                  <div
                    key={sec.id}
                    className={cn(
                      "space-y-2.5 rounded-lg border p-3.5",
                      isEnabled
                        ? "border-border bg-zinc-950/70"
                        : "border-border/50 bg-zinc-950/30 opacity-65"
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">
                          Section #{idx + 1}
                        </span>
                        {isLocked && (
                          <Badge variant="outline" className="gap-1 text-[10px] text-amber-300 border-amber-500/40">
                            <Lock className="h-2.5 w-2.5" />
                            Mandatory Runtime Policy (Locked)
                          </Badge>
                        )}
                        {!isEnabled && (
                          <Badge variant="secondary" className="text-[10px]">
                            Hidden
                          </Badge>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {!isLocked && (
                          <div className="mr-1.5 flex items-center gap-1.5">
                            <Label
                              htmlFor={`legal-vis-${sec.id}`}
                              className="cursor-pointer text-[11px] text-muted-foreground"
                            >
                              Visible
                            </Label>
                            <Switch
                              id={`legal-vis-${sec.id}`}
                              checked={isEnabled}
                              onCheckedChange={(checked) => {
                                const next = [...legal.sections];
                                next[idx] = { ...next[idx], enabled: checked };
                                patchLegal(key, { sections: next });
                              }}
                            />
                          </div>
                        )}
                        {!isLocked && (
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            title="Duplicate"
                            disabled={legal.sections.length >= 12}
                            onClick={() => duplicateSection(idx)}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          disabled={idx === 0}
                          onClick={() => moveSection(idx, -1)}
                        >
                          <ArrowUp className="h-3 w-3" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          disabled={idx === legal.sections.length - 1}
                          onClick={() => moveSection(idx, 1)}
                        >
                          <ArrowDown className="h-3 w-3" />
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          className="h-7 w-7"
                          disabled={isLocked || legal.sections.length <= 1}
                          title={
                            isLocked
                              ? "Mandatory compliance section cannot be removed"
                              : "Remove section"
                          }
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
                    </div>

                    <div className="grid gap-3 @xl/card:grid-cols-12">
                      <div className="space-y-1 @lg/main:col-span-4">
                        <Label className="text-[11px]">Section Icon</Label>
                        <IconPicker
                          value={sec.icon || "file-text"}
                          onChange={(icon) => {
                            const next = [...legal.sections];
                            next[idx] = { ...next[idx], icon };
                            patchLegal(key, { sections: next });
                          }}
                        />
                      </div>
                      <div className="space-y-1 @lg/main:col-span-8">
                        <Label className="text-[11px]">Section Heading</Label>
                        <Input
                          value={sec.heading}
                          maxLength={160}
                          disabled={isLocked}
                          placeholder="Section heading"
                          onChange={(e) => {
                            const next = [...legal.sections];
                            next[idx] = { ...next[idx], heading: e.target.value };
                            patchLegal(key, { sections: next });
                          }}
                        />
                      </div>
                    </div>

                    <textarea
                      rows={3}
                      maxLength={2400}
                      disabled={isLocked}
                      value={sec.body}
                      onChange={(e) => {
                        const next = [...legal.sections];
                        next[idx] = { ...next[idx], body: e.target.value };
                        patchLegal(key, { sections: next });
                      }}
                      className={cn(TEXTAREA_CLS, isLocked && "opacity-75")}
                    />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {renderTabActionFooter(key)}
      </div>
    );
  };

  const homeOrder =
    pagesDraft.home.sectionOrder && pagesDraft.home.sectionOrder.length > 0
      ? pagesDraft.home.sectionOrder
      : DEFAULT_HOME_SECTION_ORDER;
  const featuresOrder =
    pagesDraft.features.sectionOrder && pagesDraft.features.sectionOrder.length > 0
      ? pagesDraft.features.sectionOrder
      : DEFAULT_FEATURES_SECTION_ORDER;
  const aboutOrder =
    pagesDraft.about.sectionOrder && pagesDraft.about.sectionOrder.length > 0
      ? pagesDraft.about.sectionOrder
      : DEFAULT_ABOUT_SECTION_ORDER;

  return (
    <AppShell
      requireAdmin
      title="Pages & Content Editor"
      description="Customize public Home (including Hero toggle, animation & queue), Features, About, Privacy Policy, and Terms of Service layouts, sections, icons, and copy independently."
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
              All HTML tags and unsafe scripts are stripped automatically on save. Icons use curated Lucide SVG symbols, and edits save cleanly to Cloudflare D1 without triggering Discord messages.
            </span>
          </div>

          <div onBlurCapture={(event) => { if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) saveLatest.current(); }}>
          <Tabs
            value={activeTab}
            onValueChange={(val) => setActiveTab(val as PageTabKey)}
            className="space-y-6"
          >
            <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 p-1">
              {(Object.keys(TAB_LABELS) as PageTabKey[]).map((key) => (
                <TabsTrigger key={key} value={key} className="gap-1.5">
                  <span>{TAB_LABELS[key].label}</span>
                  {dirtyTabs[key] && (
                    <span
                      title="Unsaved changes"
                      className="h-2 w-2 rounded-full bg-amber-400"
                    />
                  )}
                </TabsTrigger>
              ))}
            </TabsList>

            {renderTabActionFooter(activeTab)}

            {/* ==================== TAB 1: HOME + HERO CONTROLLER ==================== */}
            <TabsContent value="home" className="space-y-6">
              {renderLivePagePreview("home")}

              {/* Section Visibility, Reordering & Layout Presets */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Homepage Sections, Hero Visibility &amp; Layout Presets
                  </CardTitle>
                  <CardDescription>
                    Show, hide, or reorder major blocks on <code>/</code>. Disabling Homepage Hero keeps your saved Hero messages and animation settings intact.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    {homeOrder.map((key, idx) => {
                      const meta = HOME_SECTION_META[key];
                      const visible = pagesDraft.home[meta.toggleField] !== false;
                      return (
                        <div
                          key={key}
                          className={cn(
                            "flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5",
                            visible
                              ? "border-border bg-zinc-950/60"
                              : "border-border/50 bg-zinc-950/25 opacity-70"
                          )}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs text-zinc-500">
                              #{idx + 1}
                            </span>
                            <span className="text-sm font-medium text-white">
                              {meta.label}
                            </span>
                            {key === "hero" && !visible && (
                              <Badge variant="warning" className="text-[10px]">
                                Hero Disabled — Config Preserved
                              </Badge>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <Switch
                              id={`home-vis-${key}`}
                              checked={visible}
                              onCheckedChange={(checked) =>
                                patchHome({ [meta.toggleField]: checked } as any)
                              }
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-7 w-7"
                              disabled={idx === 0}
                              onClick={() =>
                                patchHome({
                                  sectionOrder: moveOrderKey(homeOrder, idx, -1),
                                })
                              }
                            >
                              <ArrowUp className="h-3 w-3" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-7 w-7"
                              disabled={idx === homeOrder.length - 1}
                              onClick={() =>
                                patchHome({
                                  sectionOrder: moveOrderKey(homeOrder, idx, 1),
                                })
                              }
                            >
                              <ArrowDown className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <LayoutPresetSelectors
                    spacingPreset={pagesDraft.home.spacingPreset}
                    sectionAlignment={pagesDraft.home.sectionAlignment}
                    surfaceStyle={pagesDraft.home.surfaceStyle}
                    columns={pagesDraft.home.featureColumns || 3}
                    columnsLabel="Feature Cards Columns"
                    onChange={(patch) =>
                      patchHome({
                        ...(patch.spacingPreset ? { spacingPreset: patch.spacingPreset } : {}),
                        ...(patch.sectionAlignment
                          ? { sectionAlignment: patch.sectionAlignment }
                          : {}),
                        ...(patch.surfaceStyle ? { surfaceStyle: patch.surfaceStyle } : {}),
                        ...(patch.columns ? { featureColumns: patch.columns } : {}),
                      })
                    }
                  />
                </CardContent>
              </Card>

              <div className="grid gap-6 @4xl/main:grid-cols-12">
                {/* Motion, Timing & Homepage Section Copy */}
                <div className="space-y-6 @4xl/main:col-span-5">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Sparkles className="h-4 w-4 text-amber-400" />
                        Hero Motion &amp; Timing
                      </CardTitle>
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

                      <div className="grid gap-3 @xl/card:grid-cols-2">
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

                      <div className="grid gap-3 @xl/card:grid-cols-2">
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
                      <CardTitle className="text-base">Homepage Copy &amp; Buttons</CardTitle>
                      <CardDescription>
                        Customize section headers, CTAs, and empty-archive text on <code>/</code>.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid gap-3 @xl/card:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label>Hero Eyebrow Badge</Label>
                          <Input
                            value={pagesDraft.home.badgeText}
                            maxLength={80}
                            onChange={(e) => patchHome({ badgeText: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Primary CTA Label</Label>
                          <Input
                            value={pagesDraft.home.primaryCtaLabel || "Add to Discord"}
                            maxLength={50}
                            onChange={(e) => patchHome({ primaryCtaLabel: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="grid gap-3 @xl/card:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label>Features Button Label</Label>
                          <Input
                            value={pagesDraft.home.featuresCtaLabel}
                            maxLength={50}
                            onChange={(e) => patchHome({ featuresCtaLabel: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Listings Section Badge</Label>
                          <Input
                            value={pagesDraft.home.sectionBadge}
                            maxLength={80}
                            onChange={(e) => patchHome({ sectionBadge: e.target.value })}
                          />
                        </div>
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
                          onChange={(e) =>
                            patchHome({ archiveEmptyDescription: e.target.value })
                          }
                          className={TEXTAREA_CLS}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Right Column: Hero Messages Queue + Feature Cards CRUD */}
                <div className="space-y-6 @4xl/main:col-span-7">
                  <Card className="h-fit">
                    <CardHeader className="flex flex-col gap-2 @2xl/main:flex-row @2xl/main:items-center @2xl/main:justify-between">
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

                          <div className="grid gap-3 @xl/card:grid-cols-2">
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

                  <FeatureCardCrudList
                    title="Homepage Feature Cards"
                    description="Customize icons, order, visibility, and copy for the highlight cards below the archive grid."
                    items={pagesDraft.home.featureCards || []}
                    maxItems={6}
                    defaultIcon="bell"
                    newLabel="Feature Card"
                    onChange={(featureCards) => patchHome({ featureCards })}
                  />
                </div>
              </div>

              <Card><CardHeader><CardTitle>Hero badge & scheduled check display</CardTitle><CardDescription>Changes autosave. Frequency controls affect public display only.</CardDescription></CardHeader><CardContent className="grid gap-4 @2xl/main:grid-cols-2">
  <label className="flex items-center justify-between gap-3">Show Hero Eyebrow Badge<Switch checked={pagesDraft.home.showHeroBadge !== false} onCheckedChange={showHeroBadge => patchHome({ showHeroBadge })} /></label>
  <IconPicker value={pagesDraft.home.heroBadgeIcon || "none"} fallback="none" onChange={heroBadgeIcon => patchHome({ heroBadgeIcon })} />
  <label className="space-y-1 text-sm">Badge appearance<Select value={pagesDraft.home.heroBadgeStyle || "subtle"} onValueChange={heroBadgeStyle => patchHome({ heroBadgeStyle: heroBadgeStyle as any })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="subtle">Subtle</SelectItem><SelectItem value="outline">Outline</SelectItem><SelectItem value="solid">Solid Zinc</SelectItem></SelectContent></Select></label>
  <label className="flex items-center justify-between gap-3">Show Scheduled Store Check<Switch checked={pagesDraft.home.showScheduledCheck !== false} onCheckedChange={showScheduledCheck => patchHome({ showScheduledCheck })} /></label>
  <label className="space-y-1 text-sm">Frequency display<Select value={pagesDraft.home.scheduledCheckMode || "automatic"} onValueChange={scheduledCheckMode => patchHome({ scheduledCheckMode: scheduledCheckMode as any })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="automatic">Automatic (configured interval)</SelectItem><SelectItem value="custom">Custom display only</SelectItem></SelectContent></Select></label>
  <label className="space-y-1 text-sm">Indicator label<Input value={pagesDraft.home.scheduledCheckLabel ?? "Scheduled Store Check"} onChange={e => patchHome({ scheduledCheckLabel: e.target.value })} maxLength={80} /></label>
  {pagesDraft.home.scheduledCheckMode === "custom" && <label className="space-y-1 text-sm">Displayed minutes<Input type="number" min={1} max={1440} value={pagesDraft.home.scheduledCheckMinutes || STORE_MONITOR_INTERVAL_MINUTES} onChange={e => patchHome({ scheduledCheckMinutes: Number(e.target.value) })} /></label>}
</CardContent></Card>
<PageExtensionsEditor page={pagesDraft.home} onChange={patch => setPagesDraft(prev => ({ ...prev, home: { ...prev.home, ...patch } }))} />
{renderTabActionFooter("home")}
            </TabsContent>

            {/* ==================== TAB 2: FEATURES PAGE ==================== */}
            <TabsContent value="features" className="space-y-6">
              {renderLivePagePreview("features")}

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Features Page — Section Visibility, Order &amp; Layout Presets
                  </CardTitle>
                  <CardDescription>
                    Toggle or reorder any section on <code>/features</code> and adjust global grid spacing and card elevation.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-2 @2xl/main:grid-cols-2">
                    {featuresOrder.map((key, idx) => {
                      const meta = FEATURES_SECTION_META[key];
                      const visible = pagesDraft.features[meta.toggleField] !== false;
                      return (
                        <div
                          key={key}
                          className={cn(
                            "flex items-center justify-between gap-2 rounded-lg border px-3 py-2",
                            visible
                              ? "border-border bg-zinc-950/60"
                              : "border-border/50 bg-zinc-950/25 opacity-65"
                          )}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="font-mono text-[11px] text-zinc-500">
                              #{idx + 1}
                            </span>
                            <span className="truncate text-xs font-medium text-white">
                              {meta.label}
                            </span>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <Switch
                              id={`feat-vis-${key}`}
                              checked={visible}
                              onCheckedChange={(checked) =>
                                patchFeatures({ [meta.toggleField]: checked } as any)
                              }
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-7 w-7"
                              disabled={idx === 0}
                              onClick={() =>
                                patchFeatures({
                                  sectionOrder: moveOrderKey(featuresOrder, idx, -1),
                                })
                              }
                            >
                              <ArrowUp className="h-3 w-3" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-7 w-7"
                              disabled={idx === featuresOrder.length - 1}
                              onClick={() =>
                                patchFeatures({
                                  sectionOrder: moveOrderKey(featuresOrder, idx, 1),
                                })
                              }
                            >
                              <ArrowDown className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <LayoutPresetSelectors
                    spacingPreset={pagesDraft.features.spacingPreset}
                    sectionAlignment={pagesDraft.features.sectionAlignment}
                    surfaceStyle={pagesDraft.features.surfaceStyle}
                    columns={pagesDraft.features.capabilitiesColumns || 3}
                    columnsLabel="Capabilities Grid Columns"
                    onChange={(patch) =>
                      patchFeatures({
                        ...(patch.spacingPreset ? { spacingPreset: patch.spacingPreset } : {}),
                        ...(patch.sectionAlignment
                          ? { sectionAlignment: patch.sectionAlignment }
                          : {}),
                        ...(patch.surfaceStyle ? { surfaceStyle: patch.surfaceStyle } : {}),
                        ...(patch.columns ? { capabilitiesColumns: patch.columns } : {}),
                      })
                    }
                  />
                </CardContent>
              </Card>

              <div className="grid gap-6 @4xl/main:grid-cols-12">
                <Card className="@4xl/main:col-span-6 h-fit">
                  <CardHeader>
                    <CardTitle className="text-base">Header, Preview &amp; CTA Copy</CardTitle>
                    <CardDescription>
                      Customize headlines, button icons, and call-to-action messaging.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1.5">
                      <Label>Hero Badge</Label>
                      <Input
                        value={pagesDraft.features.badgeText}
                        maxLength={80}
                        onChange={(e) => patchFeatures({ badgeText: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Main Heading</Label>
                      <Input
                        value={pagesDraft.features.heading}
                        maxLength={140}
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

                    <div className="grid gap-3 @xl/card:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Primary CTA Label</Label>
                        <Input
                          value={pagesDraft.features.primaryCtaLabel}
                          maxLength={50}
                          onChange={(e) => patchFeatures({ primaryCtaLabel: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Primary CTA Icon</Label>
                        <IconPicker
                          value={pagesDraft.features.primaryCtaIcon || "bot"}
                          onChange={(primaryCtaIcon) => patchFeatures({ primaryCtaIcon })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Secondary CTA Label</Label>
                        <Input
                          value={pagesDraft.features.secondaryCtaLabel}
                          maxLength={50}
                          onChange={(e) => patchFeatures({ secondaryCtaLabel: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Secondary CTA Icon</Label>
                        <IconPicker
                          value={pagesDraft.features.secondaryCtaIcon || "eye"}
                          onChange={(secondaryCtaIcon) => patchFeatures({ secondaryCtaIcon })}
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5 border-t border-border pt-3">
                      <Label>Discord Previews Heading</Label>
                      <Input
                        value={pagesDraft.features.previewsHeading}
                        maxLength={120}
                        onChange={(e) => patchFeatures({ previewsHeading: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Discord Previews Subtitle</Label>
                      <textarea
                        rows={2}
                        maxLength={320}
                        value={pagesDraft.features.previewsSubheading}
                        onChange={(e) => patchFeatures({ previewsSubheading: e.target.value })}
                        className={TEXTAREA_CLS}
                      />
                    </div>

                    <div className="space-y-1.5 border-t border-border pt-3">
                      <Label>Workflow Heading</Label>
                      <Input
                        value={pagesDraft.features.workflowHeading}
                        maxLength={120}
                        onChange={(e) => patchFeatures({ workflowHeading: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Workflow Subtitle</Label>
                      <textarea
                        rows={2}
                        maxLength={320}
                        value={pagesDraft.features.workflowSubheading}
                        onChange={(e) => patchFeatures({ workflowSubheading: e.target.value })}
                        className={TEXTAREA_CLS}
                      />
                    </div>

                    <div className="space-y-1.5 border-t border-border pt-3">
                      <Label>Capabilities Section Heading</Label>
                      <Input
                        value={pagesDraft.features.capabilitiesHeading}
                        maxLength={120}
                        onChange={(e) => patchFeatures({ capabilitiesHeading: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Capabilities Section Subtitle</Label>
                      <textarea
                        rows={2}
                        maxLength={320}
                        value={pagesDraft.features.capabilitiesSubheading}
                        onChange={(e) =>
                          patchFeatures({ capabilitiesSubheading: e.target.value })
                        }
                        className={TEXTAREA_CLS}
                      />
                    </div>

                    <div className="space-y-1.5 border-t border-border pt-3">
                      <Label>Bottom CTA Title</Label>
                      <Input
                        value={pagesDraft.features.ctaTitle}
                        maxLength={120}
                        onChange={(e) => patchFeatures({ ctaTitle: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Bottom CTA Description</Label>
                      <textarea
                        rows={2}
                        maxLength={320}
                        value={pagesDraft.features.ctaDescription}
                        onChange={(e) => patchFeatures({ ctaDescription: e.target.value })}
                        className={TEXTAREA_CLS}
                      />
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-6 @4xl/main:col-span-6">
                  <FeatureCardCrudList
                    title="Workflow Pipeline Steps"
                    description="Customize lifecycle verification steps displayed on /features."
                    items={pagesDraft.features.workflowSteps || []}
                    maxItems={6}
                    defaultIcon="activity"
                    newLabel="Step"
                    onChange={(workflowSteps) => patchFeatures({ workflowSteps })}
                  />

                  <FeatureCardCrudList
                    title="Capabilities Grid Cards"
                    description="Highlight core platform capabilities with searchable Lucide icons."
                    items={pagesDraft.features.capabilities}
                    maxItems={12}
                    defaultIcon="sparkles"
                    newLabel="Capability"
                    onChange={(capabilities) => patchFeatures({ capabilities })}
                  />
                </div>
              </div>

              <PageExtensionsEditor page={pagesDraft.features} onChange={patch => setPagesDraft(prev => ({ ...prev, features: { ...prev.features, ...patch } }))} />
{renderTabActionFooter("features")}
            </TabsContent>

            {/* ==================== TAB 3: ABOUT PAGE ==================== */}
            <TabsContent value="about" className="space-y-6">
              {renderLivePagePreview("about")}

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    About Page — Section Visibility, Order &amp; Layout Presets
                  </CardTitle>
                  <CardDescription>
                    Control layout density, alignment, and visible blocks on <code>/about</code>.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    {aboutOrder.map((key, idx) => {
                      const meta = ABOUT_SECTION_META[key];
                      const visible = meta.toggleField
                        ? pagesDraft.about[meta.toggleField] !== false
                        : pagesDraft.about.showArchitecture !== false ||
                          pagesDraft.about.showDisclaimer !== false;
                      return (
                        <div
                          key={key}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-zinc-950/60 px-3.5 py-2.5"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-zinc-500">#{idx + 1}</span>
                            <span className="text-sm font-medium text-white">{meta.label}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {meta.toggleField ? (
                              <Switch
                                checked={visible}
                                onCheckedChange={(checked) =>
                                  patchAbout({ [meta.toggleField!]: checked } as any)
                                }
                              />
                            ) : (
                              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                <label className="flex items-center gap-1.5">
                                  <span>Infra</span>
                                  <Switch
                                    checked={pagesDraft.about.showArchitecture !== false}
                                    onCheckedChange={(checked) =>
                                      patchAbout({ showArchitecture: checked })
                                    }
                                  />
                                </label>
                                <label className="flex items-center gap-1.5">
                                  <span>Disclaimer</span>
                                  <Switch
                                    checked={pagesDraft.about.showDisclaimer !== false}
                                    onCheckedChange={(checked) =>
                                      patchAbout({ showDisclaimer: checked })
                                    }
                                  />
                                </label>
                              </div>
                            )}
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-7 w-7"
                              disabled={idx === 0}
                              onClick={() =>
                                patchAbout({ sectionOrder: moveOrderKey(aboutOrder, idx, -1) })
                              }
                            >
                              <ArrowUp className="h-3 w-3" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-7 w-7"
                              disabled={idx === aboutOrder.length - 1}
                              onClick={() =>
                                patchAbout({ sectionOrder: moveOrderKey(aboutOrder, idx, 1) })
                              }
                            >
                              <ArrowDown className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <LayoutPresetSelectors
                    spacingPreset={pagesDraft.about.spacingPreset}
                    sectionAlignment={pagesDraft.about.sectionAlignment}
                    surfaceStyle={pagesDraft.about.surfaceStyle}
                    columns={pagesDraft.about.workflowColumns || 2}
                    columnsLabel="Workflow Grid Columns"
                    onChange={(patch) =>
                      patchAbout({
                        ...(patch.spacingPreset ? { spacingPreset: patch.spacingPreset } : {}),
                        ...(patch.sectionAlignment
                          ? { sectionAlignment: patch.sectionAlignment }
                          : {}),
                        ...(patch.surfaceStyle ? { surfaceStyle: patch.surfaceStyle } : {}),
                        ...(patch.columns ? { workflowColumns: patch.columns } : {}),
                      })
                    }
                  />
                </CardContent>
              </Card>

              <div className="grid gap-6 @4xl/main:grid-cols-12">
                <Card className="@4xl/main:col-span-6 h-fit">
                  <CardHeader>
                    <CardTitle className="text-base">About Hero, Mission &amp; Architecture</CardTitle>
                    <CardDescription>
                      Configure the public overview, icons, and independent project disclaimer on{" "}
                      <code>/about</code>.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid gap-3 @xl/card:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Hero Badge</Label>
                        <Input
                          value={pagesDraft.about.badgeText}
                          maxLength={80}
                          onChange={(e) => patchAbout({ badgeText: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Main Heading</Label>
                        <Input
                          value={pagesDraft.about.heading}
                          maxLength={140}
                          onChange={(e) => patchAbout({ heading: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Subheading</Label>
                      <textarea
                        rows={2}
                        maxLength={400}
                        value={pagesDraft.about.subheading}
                        onChange={(e) => patchAbout({ subheading: e.target.value })}
                        className={TEXTAREA_CLS}
                      />
                    </div>
                    <div className="grid gap-3 @xl/card:grid-cols-2">
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

                    <div className="grid gap-3 border-t border-border pt-3 @xl/main:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Mission Icon</Label>
                        <IconPicker
                          value={pagesDraft.about.missionIcon || "layers"}
                          onChange={(missionIcon) => patchAbout({ missionIcon })}
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
                    </div>
                    <div className="space-y-1.5">
                      <Label>Mission Narrative</Label>
                      <textarea
                        rows={4}
                        maxLength={1200}
                        value={pagesDraft.about.missionBody}
                        onChange={(e) => patchAbout({ missionBody: e.target.value })}
                        className={TEXTAREA_CLS}
                      />
                    </div>

                    <div className="grid gap-3 border-t border-border pt-3 @xl/main:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Architecture Icon</Label>
                        <IconPicker
                          value={pagesDraft.about.architectureIcon || "database"}
                          onChange={(architectureIcon) => patchAbout({ architectureIcon })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Architecture Heading</Label>
                        <Input
                          value={pagesDraft.about.architectureHeading}
                          maxLength={120}
                          onChange={(e) => patchAbout({ architectureHeading: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Architecture Details</Label>
                      <textarea
                        rows={3}
                        maxLength={1000}
                        value={pagesDraft.about.architectureBody}
                        onChange={(e) => patchAbout({ architectureBody: e.target.value })}
                        className={TEXTAREA_CLS}
                      />
                    </div>

                    <div className="grid gap-3 border-t border-border pt-3 @xl/main:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Disclaimer Icon</Label>
                        <IconPicker
                          value={pagesDraft.about.disclaimerIcon || "shield-check"}
                          onChange={(disclaimerIcon) => patchAbout({ disclaimerIcon })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Disclaimer Heading</Label>
                        <Input
                          value={pagesDraft.about.disclaimerHeading}
                          maxLength={120}
                          onChange={(e) => patchAbout({ disclaimerHeading: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Disclaimer Details</Label>
                      <textarea
                        rows={3}
                        maxLength={1000}
                        value={pagesDraft.about.disclaimerBody}
                        onChange={(e) => patchAbout({ disclaimerBody: e.target.value })}
                        className={TEXTAREA_CLS}
                      />
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-6 @4xl/main:col-span-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Workflow Section Header</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-1.5">
                        <Label>Workflow Heading</Label>
                        <Input
                          value={pagesDraft.about.workflowHeading}
                          maxLength={120}
                          onChange={(e) => patchAbout({ workflowHeading: e.target.value })}
                        />
                      </div>
                    </CardContent>
                  </Card>

                  <FeatureCardCrudList
                    title="Workflow Breakdown Steps"
                    description="Customize architecture & verification cards shown on /about."
                    items={pagesDraft.about.workflowSteps}
                    maxItems={8}
                    defaultIcon="activity"
                    newLabel="Step"
                    onChange={(workflowSteps) => patchAbout({ workflowSteps })}
                  />
                </div>
              </div>

              <PageExtensionsEditor page={pagesDraft.about} onChange={patch => setPagesDraft(prev => ({ ...prev, about: { ...prev.about, ...patch } }))} />
{renderTabActionFooter("about")}
            </TabsContent>

            {/* ==================== TAB 4 & 5: LEGAL PAGES ==================== */}
            <TabsContent value="privacy">{renderLegalEditor("privacy")}</TabsContent>
            <TabsContent value="terms">{renderLegalEditor("terms")}</TabsContent>
          </Tabs>
          </div>
        </div>
      )}

      {/* Reset Page Confirmation Modal */}
      <Dialog
        open={Boolean(resetTarget)}
        onOpenChange={(open) => !open && setResetTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Reset {resetTarget ? TAB_LABELS[resetTarget].label : "Page"} to Defaults?
            </DialogTitle>
            <DialogDescription>
              This restores the default headings, badges, layout presets, icons, and copy for this page
              {resetTarget === "home" ? " (including Homepage Hero animation messages)" : ""} without affecting any vehicle listings or other pages.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmReset}>
              Restore Page Defaults
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
