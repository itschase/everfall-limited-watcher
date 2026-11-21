import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Edit3,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  AnnouncementSectionKey,
  AnnouncementTemplate,
  apiFetch,
  DiscordEmojiRef,
  DispatchEditResponse,
  ListingItem,
  PresentationBundleResponse,
  PresentationConfigBundle,
  TemplateCustomSection,
  TemplateSectionCondition,
  TemplateVariableValues,
  WidgetTemplateConfig,
} from "@/lib/api";
import {
  CHECK_INTERVAL_LABEL,
  DEFAULT_PUBLIC_ORIGIN,
  STORE_CATEGORY_URL,
} from "../../../shared/appConfig";
import { resolveListingPresentation } from "../../../shared/features";
import {
  createDefaultPresentationConfig,
  DEFAULT_ANNOUNCEMENT_SECTION_ORDER,
  DEFAULT_IN_STOCK_TEMPLATE,
  DEFAULT_SOLD_OUT_TEMPLATE,
  DEFAULT_WIDGET_TEMPLATE,
  normalizeAnnouncementTemplate,
} from "../../../shared/presentation";
import { findUnsupportedVariables } from "../../../shared/variables";
import { useSession } from "@/features/auth/useAuthActions";
import { ADMIN_OVERVIEW_KEY, useAdminOverview } from "./useAdminOverview";
import { AppShell } from "@/components/layout/AppShell";
import {
  AnnouncementPreviewCard,
  WidgetPreviewCard,
} from "@/components/discord/DiscordMessagePreview";
import { EmojiPickerButton } from "@/components/discord/EmojiPicker";
import { VariablePicker } from "@/components/discord/VariablePicker";
import { FieldFocusHandler, WidgetTemplateEditor } from "@/components/discord/WidgetTemplateEditor";
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

const ANNOUNCEMENT_SECTION_LABELS: Record<
  AnnouncementSectionKey,
  { title: string; hint: string }
> = {
  header: { title: "Announcement Title", hint: "Title prefix, emoji & vehicle name" },
  status: { title: "Availability Line", hint: "Heading + status emoji + stock state" },
  features: { title: "Normalized Vehicle Features", hint: "Extracted or admin-edited spec badges" },
  description: { title: "Description Body", hint: "Full, short summary, or custom variable text" },
  trading_delivery: { title: "Trading & Delivery Rules", hint: "Visible store restrictions and delivery notes" },
  timestamps: { title: "Verification Timestamps", hint: "First detected, last verified, and sold-out times" },
  custom_sections: { title: "Conditional Custom Sections", hint: "Extra markdown blocks configured below" },
};

const ANNOUNCEMENT_CONDITIONS: Array<{ value: TemplateSectionCondition; label: string }> = [
  { value: "always", label: "Always Display" },
  { value: "in_stock_only", label: "Only When In Stock" },
  { value: "sold_out_only", label: "Only When Sold Out" },
  { value: "when_features_present", label: "Only When Features Present" },
  { value: "when_trading_present", label: "Only When Trading Rule Present" },
  { value: "when_delivery_present", label: "Only When Delivery Info Present" },
];

