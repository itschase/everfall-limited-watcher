import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Edit3,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  AnnouncementTemplate,
  apiFetch,
  DiscordEmojiRef,
  DispatchEditResponse,
  ListingItem,
  PresentationBundleResponse,
  PresentationConfigBundle,
  WidgetTemplateConfig,
} from "@/lib/api";
import {
  createDefaultPresentationConfig,
  DEFAULT_WIDGET_TEMPLATE,
} from "../../../shared/presentation";
import { ADMIN_OVERVIEW_KEY, useAdminOverview } from "./useAdminOverview";
import { AppShell } from "@/components/layout/AppShell";
import {
  AnnouncementPreviewCard,
  WidgetPreviewCard,
} from "@/components/discord/DiscordMessagePreview";
import { EmojiPickerButton } from "@/components/discord/EmojiPicker";
import { WidgetTemplateEditor } from "@/components/discord/WidgetTemplateEditor";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function AnnouncementEditorForm({
  mode,
  value,
  onChange,
  recentEmojis,
  onRecordRecentEmoji,
}: {
  mode: "in_stock" | "sold_out";
  value: AnnouncementTemplate;
  onChange: (next: AnnouncementTemplate) => void;
  recentEmojis: DiscordEmojiRef[];
  onRecordRecentEmoji: (emoji: DiscordEmojiRef) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Accent Color (Hex)</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={/^#[0-9A-F]{6}$/i.test(value.accentColor) ? value.accentColor : "#F59E0B"}
              onChange={(e) => onChange({ ...value, accentColor: e.target.value.toUpperCase() })}
              className="h-9 w-10 cursor-pointer rounded border border-border bg-zinc-950 p-0.5"
            />
            <Input
              value={value.accentColor}
              maxLength={7}
              onChange={(e) => onChange({ ...value, accentColor: e.target.value.toUpperCase() })}
              className="h-9 font-mono text-xs"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Title Prefix</Label>
          <Input
            value={value.titlePrefix}
            maxLength={120}
            onChange={(e) => onChange({ ...value, titlePrefix: e.target.value })}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Title Emoji</Label>
          <EmojiPickerButton
            label={`${mode} Title Emoji`}
            value={value.titleEmoji}
            recentEmojis={recentEmojis}
            onSelectRecordRecent={onRecordRecentEmoji}
            onChange={(titleEmoji) => onChange({ ...value, titleEmoji })}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Availability Heading</Label>
          <Input
            value={value.availabilityHeading}
            maxLength={60}
            onChange={(e) => onChange({ ...value, availabilityHeading: e.target.value })}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Status Badge Label</Label>
          <Input
            value={value.statusLabel}
            maxLength={60}
            onChange={(e) => onChange({ ...value, statusLabel: e.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Status Emoji</Label>
          <EmojiPickerButton
            label={`${mode} Status Emoji`}
            value={value.statusEmoji}
            recentEmojis={recentEmojis}
            onSelectRecordRecent={onRecordRecentEmoji}
            onChange={(statusEmoji) => onChange({ ...value, statusEmoji })}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Description Body Mode</Label>
          <Select
            value={value.descriptionMode}
            onValueChange={(v) =>
              onChange({
                ...value,
                descriptionMode:
                  v === "short_summary" || v === "custom" ? v : "full_description",
              })
            }
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="full_description">Full Normalized Description</SelectItem>
              <SelectItem value="short_summary">Concise Feature Summary</SelectItem>
              <SelectItem value="custom">Custom Markdown Format</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Feature Display Style</Label>
          <Select
            value={value.featureStyle}
            onValueChange={(v) =>
              onChange({
                ...value,
                featureStyle: v === "bullet_list" ? "bullet_list" : "inline_badges",
              })
            }
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="inline_badges">Inline Badges</SelectItem>
              <SelectItem value="bullet_list">Bullet List</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {value.descriptionMode === "custom" && (
        <div className="space-y-1.5">
          <Label>Custom Body Format</Label>
          <textarea
            rows={4}
            value={value.customDescription}
            maxLength={2000}
            onChange={(e) => onChange({ ...value, customDescription: e.target.value })}
            className="w-full rounded-lg border border-border bg-zinc-950 p-3 font-mono text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-[11px] text-muted-foreground">
            Tokens: <code>{"{name}"}</code>, <code>{"{short_description}"}</code>,{" "}
            <code>{"{full_description}"}</code>, <code>{"{features}"}</code>,{" "}
            <code>{"{trading}"}</code>, <code>{"{delivery}"}</code>
          </p>
        </div>
      )}

      {/* Gallery & Image Slot */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Gallery Mode</Label>
          <Select
            value={value.galleryMode}
            onValueChange={(v) =>
              onChange({
                ...value,
                galleryMode:
                  v === "primary_only" || v === "custom_slot" || v === "none"
                    ? v
                    : "all_gallery",
              })
            }
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all_gallery">All R2 / Archived Gallery Images</SelectItem>
              <SelectItem value="primary_only">Primary Slot 0 Only</SelectItem>
              <SelectItem value="custom_slot">Custom Slot Only</SelectItem>
              <SelectItem value="none">Text Only (No Images)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {value.galleryMode === "custom_slot" && (
          <div className="space-y-1.5">
            <Label>Target Image Slot</Label>
            <Select
              value={String(value.primaryImageSlot)}
              onValueChange={(v) => onChange({ ...value, primaryImageSlot: Number(v) })}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 10 }, (_, idx) => (
                  <SelectItem key={idx} value={String(idx)}>
                    Slot {idx} {idx === 0 ? "(Primary)" : idx === 3 ? "(Widget)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Store Action Button */}
      <div className="space-y-3 rounded-lg border border-border bg-zinc-950/60 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-white">Include Link Button</p>
            <p className="text-xs text-muted-foreground">
              Adds an interactive action button below the vehicle gallery.
            </p>
          </div>
          <Switch
            checked={value.showStoreButton}
            onCheckedChange={(checked) => onChange({ ...value, showStoreButton: checked })}
          />
        </div>

        {value.showStoreButton && (
          <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Button Label</Label>
              <Input
                value={value.storeButtonLabel}
                maxLength={80}
                onChange={(e) => onChange({ ...value, storeButtonLabel: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Button Emoji</Label>
              <EmojiPickerButton
                label={`${mode} Button Emoji`}
                value={value.storeButtonEmoji}
                recentEmojis={recentEmojis}
                onSelectRecordRecent={onRecordRecentEmoji}
                onChange={(storeButtonEmoji) => onChange({ ...value, storeButtonEmoji })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Destination URL</Label>
              <Select
                value={value.storeButtonUrlMode}
                onValueChange={(v) =>
                  onChange({
                    ...value,
                    storeButtonUrlMode:
                      v === "category" || v === "store_home" || v === "website"
                        ? v
                        : "listing",
                  })
                }
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="listing">Package Listing URL</SelectItem>
                  <SelectItem value="category">Limited Cars Category</SelectItem>
                  <SelectItem value="store_home">Everfall Store Home</SelectItem>
                  <SelectItem value="website">Watcher Portal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      {/* Footer & Switches */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Footer Attribution</Label>
          <Input
            value={value.footerText}
            maxLength={200}
            onChange={(e) => onChange({ ...value, footerText: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Footer Emoji</Label>
          <EmojiPickerButton
            label={`${mode} Footer Emoji`}
            value={value.footerEmoji}
            recentEmojis={recentEmojis}
            onSelectRecordRecent={onRecordRecentEmoji}
            onChange={(footerEmoji) => onChange({ ...value, footerEmoji })}
          />
        </div>
      </div>

      <div className="space-y-2.5 rounded-lg border border-border bg-zinc-950/60 p-4 text-xs">
        {(
          [
            ["showFeatures", "Show Normalized Vehicle Features"],
            ["showTradingInfo", "Show Trading Restrictions"],
            ["showDeliveryInfo", "Show Garage Delivery Info"],
            ["showDetectionTime", "Show First Detected Timestamp"],
            ["showLastVerified", "Show Last Verified Timestamp"],
            ...(mode === "sold_out"
              ? ([["showSoldOutTime", "Show Confirmed Sold Out Timestamp"]] as Array<
                  [keyof AnnouncementTemplate, string]
                >)
              : []),
          ] as Array<[keyof AnnouncementTemplate, string]>
        ).map(([field, labelText]) => (
          <div
            key={field}
            className="flex items-center justify-between gap-3 border-b border-border/60 pb-2 last:border-b-0 last:pb-0"
          >
            <span className="font-medium text-zinc-200">{labelText}</span>
            <Switch
              checked={Boolean(value[field])}
              onCheckedChange={(checked) => onChange({ ...value, [field]: checked })}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdminEmbedsPage() {
  const queryClient = useQueryClient();
  const { data: overview } = useAdminOverview();

  const { data: presentationRes, isLoading } = useQuery<PresentationBundleResponse>({
    queryKey: ["admin-presentation"],
    queryFn: () => apiFetch<PresentationBundleResponse>("/api/admin/presentation"),
  });

  const [bundle, setBundle] = useState<PresentationConfigBundle>(() =>
    createDefaultPresentationConfig()
  );
  const [activeTab, setActiveTab] = useState<"in_stock" | "sold_out" | "widgets">("in_stock");
  const [selectedCarId, setSelectedCarId] = useState<string>("");
  const [selectedWidgetTplId, setSelectedWidgetTplId] = useState<string>("default");
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkScope, setBulkScope] = useState<"bulk" | "listing">("bulk");
  const [bulkListingId, setBulkListingId] = useState<string>("");
  const [bulkResults, setBulkResults] = useState<DispatchEditResponse | null>(null);
  const [refreshWidgetsOnSave, setRefreshWidgetsOnSave] = useState(true);

  useEffect(() => {
    if (presentationRes?.bundle) {
      setBundle(presentationRes.bundle);
    }
  }, [presentationRes?.bundle]);

  const listings: ListingItem[] = overview?.listings || [];
  useEffect(() => {
    if (listings.length > 0 && !selectedCarId) {
      setSelectedCarId(listings[0].id);
      setBulkListingId(listings[0].id);
    }
  }, [listings, selectedCarId]);

  const sampleCar: ListingItem =
    listings.find((l) => l.id === selectedCarId) ||
    listings[0] || {
      id: "7815819",
      name: "Seraph GTS",
      description:
        "This vehicle is quantity-limited; get it while it is still available. It comes with a custom sound and 17+ customization options.",
      url: "https://store.everfallcommunity.com/package/7815819",
      images: [],
      isAvailable: true,
      detectedAt: Date.now() - 3600_000,
      lastVerifiedAt: Date.now(),
      soldOutAt: null,
      lastHttpStatus: 200,
      readiness: "ready",
    };

  const recordRecentEmoji = (emoji: DiscordEmojiRef) => {
    setBundle((prev) => {
      const key = emoji.kind === "custom" ? `c:${emoji.id}` : `u:${emoji.name}`;
      const deduped = prev.recentEmojis.filter(
        (item) => (item.kind === "custom" ? `c:${item.id}` : `u:${item.name}`) !== key
      );
      return {
        ...prev,
        recentEmojis: [emoji, ...deduped].slice(0, 24),
      };
    });
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      apiFetch<PresentationBundleResponse>("/api/admin/presentation", {
        method: "PUT",
        body: JSON.stringify({
          ...bundle,
          refreshWidgets: activeTab === "widgets" && refreshWidgetsOnSave,
        }),
      }),
    onSuccess: (res) => {
      if (res.bundle) setBundle(res.bundle);
      void queryClient.invalidateQueries({ queryKey: ["admin-presentation"] });
      void queryClient.invalidateQueries({ queryKey: ADMIN_OVERVIEW_KEY });
      void queryClient.invalidateQueries({ queryKey: ["admin-widgets"] });
      toast.success(
        res.widgetRefresh
          ? `Saved appearance & synced ${res.widgetRefresh.refreshed} live widget(s).`
          : "Discord embed & widget appearance saved (no automatic channel broadcasts triggered)."
      );
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to save presentation configuration.");
    },
  });

  const bulkEditMutation = useMutation({
    mutationFn: () =>
      apiFetch<DispatchEditResponse>("/api/admin/dispatch/edit", {
        method: "POST",
        body: JSON.stringify(
          bulkScope === "bulk"
            ? { scope: "bulk" }
            : {
                scope: "listing",
                listingId: bulkListingId,
                guildIds: (overview?.connectedGuilds || [])
                  .filter((g) => Boolean(g.sentMessages?.[bulkListingId]?.messageId))
                  .map((g) => g.id),
              }
        ),
      }),
    onSuccess: (res) => {
      setBulkResults(res);
      void queryClient.invalidateQueries({ queryKey: ADMIN_OVERVIEW_KEY });
      toast.success(
        `Updated ${res.updatedCount} deployed Discord embed(s)${
          res.failedCount > 0 ? ` (${res.failedCount} failed)` : ""
        }.`
      );
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to update deployed Discord messages.");
    },
  });

  const activeWidgetTpl =
    selectedWidgetTplId === "default"
      ? bundle.widgetDefault
      : bundle.widgetTemplates.find((t) => t.id === selectedWidgetTplId) || bundle.widgetDefault;

  const updateActiveWidgetTpl = (next: WidgetTemplateConfig) => {
    if (selectedWidgetTplId === "default") {
      setBundle((prev) => ({ ...prev, widgetDefault: next }));
    } else {
      setBundle((prev) => ({
        ...prev,
        widgetTemplates: prev.widgetTemplates.map((t) => (t.id === next.id ? next : t)),
      }));
    }
  };

  const addCustomWidgetPreset = () => {
    const newId = `preset-${Date.now().toString(36)}`;
    const nextTpl: WidgetTemplateConfig = {
      ...bundle.widgetDefault,
      id: newId,
      name: `Custom Widget ${bundle.widgetTemplates.length + 1}`,
    };
    setBundle((prev) => ({
      ...prev,
      widgetTemplates: [...prev.widgetTemplates, nextTpl],
    }));
    setSelectedWidgetTplId(newId);
  };

  const deleteCustomWidgetPreset = (id: string) => {
    setBundle((prev) => ({
      ...prev,
      widgetTemplates: prev.widgetTemplates.filter((t) => t.id !== id),
    }));
    setSelectedWidgetTplId("default");
  };

  return (
    <AppShell
      requireAdmin
      title="Embed & Widget Presentation"
      description="Independently customize In Stock alerts, Sold Out updates, and Live Status Widget templates with live Discord previews and zero auto-broadcasts."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setBulkResults(null);
              setBulkModalOpen(true);
            }}
          >
            <Edit3 className="h-3.5 w-3.5" />
            Update Deployed Messages
          </Button>
          <Button
            size="sm"
            disabled={saveMutation.isPending || isLoading}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save Templates
          </Button>
        </div>
      }
    >
      {isLoading ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-[520px] w-full rounded-xl" />
          <Skeleton className="h-[520px] w-full rounded-xl" />
        </div>
      ) : (
        <div className="space-y-6">
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as "in_stock" | "sold_out" | "widgets")}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <TabsList>
                <TabsTrigger value="in_stock">In Stock Announcements</TabsTrigger>
                <TabsTrigger value="sold_out">Sold Out Announcements</TabsTrigger>
                <TabsTrigger value="widgets">
                  Live Status Widgets ({1 + bundle.widgetTemplates.length})
                </TabsTrigger>
              </TabsList>

              {listings.length > 0 && (
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground shrink-0">Preview Vehicle:</Label>
                  <Select value={sampleCar.id} onValueChange={setSelectedCarId}>
                    <SelectTrigger className="h-8 w-56 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {listings.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name} (#{item.id})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Section 1: In Stock Announcements */}
            <TabsContent value="in_stock">
              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>In Stock Drop Template</CardTitle>
                    <CardDescription>
                      Applied to newly discovered vehicles and manual in-stock alerts.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <AnnouncementEditorForm
                      mode="in_stock"
                      value={bundle.announcements.inStock}
                      recentEmojis={bundle.recentEmojis}
                      onRecordRecentEmoji={recordRecentEmoji}
                      onChange={(next) =>
                        setBundle((prev) => ({
                          ...prev,
                          announcements: { ...prev.announcements, inStock: next },
                        }))
                      }
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Live Discord Preview — In Stock</CardTitle>
                    <CardDescription>
                      Reflects current listing presentation overrides, custom emojis, and R2 media URLs.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <AnnouncementPreviewCard
                      mode="in_stock"
                      template={bundle.announcements.inStock}
                      listing={sampleCar}
                    />
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Section 2: Sold Out Announcements */}
            <TabsContent value="sold_out">
              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Sold Out Update Template</CardTitle>
                    <CardDescription>
                      Applied automatically or manually when editing an already-deployed drop message after stock sells out.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <AnnouncementEditorForm
                      mode="sold_out"
                      value={bundle.announcements.soldOut}
                      recentEmojis={bundle.recentEmojis}
                      onRecordRecentEmoji={recordRecentEmoji}
                      onChange={(next) =>
                        setBundle((prev) => ({
                          ...prev,
                          announcements: { ...prev.announcements, soldOut: next },
                        }))
                      }
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Live Discord Preview — Sold Out</CardTitle>
                    <CardDescription>
                      Never re-pings roles when patching an existing Discord message in-place.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <AnnouncementPreviewCard
                      mode="sold_out"
                      template={bundle.announcements.soldOut}
                      listing={sampleCar}
                    />
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Section 3: Live Status Widgets */}
            <TabsContent value="widgets">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center gap-2.5">
                  <Label className="text-xs text-muted-foreground">Editing Template:</Label>
                  <Select value={selectedWidgetTplId} onValueChange={setSelectedWidgetTplId}>
                    <SelectTrigger className="h-8 w-64 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Default Global Widget</SelectItem>
                      {bundle.widgetTemplates.map((tpl) => (
                        <SelectItem key={tpl.id} value={tpl.id}>
                          {tpl.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={addCustomWidgetPreset}>
                    <Plus className="h-3.5 w-3.5" />
                    Add Preset
                  </Button>
                  {selectedWidgetTplId !== "default" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteCustomWidgetPreset(selectedWidgetTplId)}
                      className="text-red-400 hover:bg-red-950/40 hover:text-red-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete Preset
                    </Button>
                  )}
                </div>

                <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
                  <Switch
                    checked={refreshWidgetsOnSave}
                    onCheckedChange={setRefreshWidgetsOnSave}
                  />
                  <span>Refresh live widgets on Save</span>
                </label>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>
                      {selectedWidgetTplId === "default"
                        ? "Default Status Widget Template"
                        : activeWidgetTpl.name}
                    </CardTitle>
                    <CardDescription>
                      Customize colors, labels, custom emojis, featured Slot 3 thumbnail, feature ordering, and buttons.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <WidgetTemplateEditor
                      value={activeWidgetTpl}
                      onChange={updateActiveWidgetTpl}
                      recentEmojis={bundle.recentEmojis}
                      onRecordRecentEmoji={recordRecentEmoji}
                      showTemplateName={selectedWidgetTplId !== "default"}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Live Widget Discord Preview</CardTitle>
                    <CardDescription>
                      Includes full Discord character/field limit checks before applying changes.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <WidgetPreviewCard
                      template={activeWidgetTpl || DEFAULT_WIDGET_TEMPLATE}
                      listings={listings}
                      monitorStatus={overview?.monitorStatus || null}
                    />
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* Update Already-Deployed Messages Dialog */}
      <Dialog open={bulkModalOpen} onOpenChange={setBulkModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Update Deployed Discord Embeds</DialogTitle>
            <DialogDescription>
              Re-render already-published drop announcements in-place with your saved templates, R2
              images, and metadata overrides. Never creates new messages and never pings roles.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Update Scope</Label>
              <Select
                value={bulkScope}
                onValueChange={(v) => setBulkScope(v === "listing" ? "listing" : "bulk")}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bulk">All Deployed Drop Embeds Across Connected Servers</SelectItem>
                  <SelectItem value="listing">Specific Vehicle Listing Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {bulkScope === "listing" && listings.length > 0 && (
              <div className="space-y-1.5">
                <Label>Select Listing</Label>
                <Select value={bulkListingId} onValueChange={setBulkListingId}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {listings.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name} (#{item.id}) — {item.isAvailable ? "In Stock" : "Sold Out"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {bulkResults && (
              <div className="space-y-2 rounded-lg border border-border bg-zinc-950 p-3 text-xs">
                <div className="flex flex-wrap items-center gap-2 font-semibold text-white">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span>
                    {bulkResults.updatedCount} updated &bull; {bulkResults.skippedCount} skipped
                    &bull; {bulkResults.failedCount} failed
                  </span>
                </div>
                {bulkResults.results.length > 0 && (
                  <div className="max-h-40 space-y-1 overflow-y-auto pr-1 thin-scrollbar">
                    {bulkResults.results.map((r, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between gap-2 rounded bg-zinc-900/70 px-2 py-1"
                      >
                        <span className="truncate font-mono text-[11px] text-zinc-200">
                          {r.listingName || r.listingId} ({r.guildId})
                        </span>
                        <Badge
                          variant={
                            r.ok ? "success" : r.skippedNotSent ? "secondary" : "destructive"
                          }
                        >
                          {r.ok ? "Updated" : r.skippedNotSent ? "Skipped" : r.error || "Failed"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkModalOpen(false)}>
              Close
            </Button>
            <Button
              disabled={
                bulkEditMutation.isPending ||
                (bulkScope === "listing" && !bulkListingId)
              }
              onClick={() => bulkEditMutation.mutate()}
            >
              {bulkEditMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Updating Embeds...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Run In-Place Update
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
