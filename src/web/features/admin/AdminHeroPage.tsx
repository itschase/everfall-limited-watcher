import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
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
  apiFetch,
  HeroAnimationStyle,
  HeroConfig,
  HeroMessageItem,
  PresentationBundleResponse,
} from "@/lib/api";
import { DEFAULT_HERO_CONFIG } from "../../../shared/presentation";
import { cn } from "@/lib/utils";
import { AppShell } from "@/components/layout/AppShell";
import { AnimatedHero } from "@/components/hero/AnimatedHero";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

export function AdminHeroPage() {
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

  const [draft, setDraft] = useState<HeroConfig>(DEFAULT_HERO_CONFIG);
  const [previewSelection, setPreviewSelection] = useState<string>("auto");
  const [replayNonce, setReplayNonce] = useState<number>(0);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  useEffect(() => {
    if (presentationRes?.bundle?.hero) {
      setDraft(presentationRes.bundle.hero);
    }
  }, [presentationRes?.bundle?.hero]);

  const saveMutation = useMutation({
    mutationFn: (nextHero: HeroConfig) =>
      apiFetch<PresentationBundleResponse>("/api/admin/presentation", {
        method: "PUT",
        body: JSON.stringify({ hero: nextHero }),
      }),
    onSuccess: (res) => {
      queryClient.setQueryData(["admin-presentation"], res);
      setDraft(res.bundle.hero);
      void queryClient.invalidateQueries({ queryKey: ["public-listings"] });
      void queryClient.invalidateQueries({ queryKey: ["public-status"] });
      toast.success("Saved homepage hero settings cleanly.");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to save hero settings.");
    },
  });

  const activeMessages = draft.messages.filter((m) => m.enabled);
  const previewIndex =
    previewSelection === "auto"
      ? undefined
      : Math.max(
          0,
          activeMessages.findIndex((m) => m.id === previewSelection)
        );

  const updateMessage = (index: number, patch: Partial<HeroMessageItem>) => {
    setDraft((prev) => {
      const next = [...prev.messages];
      next[index] = { ...next[index], ...patch };
      return { ...prev, messages: next };
    });
  };

  const setDefaultMessage = (index: number) => {
    setDraft((prev) => ({
      ...prev,
      messages: prev.messages.map((m, idx) => ({
        ...m,
        isDefault: idx === index,
      })),
    }));
  };

  const moveMessage = (index: number, delta: -1 | 1) => {
    setDraft((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.messages.length) return prev;
      const next = [...prev.messages];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return { ...prev, messages: next };
    });
  };

  const removeMessage = (index: number) => {
    setDraft((prev) => {
      if (prev.messages.length <= 1) return prev;
      const next = prev.messages.filter((_, idx) => idx !== index);
      if (!next.some((m) => m.isDefault)) {
        next[0] = { ...next[0], isDefault: true };
      }
      return { ...prev, messages: next };
    });
  };

  const addMessage = () => {
    if (draft.messages.length >= 12) {
      toast.error("Maximum of 12 hero messages reached.");
      return;
    }
    const id = `hero-${Date.now()}`;
    setDraft((prev) => ({
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

  const handleResetConfirm = () => {
    setResetDialogOpen(false);
    setDraft(DEFAULT_HERO_CONFIG);
    setPreviewSelection("auto");
    setReplayNonce((n) => n + 1);
    saveMutation.mutate(DEFAULT_HERO_CONFIG);
  };

  return (
    <AppShell
      requireAdmin
      title="Homepage Hero Controller"
      description="Configure rotating homepage hero messages, animation styles, typography size, and transition timing."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin">Overview</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/">
              View Public Homepage
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
            Refresh
          </Button>
        </div>
      }
    >
      {isLoading ? (
        <div className="space-y-6">
          <Skeleton className="h-56 w-full rounded-xl" />
          <div className="grid gap-6 lg:grid-cols-2">
            <Skeleton className="h-80 w-full rounded-xl" />
            <Skeleton className="h-80 w-full rounded-xl" />
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Web-Only Notice */}
          <div className="flex items-start gap-2.5 rounded-xl border border-border bg-zinc-950/80 px-4 py-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
            <span>
              Hero updates apply strictly to the public website (<code className="text-white">/</code>) and never broadcast or modify Discord messages. Visitor view automatically hides manual slide arrows and pagination dots.
            </span>
          </div>

          {/* Live Interactive Preview */}
          <Card className="overflow-hidden border-zinc-800">
            <CardHeader className="flex flex-col gap-3 border-b border-border bg-zinc-950/60 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="h-4 w-4 text-amber-400" />
                  Live Hero Preview
                </CardTitle>
                <CardDescription>
                  Switch between active messages or replay the selected animation style directly below.
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
                  Replay Animation
                </Button>
              </div>
            </CardHeader>
            <CardContent className="relative bg-zinc-950 px-6 py-10">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.06),transparent_65%)]" />
              <div className="relative mx-auto max-w-4xl">
                <AnimatedHero
                  config={draft}
                  previewIndex={previewIndex}
                  replayNonce={replayNonce}
                  compact
                />
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-12">
            {/* Motion & Typography Controls */}
            <Card className="lg:col-span-5">
              <CardHeader>
                <CardTitle className="text-base">Motion &amp; Timing Controls</CardTitle>
                <CardDescription>
                  Tune animation style, cycle cadence, and fallback copy.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Animation Style</Label>
                  <Select
                    value={draft.animationStyle}
                    onValueChange={(style) => {
                      setDraft({
                        ...draft,
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
                      ANIMATION_STYLES.find((s) => s.value === draft.animationStyle)
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
                    checked={draft.autoRotate}
                    onCheckedChange={(autoRotate) => setDraft({ ...draft, autoRotate })}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="hero-interval">Cycle Interval (ms)</Label>
                    <Input
                      id="hero-interval"
                      type="number"
                      min={2500}
                      max={20000}
                      step={250}
                      value={draft.intervalMs}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
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
                      value={draft.durationMs}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          durationMs: Number(e.target.value) || 650,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="hero-delay">Token Stagger Delay (ms)</Label>
                    <Input
                      id="hero-delay"
                      type="number"
                      min={0}
                      max={600}
                      step={10}
                      value={draft.delayMs}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          delayMs: Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Font Size Preset</Label>
                    <Select
                      value={draft.fontSizePreset}
                      onValueChange={(preset) =>
                        setDraft({
                          ...draft,
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
                    Global Fallback Subtext ({draft.secondaryDescription.length}/340)
                  </Label>
                  <textarea
                    id="hero-secondary-desc"
                    rows={3}
                    maxLength={340}
                    value={draft.secondaryDescription}
                    onChange={(e) =>
                      setDraft({ ...draft, secondaryDescription: e.target.value })
                    }
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Messages Queue */}
            <Card className="lg:col-span-7">
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">Hero Messages ({draft.messages.length}/12)</CardTitle>
                  <CardDescription>
                    Manage rotating headlines, highlighted gradient phrases, and per-slide subtitles.
                  </CardDescription>
                </div>
                <Button type="button" variant="secondary" size="sm" onClick={addMessage}>
                  <Plus className="h-3.5 w-3.5" />
                  Add Message
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {draft.messages.map((msg, idx) => (
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
                            onCheckedChange={(enabled) => updateMessage(idx, { enabled })}
                          />
                        </div>

                        <Button
                          type="button"
                          variant={msg.isDefault ? "secondary" : "outline"}
                          size="sm"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => setDefaultMessage(idx)}
                        >
                          <Star className={cn("h-3 w-3", msg.isDefault && "text-amber-400")} />
                          Default
                        </Button>

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => {
                            if (!msg.enabled) updateMessage(idx, { enabled: true });
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
                          onClick={() => moveMessage(idx, -1)}
                        >
                          <ArrowUp className="h-3 w-3" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          disabled={idx === draft.messages.length - 1}
                          aria-label="Move message down"
                          onClick={() => moveMessage(idx, 1)}
                        >
                          <ArrowDown className="h-3 w-3" />
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          className="h-7 w-7"
                          disabled={draft.messages.length <= 1}
                          aria-label="Delete message"
                          onClick={() => removeMessage(idx)}
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
                          onChange={(e) => updateMessage(idx, { text: e.target.value })}
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
                            updateMessage(idx, { highlightText: e.target.value })
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
                        placeholder={draft.secondaryDescription}
                        onChange={(e) => updateMessage(idx, { subtext: e.target.value })}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Save Footer */}
          <Card>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-muted-foreground">
                Active messages in rotation:{" "}
                <strong className="text-white">{activeMessages.length}</strong> &bull; Style:{" "}
                <strong className="text-white">
                  {ANIMATION_STYLES.find((s) => s.value === draft.animationStyle)?.label}
                </strong>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={saveMutation.isPending}
                  onClick={() => setResetDialogOpen(true)}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset to Default
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  disabled={saveMutation.isPending}
                  onClick={() => {
                    if (presentationRes?.bundle?.hero) {
                      setDraft(presentationRes.bundle.hero);
                    }
                  }}
                >
                  Cancel Changes
                </Button>

                <Button
                  type="button"
                  disabled={saveMutation.isPending}
                  onClick={() => saveMutation.mutate(draft)}
                >
                  {saveMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving Hero...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      Save Hero Settings
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Factory Reset Confirmation */}
      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Homepage Hero to Factory Defaults</DialogTitle>
            <DialogDescription>
              This replaces your custom hero messages and timing configuration with the default Everfall Limited Watcher headline and Soft Reveal animation.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={saveMutation.isPending}
              onClick={handleResetConfirm}
            >
              Reset &amp; Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