function AnnouncementEditorForm({
  mode,
  value,
  onChange,
  recentEmojis,
  onRecordRecentEmoji,
  onFieldFocus,
}: {
  mode: "in_stock" | "sold_out";
  value: AnnouncementTemplate;
  onChange: (next: AnnouncementTemplate) => void;
  recentEmojis: DiscordEmojiRef[];
  onRecordRecentEmoji: (emoji: DiscordEmojiRef) => void;
  onFieldFocus?: FieldFocusHandler;
}) {
  const defaultTpl = mode === "sold_out" ? DEFAULT_SOLD_OUT_TEMPLATE : DEFAULT_IN_STOCK_TEMPLATE;
  const normalized = normalizeAnnouncementTemplate(value, defaultTpl);

  const bindFocus = (label: string, apply: (nextValue: string) => void) => ({
    onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onFieldFocus?.(label, e.currentTarget, apply);
    },
  });

  const sectionOrder = normalized.sectionOrder || DEFAULT_ANNOUNCEMENT_SECTION_ORDER;
  const moveSectionKey = (key: AnnouncementSectionKey, dir: -1 | 1) => {
    const idx = sectionOrder.indexOf(key);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= sectionOrder.length) return;
    const copy = [...sectionOrder];
    const [item] = copy.splice(idx, 1);
    copy.splice(swapIdx, 0, item);
    onChange({ ...normalized, sectionOrder: copy });
  };

  const customSections = normalized.customSections || [];
  const addCustomSection = () => {
    if (customSections.length >= 8) return;
    onChange({
      ...normalized,
      customSections: [
        ...customSections,
        {
          id: `ann-${Date.now().toString(36)}`,
          title: "Release Details",
          content: "Catalog ID: `{vehicle_id}` • Checked {check_interval}",
          enabled: true,
          condition: "always",
        },
      ],
    });
  };
  const updateCustomSection = (id: string, patch: Partial<TemplateCustomSection>) => {
    onChange({
      ...normalized,
      customSections: customSections.map((cs) => (cs.id === id ? { ...cs, ...patch } : cs)),
    });
  };
  const removeCustomSection = (id: string) => {
    onChange({
      ...normalized,
      customSections: customSections.filter((cs) => cs.id !== id),
    });
  };

  const allTemplateText = [
    normalized.titlePrefix,
    normalized.availabilityHeading,
    normalized.statusLabel,
    normalized.customDescription,
    normalized.tradingLabel || "",
    normalized.deliveryLabel || "",
    normalized.firstDetectedLabel || "",
    normalized.lastVerifiedLabel || "",
    normalized.soldOutLabel || "",
    normalized.footerText,
    normalized.storeButtonLabel,
    normalized.customButtonUrl || "",
    normalized.secondaryButtonLabel || "",
    normalized.secondaryCustomButtonUrl || "",
    ...customSections.flatMap((cs) => [cs.title, cs.content]),
  ].join("\n");
  const varIssues = findUnsupportedVariables(allTemplateText, mode);

  return (
    <div className="space-y-4">
      {(varIssues.unknownTokens.length > 0 || varIssues.unsupportedForScope.length > 0) && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 p-3 text-xs text-amber-200">
          <div className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
            Unrecognized or Unsupported Variables
          </div>
          {varIssues.unknownTokens.length > 0 && (
            <p className="mt-1 text-amber-100/90">
              Unknown tokens (stripped before Discord send):{" "}
              <code className="font-mono">{varIssues.unknownTokens.join(", ")}</code>
            </p>
          )}
          {varIssues.unsupportedForScope.length > 0 && (
            <p className="mt-1 text-amber-100/90">
              Widget-only variables used in announcement:{" "}
              <code className="font-mono">{varIssues.unsupportedForScope.join(", ")}</code>
            </p>
          )}
        </div>
      )}

      <div className="grid gap-4 @xl/main:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Accent Color (Hex)</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={/^#[0-9A-F]{6}$/i.test(normalized.accentColor) ? normalized.accentColor : "#F59E0B"}
              onChange={(e) =>
                onChange({ ...normalized, accentColor: e.target.value.toUpperCase() })
              }
              className="h-9 w-10 cursor-pointer rounded border border-border bg-zinc-950 p-0.5"
            />
            <Input
              value={normalized.accentColor}
              maxLength={7}
              onChange={(e) =>
                onChange({ ...normalized, accentColor: e.target.value.toUpperCase() })
              }
              className="h-9 font-mono text-xs"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Title Prefix</Label>
          <Input
            value={normalized.titlePrefix}
            maxLength={120}
            placeholder="Supports {vehicle_name}, {vehicle_id}..."
            onChange={(e) => onChange({ ...normalized, titlePrefix: e.target.value })}
            {...bindFocus("Title Prefix", (next) =>
              onChange({ ...normalized, titlePrefix: next })
            )}
          />
        </div>
      </div>

      <div className="grid gap-4 @xl/main:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Title Emoji</Label>
          <EmojiPickerButton
            label={`${mode} Title Emoji`}
            value={normalized.titleEmoji}
            recentEmojis={recentEmojis}
            onSelectRecordRecent={onRecordRecentEmoji}
            onChange={(titleEmoji) => onChange({ ...normalized, titleEmoji })}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Availability Heading</Label>
          <Input
            value={normalized.availabilityHeading}
            maxLength={60}
            onChange={(e) => onChange({ ...normalized, availabilityHeading: e.target.value })}
            {...bindFocus("Availability Heading", (next) =>
              onChange({ ...normalized, availabilityHeading: next })
            )}
          />
        </div>
      </div>

      <div className="grid gap-4 @xl/main:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Status Badge Label</Label>
          <Input
            value={normalized.statusLabel}
            maxLength={60}
            onChange={(e) => onChange({ ...normalized, statusLabel: e.target.value })}
            {...bindFocus("Status Badge Label", (next) =>
              onChange({ ...normalized, statusLabel: next })
            )}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Status Emoji</Label>
          <EmojiPickerButton
            label={`${mode} Status Emoji`}
            value={normalized.statusEmoji}
            recentEmojis={recentEmojis}
            onSelectRecordRecent={onRecordRecentEmoji}
            onChange={(statusEmoji) => onChange({ ...normalized, statusEmoji })}
          />
        </div>
      </div>

      <div className="grid gap-4 @xl/main:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Description Body Mode</Label>
          <Select
            value={normalized.descriptionMode}
            onValueChange={(v) =>
              onChange({
                ...normalized,
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
              <SelectItem value="custom">Custom Markdown + Variables</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Feature Display Style</Label>
          <Select
            value={normalized.featureStyle}
            onValueChange={(v) =>
              onChange({
                ...normalized,
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

      {normalized.descriptionMode === "custom" && (
        <div className="space-y-1.5">
          <Label>Custom Body Format</Label>
          <textarea
            rows={4}
            value={normalized.customDescription}
            maxLength={2000}
            placeholder="Write markdown and click variables in Dynamic Variables to insert at cursor..."
            onChange={(e) => onChange({ ...normalized, customDescription: e.target.value })}
            {...bindFocus("Custom Body Format", (next) =>
              onChange({ ...normalized, customDescription: next })
            )}
            className="w-full rounded-lg border border-border bg-zinc-950 p-3 font-mono text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-[11px] text-muted-foreground">
            Empty variables automatically collapse blank label lines cleanly when data is missing.
          </p>
        </div>
      )}

      {/* Gallery & Image Slot */}
      <div className="grid gap-4 @xl/main:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Gallery Mode</Label>
          <Select
            value={normalized.galleryMode}
            onValueChange={(v) =>
              onChange({
                ...normalized,
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

        {normalized.galleryMode === "custom_slot" && (
          <div className="space-y-1.5">
            <Label>Target Image Slot</Label>
            <Select
              value={String(normalized.primaryImageSlot)}
              onValueChange={(v) => onChange({ ...normalized, primaryImageSlot: Number(v) })}
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

      {/* Store & Optional Secondary Action Buttons */}
      <div className="space-y-3 rounded-lg border border-border bg-zinc-950/60 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-white">Include Primary Link Button</p>
            <p className="text-xs text-muted-foreground">
              Adds an interactive action button below the vehicle gallery.
            </p>
          </div>
          <Switch
            checked={normalized.showStoreButton}
            onCheckedChange={(checked) => onChange({ ...normalized, showStoreButton: checked })}
          />
        </div>

        {normalized.showStoreButton && (
          <div className="space-y-3 border-t border-border pt-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Button Label</Label>
                <Input
                  value={normalized.storeButtonLabel}
                  maxLength={80}
                  onChange={(e) => onChange({ ...normalized, storeButtonLabel: e.target.value })}
                  {...bindFocus("Primary Button Label", (next) =>
                    onChange({ ...normalized, storeButtonLabel: next })
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Button Emoji</Label>
                <EmojiPickerButton
                  label={`${mode} Button Emoji`}
                  value={normalized.storeButtonEmoji}
                  recentEmojis={recentEmojis}
                  onSelectRecordRecent={onRecordRecentEmoji}
                  onChange={(storeButtonEmoji) => onChange({ ...normalized, storeButtonEmoji })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Destination URL</Label>
                <Select
                  value={normalized.storeButtonUrlMode}
                  onValueChange={(v) =>
                    onChange({
                      ...normalized,
                      storeButtonUrlMode:
                        v === "category" ||
                        v === "store_home" ||
                        v === "website" ||
                        v === "custom"
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
                    <SelectItem value="custom">Custom URL / Variable</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {normalized.storeButtonUrlMode === "custom" && (
              <div className="space-y-1.5">
                <Label>Custom Primary Button URL</Label>
                <Input
                  value={normalized.customButtonUrl || ""}
                  maxLength={300}
                  placeholder="https://... or {listing_url}"
                  onChange={(e) => onChange({ ...normalized, customButtonUrl: e.target.value })}
                  {...bindFocus("Custom Primary Button URL", (next) =>
                    onChange({ ...normalized, customButtonUrl: next })
                  )}
                  className="font-mono text-xs"
                />
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <div>
            <p className="text-sm font-medium text-white">Include Secondary Link Button</p>
            <p className="text-xs text-muted-foreground">
              Optional second button (e.g., Live Archive Portal or category shortcut).
            </p>
          </div>
          <Switch
            checked={Boolean(normalized.showSecondaryButton)}
            onCheckedChange={(checked) =>
              onChange({ ...normalized, showSecondaryButton: checked })
            }
          />
        </div>

        {normalized.showSecondaryButton && (
          <div className="space-y-3 border-t border-border pt-3">
            <div className="grid gap-3 @xl/main:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Secondary Button Label</Label>
                <Input
                  value={normalized.secondaryButtonLabel || ""}
                  maxLength={80}
                  onChange={(e) =>
                    onChange({ ...normalized, secondaryButtonLabel: e.target.value })
                  }
                  {...bindFocus("Secondary Button Label", (next) =>
                    onChange({ ...normalized, secondaryButtonLabel: next })
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Secondary Destination URL</Label>
                <Select
                  value={normalized.secondaryButtonUrlMode || "website"}
                  onValueChange={(v) =>
                    onChange({
                      ...normalized,
                      secondaryButtonUrlMode:
                        v === "listing" ||
                        v === "category" ||
                        v === "store_home" ||
                        v === "custom"
                          ? v
                          : "website",
                    })
                  }
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="website">Watcher Portal</SelectItem>
                    <SelectItem value="listing">Package Listing URL</SelectItem>
                    <SelectItem value="category">Limited Cars Category</SelectItem>
                    <SelectItem value="store_home">Everfall Store Home</SelectItem>
                    <SelectItem value="custom">Custom URL / Variable</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {normalized.secondaryButtonUrlMode === "custom" && (
              <div className="space-y-1.5">
                <Label>Custom Secondary Button URL</Label>
                <Input
                  value={normalized.secondaryCustomButtonUrl || ""}
                  maxLength={300}
                  placeholder="https://... or {website_url}"
                  onChange={(e) =>
                    onChange({ ...normalized, secondaryCustomButtonUrl: e.target.value })
                  }
                  {...bindFocus("Custom Secondary Button URL", (next) =>
                    onChange({ ...normalized, secondaryCustomButtonUrl: next })
                  )}
                  className="font-mono text-xs"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Section Ordering & Conditional Custom Sections */}
      <div className="space-y-3 rounded-lg border border-border bg-zinc-950/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-white">Section Order &amp; Custom Blocks</p>
            <p className="text-xs text-muted-foreground">
              Reorder embed sections or add conditional markdown sections with variables.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={customSections.length >= 8}
            onClick={addCustomSection}
            className="h-7 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Section
          </Button>
        </div>

        <div className="space-y-1.5">
          {sectionOrder.map((key, idx) => {
            const info = ANNOUNCEMENT_SECTION_LABELS[key];
            return (
              <div
                key={key}
                className="flex items-center justify-between gap-2 rounded-md border border-border bg-zinc-900/70 px-2.5 py-1.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-zinc-200">{info.title}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{info.hint}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={idx === 0}
                    onClick={() => moveSectionKey(key, -1)}
                    className="h-7 w-7"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={idx === sectionOrder.length - 1}
                    onClick={() => moveSectionKey(key, 1)}
                    className="h-7 w-7"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {customSections.length > 0 && (
          <div className="space-y-3 border-t border-border pt-3">
            {customSections.map((cs, idx) => (
              <div
                key={cs.id}
                className="space-y-2.5 rounded-lg border border-border bg-zinc-900/60 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={cs.enabled}
                      onCheckedChange={(checked) => updateCustomSection(cs.id, { enabled: checked })}
                    />
                    <span className="text-xs font-semibold text-white">
                      Custom Section #{idx + 1}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeCustomSection(cs.id)}
                    className="h-7 w-7 text-red-400 hover:bg-red-950/40 hover:text-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="grid gap-2.5 @xl/main:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-[11px]">Section Heading</Label>
                    <Input
                      value={cs.title}
                      maxLength={80}
                      onChange={(e) => updateCustomSection(cs.id, { title: e.target.value })}
                      {...bindFocus(`Custom Section #${idx + 1} Heading`, (next) =>
                        updateCustomSection(cs.id, { title: next })
                      )}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Display Condition</Label>
                    <Select
                      value={cs.condition}
                      onValueChange={(v) =>
                        updateCustomSection(cs.id, { condition: v as TemplateSectionCondition })
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ANNOUNCEMENT_CONDITIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px]">Section Body</Label>
                  <textarea
                    rows={2}
                    value={cs.content}
                    maxLength={1000}
                    onChange={(e) => updateCustomSection(cs.id, { content: e.target.value })}
                    {...bindFocus(`Custom Section #${idx + 1} Body`, (next) =>
                      updateCustomSection(cs.id, { content: next })
                    )}
                    className="w-full rounded-md border border-border bg-zinc-950 p-2 font-mono text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer & Section Toggles + Editable Labels */}
      <div className="grid gap-4 @xl/main:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Footer Attribution</Label>
          <Input
            value={normalized.footerText}
            maxLength={200}
            onChange={(e) => onChange({ ...normalized, footerText: e.target.value })}
            {...bindFocus("Footer Attribution", (next) =>
              onChange({ ...normalized, footerText: next })
            )}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Footer Emoji</Label>
          <EmojiPickerButton
            label={`${mode} Footer Emoji`}
            value={normalized.footerEmoji}
            recentEmojis={recentEmojis}
            onSelectRecordRecent={onRecordRecentEmoji}
            onChange={(footerEmoji) => onChange({ ...normalized, footerEmoji })}
          />
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-border bg-zinc-950/60 p-4 text-xs">
        <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-2.5">
          <span className="font-medium text-zinc-200">Show Normalized Vehicle Features</span>
          <Switch
            checked={Boolean(normalized.showFeatures)}
            onCheckedChange={(checked) => onChange({ ...normalized, showFeatures: checked })}
          />
        </div>

        {(
          [
            {
              toggle: "showTradingInfo",
              labelKey: "tradingLabel",
              title: "Show Trading Restrictions",
              fallbackLabel: "Trading",
            },
            {
              toggle: "showDeliveryInfo",
              labelKey: "deliveryLabel",
              title: "Show Garage Delivery Info",
              fallbackLabel: "Delivery",
            },
            {
              toggle: "showDetectionTime",
              labelKey: "firstDetectedLabel",
              title: "Show First Detected Timestamp",
              fallbackLabel: "First Detected",
            },
            {
              toggle: "showLastVerified",
              labelKey: "lastVerifiedLabel",
              title: "Show Last Verified Timestamp",
              fallbackLabel: "Last Verified",
            },
            ...(mode === "sold_out"
              ? [
                  {
                    toggle: "showSoldOutTime" as const,
                    labelKey: "soldOutLabel" as const,
                    title: "Show Confirmed Sold Out Timestamp",
                    fallbackLabel: "Confirmed Sold Out",
                  },
                ]
              : []),
          ] as Array<{
            toggle:
              | "showTradingInfo"
              | "showDeliveryInfo"
              | "showDetectionTime"
              | "showLastVerified"
              | "showSoldOutTime";
            labelKey:
              | "tradingLabel"
              | "deliveryLabel"
              | "firstDetectedLabel"
              | "lastVerifiedLabel"
              | "soldOutLabel";
            title: string;
            fallbackLabel: string;
          }>
        ).map((item) => {
          const active = Boolean(normalized[item.toggle]);
          return (
            <div
              key={item.toggle}
              className="space-y-2 border-b border-border/60 pb-2.5 last:border-b-0 last:pb-0"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-zinc-200">{item.title}</span>
                <Switch
                  checked={active}
                  onCheckedChange={(checked) =>
                    onChange({ ...normalized, [item.toggle]: checked })
                  }
                />
              </div>
              {active && (
                <Input
                  value={String(normalized[item.labelKey] || item.fallbackLabel)}
                  maxLength={50}
                  placeholder={item.fallbackLabel}
                  onChange={(e) =>
                    onChange({ ...normalized, [item.labelKey]: e.target.value })
                  }
                  {...bindFocus(`${item.fallbackLabel} Label`, (next) =>
                    onChange({ ...normalized, [item.labelKey]: next })
                  )}
                  className="h-8 text-xs"
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange(normalizeAnnouncementTemplate(defaultTpl, defaultTpl))}
          className="text-xs text-muted-foreground hover:text-white"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset {mode === "in_stock" ? "In Stock" : "Sold Out"} Template to Defaults
        </Button>
      </div>
    </div>
  );
}

export function AdminEmbedsPage() {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
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
  const [simulateMissingData, setSimulateMissingData] = useState(false);
  const [selectedWidgetTplId, setSelectedWidgetTplId] = useState<string>("default");
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkScope, setBulkScope] = useState<"bulk" | "listing">("bulk");
  const [bulkListingId, setBulkListingId] = useState<string>("");
  const [bulkResults, setBulkResults] = useState<DispatchEditResponse | null>(null);
  const [refreshWidgetsOnSave, setRefreshWidgetsOnSave] = useState(true);

  const focusedFieldRef = useRef<{
    label: string;
    element: HTMLInputElement | HTMLTextAreaElement;
    apply: (nextValue: string) => void;
  } | null>(null);
  const [activeFieldLabel, setActiveFieldLabel] = useState<string | null>(null);

  const handleFieldFocus: FieldFocusHandler = (label, element, apply) => {
    focusedFieldRef.current = { label, element, apply };
    setActiveFieldLabel(label);
  };

  const handleInsertVariable = (token: string) => {
    const active = focusedFieldRef.current;
    if (!active) return;
    const { element, apply } = active;
    const current = element.value ?? "";
    const start = typeof element.selectionStart === "number" ? element.selectionStart : current.length;
    const end = typeof element.selectionEnd === "number" ? element.selectionEnd : current.length;
    const nextValue = `${current.slice(0, start)}${token}${current.slice(end)}`;
    apply(nextValue);

    const nextCaret = start + token.length;
    if (typeof requestAnimationFrame !== "undefined") {
      requestAnimationFrame(() => {
        try {
          element.focus();
          element.setSelectionRange(nextCaret, nextCaret);
        } catch {
          // ignore if field was unmounted
        }
      });
    }
  };

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

  const baseSampleCar: ListingItem =
    listings.find((l) => l.id === selectedCarId) ||
    listings[0] || {
      id: "7815819",
      name: "Seraph GTS",
      description:
        "This vehicle is quantity-limited; get it while it is still available. It comes with a custom sound and 17+ customization options. Can only be traded with other limiteds. Automatically delivered to your garage.",
      url: "https://store.everfallcommunity.com/package/7815819",
      images: [],
      isAvailable: true,
      detectedAt: Date.now() - 3600_000,
      lastVerifiedAt: Date.now(),
      soldOutAt: null,
      lastHttpStatus: 200,
      readiness: "ready",
    };

  const sampleCar: ListingItem = simulateMissingData
    ? {
        ...baseSampleCar,
        description: "",
        images: [],
        soldOutAt: null,
        presentation: undefined,
      }
    : baseSampleCar;

  const sampleVariableValues: TemplateVariableValues = useMemo(() => {
    const pres =
      sampleCar.presentation ||
      resolveListingPresentation({
        id: sampleCar.id,
        name: sampleCar.name,
        description: sampleCar.description,
        url: sampleCar.url,
        images: sampleCar.images,
      });
    const activeListings = listings.filter((l) => l.isAvailable);
    const mon = overview?.monitorStatus;
    return {
      vehicle_name: pres.effective.name,
      vehicle_id: sampleCar.id,
      description: pres.effective.fullDescription,
      short_description: pres.effective.shortDescription,
      features: pres.effective.features.map((f) => f.label).join(" • "),
      custom_options: pres.source.extracted.customOptionsLabel || "",
      custom_sound: pres.source.extracted.customSound ? "Custom Sound" : "",
      trading: pres.effective.tradingRestriction || "",
      delivery: pres.effective.deliveryInfo || "",
      status: activeTab === "sold_out" ? bundle.announcements.soldOut.statusLabel : bundle.announcements.inStock.statusLabel,
      status_emoji: activeTab === "sold_out" ? "⛔" : "🟢",
      first_detected: `<t:${Math.floor((sampleCar.detectedAt || Date.now()) / 1000)}:R>`,
      last_verified: `<t:${Math.floor((sampleCar.lastVerifiedAt || Date.now()) / 1000)}:f>`,
      sold_out_at: sampleCar.soldOutAt ? `<t:${Math.floor(sampleCar.soldOutAt / 1000)}:R>` : "",
      store_url: STORE_CATEGORY_URL,
      listing_url: pres.source.url,
      website_url: typeof window !== "undefined" ? window.location.origin : "",
      check_interval: CHECK_INTERVAL_LABEL,
      last_store_check: mon?.checkedAt ? `<t:${Math.floor(mon.checkedAt / 1000)}:R>` : "just now",
      last_successful_check: mon?.lastSuccessAt
        ? `<t:${Math.floor(mon.lastSuccessAt / 1000)}:R>`
        : "just now",
      monitor_state: mon?.authoritative === false ? "Blocked (Using History)" : "Verified",
      recent_releases: `${pres.effective.name} — ${sampleCar.isAvailable ? "In Stock" : "Sold Out"}`,
      active_count: String(activeListings.length),
      last_widget_update: "just now",
    };
  }, [sampleCar, listings, overview?.monitorStatus, activeTab, bundle.announcements]);

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
          ? `Saved appearance (${res.widgetRefresh.refreshed} widget(s) updated, ${res.widgetRefresh.skipped} unchanged).`
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

  const variableScope = activeTab === "widgets" ? "widget" : activeTab;

  return (
    <AppShell
      requireAdmin
      title="Embed & Widget Presentation"
      description="Independently customize In Stock alerts, Sold Out updates, and Live Status Widget templates with dynamic variables, section ordering, and live Discord previews."
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
        <div className="grid gap-6 @4xl/main:grid-cols-2">
          <Skeleton className="h-[520px] w-full rounded-xl" />
          <Skeleton className="h-[520px] w-full rounded-xl" />
        </div>
      ) : (
        <div className="space-y-6">
          <Tabs
            value={activeTab}
            onValueChange={(v) => {
              setActiveTab(v as "in_stock" | "sold_out" | "widgets");
              focusedFieldRef.current = null;
              setActiveFieldLabel(null);
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <TabsList className="h-auto flex-wrap">
                <TabsTrigger value="in_stock">In Stock Announcements</TabsTrigger>
                <TabsTrigger value="sold_out">Sold Out Announcements</TabsTrigger>
                <TabsTrigger value="widgets">
                  Live Status Widgets ({1 + bundle.widgetTemplates.length})
                </TabsTrigger>
              </TabsList>

              <div className="flex flex-wrap items-center gap-3">
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-zinc-300">
                  <Switch
                    checked={simulateMissingData}
                    onCheckedChange={setSimulateMissingData}
                  />
                  <span>Simulate Missing Data</span>
                </label>

                {listings.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Label className="shrink-0 text-xs text-muted-foreground">Preview Vehicle:</Label>
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
            </div>

            {/* Section 1: In Stock Announcements */}
            <TabsContent value="in_stock">
              <div className="grid items-start gap-6 @4xl/main:grid-cols-2">
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
                      onFieldFocus={handleFieldFocus}
                      onChange={(next) =>
                        setBundle((prev) => ({
                          ...prev,
                          announcements: { ...prev.announcements, inStock: next },
                        }))
                      }
                    />
                  </CardContent>
                </Card>

                <div className="space-y-4 @4xl/main:sticky @4xl/main:top-6">
                  <VariablePicker
                    scope={variableScope}
                    activeFieldLabel={activeFieldLabel}
                    hasActiveField={Boolean(activeFieldLabel)}
                    sampleValues={sampleVariableValues}
                    onInsertVariable={handleInsertVariable}
                  />

                  <Card>
                    <CardHeader>
                      <CardTitle>Live Discord Preview — In Stock</CardTitle>
                      <CardDescription>
                        Reflects dynamic variable substitution, section ordering, custom emojis, and R2 media URLs.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <AnnouncementPreviewCard
                        mode="in_stock"
                        template={bundle.announcements.inStock}
                        listing={sampleCar}
                        monitorStatus={overview?.monitorStatus || null}
                      />
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>

            {/* Section 2: Sold Out Announcements */}
            <TabsContent value="sold_out">
              <div className="grid items-start gap-6 @4xl/main:grid-cols-2">
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
                      onFieldFocus={handleFieldFocus}
                      onChange={(next) =>
                        setBundle((prev) => ({
                          ...prev,
                          announcements: { ...prev.announcements, soldOut: next },
                        }))
                      }
                    />
                  </CardContent>
                </Card>

                <div className="space-y-4 @4xl/main:sticky @4xl/main:top-6">
                  <VariablePicker
                    scope={variableScope}
                    activeFieldLabel={activeFieldLabel}
                    hasActiveField={Boolean(activeFieldLabel)}
                    sampleValues={sampleVariableValues}
                    onInsertVariable={handleInsertVariable}
                  />

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
                        monitorStatus={overview?.monitorStatus || null}
                      />
                    </CardContent>
                  </Card>
                </div>
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
                  <span>Sync changed live widgets on Save</span>
                </label>
              </div>

              <div className="grid items-start gap-6 @4xl/main:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>
                      {selectedWidgetTplId === "default"
                        ? "Default Status Widget Template"
                        : activeWidgetTpl.name}
                    </CardTitle>
                    <CardDescription>
                      Customize independent timestamps, colors, labels, custom emojis, featured Slot 3 thumbnail, section order, and dynamic variables.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <WidgetTemplateEditor
                      value={activeWidgetTpl}
                      onChange={updateActiveWidgetTpl}
                      recentEmojis={bundle.recentEmojis}
                      onRecordRecentEmoji={recordRecentEmoji}
                      onFieldFocus={handleFieldFocus}
                      showTemplateName={selectedWidgetTplId !== "default"}
                    />
                  </CardContent>
                </Card>

                <div className="space-y-4 @4xl/main:sticky @4xl/main:top-6">
                  <VariablePicker
                    scope="widget"
                    activeFieldLabel={activeFieldLabel}
                    hasActiveField={Boolean(activeFieldLabel)}
                    sampleValues={sampleVariableValues}
                    onInsertVariable={handleInsertVariable}
                  />

                  <Card>
                    <CardHeader>
                      <CardTitle>Live Widget Discord Preview</CardTitle>
                      <CardDescription>
                        Matches exact Discord timestamp flags, custom sections, and character/field limit checks.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <WidgetPreviewCard
                        template={activeWidgetTpl || DEFAULT_WIDGET_TEMPLATE}
                        listings={simulateMissingData ? [] : listings}
                        monitorStatus={overview?.monitorStatus || null}
                        portalOrigin={session?.publicOrigin || DEFAULT_PUBLIC_ORIGIN}
                      />
                    </CardContent>
                  </Card>
                </div>
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
