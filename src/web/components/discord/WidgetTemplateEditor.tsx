import { AlertTriangle, ArrowDown, ArrowUp, Plus, RotateCcw, Trash2 } from "lucide-react";
import {
  DiscordEmojiRef,
  TemplateCustomSection,
  TemplateSectionCondition,
  WidgetSectionKey,
  WidgetTemplateConfig,
} from "@/lib/api";
import { SUPPORTED_FEATURE_TEMPLATES } from "../../../shared/features";
import {
  DEFAULT_WIDGET_SECTION_ORDER,
  DEFAULT_WIDGET_TEMPLATE,
  normalizeWidgetTemplateConfig,
} from "../../../shared/presentation";
import { findUnsupportedVariables } from "../../../shared/variables";
import { EmojiPickerButton } from "./EmojiPicker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

const WIDGET_SECTION_LABELS: Record<WidgetSectionKey, { title: string; hint: string }> = {
  subtitle: { title: "Subtitle Line", hint: "Main header description beneath the embed title" },
  intro: { title: "Optional Intro Note", hint: "Custom announcement or server note" },
  timestamps: { title: "Timestamps & Monitor Status", hint: "Configurable monitoring/update lines" },
  stale_warning: { title: "Stale / Blocked Notice", hint: "Shown only when storefront verification fails" },
  custom_sections: { title: "Custom Sections", hint: "Conditional blocks placed inside description" },
};

const WIDGET_CONDITION_OPTIONS: Array<{ value: TemplateSectionCondition; label: string }> = [
  { value: "always", label: "Always Display" },
  { value: "when_in_stock_any", label: "Only When Active Stock Exists" },
  { value: "when_all_sold_out", label: "Only When All Listed Sold Out" },
  { value: "when_features_present", label: "When Featured Car Has Specs" },
  { value: "when_trading_present", label: "When Featured Car Has Trading Rule" },
  { value: "when_delivery_present", label: "When Featured Car Has Delivery Info" },
];

export type FieldFocusHandler = (
  label: string,
  el: HTMLInputElement | HTMLTextAreaElement,
  apply: (nextValue: string) => void
) => void;

export function WidgetTemplateEditor({
  value,
  onChange,
  recentEmojis,
  onRecordRecentEmoji,
  showTemplateName = false,
  onFieldFocus,
}: {
  value: WidgetTemplateConfig;
  onChange: (next: WidgetTemplateConfig) => void;
  recentEmojis?: DiscordEmojiRef[];
  onRecordRecentEmoji?: (emoji: DiscordEmojiRef) => void;
  showTemplateName?: boolean;
  onFieldFocus?: FieldFocusHandler;
}) {
  const normalized = normalizeWidgetTemplateConfig(value, DEFAULT_WIDGET_TEMPLATE);

  const orderedKeys =
    normalized.featureOrder && normalized.featureOrder.length > 0
      ? [
          ...normalized.featureOrder,
          ...SUPPORTED_FEATURE_TEMPLATES.map((t) => t.key).filter(
            (k) => !normalized.featureOrder.includes(k)
          ),
        ]
      : SUPPORTED_FEATURE_TEMPLATES.map((t) => t.key);

  const moveFeatureKey = (key: string, dir: -1 | 1) => {
    const idx = orderedKeys.indexOf(key);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= orderedKeys.length) return;
    const copy = [...orderedKeys];
    const [item] = copy.splice(idx, 1);
    copy.splice(swapIdx, 0, item);
    onChange({ ...normalized, featureOrder: copy });
  };

  const toggleHiddenKey = (key: string) => {
    const hidden = new Set(normalized.hiddenFeatureKeys || []);
    if (hidden.has(key)) hidden.delete(key);
    else hidden.add(key);
    onChange({ ...normalized, hiddenFeatureKeys: [...hidden] });
  };

  const sectionOrder = normalized.sectionOrder || DEFAULT_WIDGET_SECTION_ORDER;
  const moveSectionKey = (key: WidgetSectionKey, dir: -1 | 1) => {
    const idx = sectionOrder.indexOf(key);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= sectionOrder.length) return;
    const copy = [...sectionOrder];
    const [item] = copy.splice(idx, 1);
    copy.splice(swapIdx, 0, item);
    onChange({ ...normalized, sectionOrder: copy });
  };

  const customSections = normalized.customSections || [];
  const updateCustomSection = (id: string, patch: Partial<TemplateCustomSection>) => {
    onChange({
      ...normalized,
      customSections: customSections.map((cs) => (cs.id === id ? { ...cs, ...patch } : cs)),
    });
  };
  const addCustomSection = () => {
    if (customSections.length >= 8) return;
    const id = `sec-${Date.now().toString(36)}`;
    onChange({
      ...normalized,
      customSections: [
        ...customSections,
        {
          id,
          title: "Monitor Schedule",
          content: "Checked automatically {check_interval}. Active now: {active_count}.",
          enabled: true,
          condition: "always",
          inline: false,
        },
      ],
    });
  };
  const removeCustomSection = (id: string) => {
    onChange({
      ...normalized,
      customSections: customSections.filter((cs) => cs.id !== id),
    });
  };

  const bindFocus = (label: string, apply: (nextValue: string) => void) => ({
    onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onFieldFocus?.(label, e.currentTarget, apply);
    },
  });

  const updateTimestampFlags = (patch: Partial<WidgetTemplateConfig>) => {
    const merged = { ...normalized, ...patch };
    const anyTextVisible = Boolean(
      merged.showLastStoreCheck ||
        merged.showLastVerifiedStock ||
        merged.showMonitorState ||
        merged.showLastUpdated
    );
    onChange({ ...merged, showTimestamps: anyTextVisible });
  };

  // Validate template variables across editable text fields
  const combinedTexts = [
    normalized.title,
    normalized.subtitle,
    normalized.introMessage,
    normalized.activeSummaryHeading,
    normalized.inStockLabel,
    normalized.soldOutLabel,
    normalized.lastStoreCheckLabel || "",
    normalized.lastVerifiedStockLabel || "",
    normalized.monitorStateLabel || "",
    normalized.lastUpdatedLabel || "",
    normalized.staleWarningText,
    normalized.emptyStateMessage,
    normalized.footerText,
    normalized.viewButtonLabel,
    normalized.websiteButtonLabel,
    normalized.storeButtonLabel,
    normalized.customStoreButtonUrl || "",
    ...customSections.flatMap((c) => [c.title, c.content]),
  ].join("\n");
  const varIssues = findUnsupportedVariables(combinedTexts, "widget");

  return (
    <div className="space-y-5">
      {(varIssues.unknownTokens.length > 0 || varIssues.unsupportedForScope.length > 0) && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 p-3 text-xs text-amber-200">
          <div className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
            Unrecognized or Unsupported Variables
          </div>
          {varIssues.unknownTokens.length > 0 && (
            <p className="mt-1 text-amber-100/90">
              Unknown tokens (will be stripped when sent):{" "}
              <code className="font-mono">{varIssues.unknownTokens.join(", ")}</code>
            </p>
          )}
          {varIssues.unsupportedForScope.length > 0 && (
            <p className="mt-1 text-amber-100/90">
              Outside widget scope:{" "}
              <code className="font-mono">{varIssues.unsupportedForScope.join(", ")}</code>
            </p>
          )}
        </div>
      )}

      {showTemplateName && (
        <div className="space-y-1.5">
          <Label htmlFor="wt-name">Template Preset Name</Label>
          <Input
            id="wt-name"
            value={normalized.name}
            maxLength={80}
            onChange={(e) => onChange({ ...normalized, name: e.target.value })}
          />
        </div>
      )}

      {/* Title & Subtitle */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="wt-title">Widget Header Title</Label>
          <Input
            id="wt-title"
            value={normalized.title}
            maxLength={200}
            onChange={(e) => onChange({ ...normalized, title: e.target.value })}
            {...bindFocus("Widget Header Title", (next) => onChange({ ...normalized, title: next }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Title Emoji</Label>
          <EmojiPickerButton
            label="Widget Title Emoji"
            value={normalized.titleEmoji}
            recentEmojis={recentEmojis}
            onSelectRecordRecent={onRecordRecentEmoji}
            onChange={(emoji) => onChange({ ...normalized, titleEmoji: emoji })}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="wt-subtitle">Subtitle Line</Label>
          <Input
            id="wt-subtitle"
            value={normalized.subtitle}
            maxLength={300}
            onChange={(e) => onChange({ ...normalized, subtitle: e.target.value })}
            {...bindFocus("Subtitle Line", (next) => onChange({ ...normalized, subtitle: next }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wt-intro">Optional Intro Note</Label>
          <Input
            id="wt-intro"
            value={normalized.introMessage}
            maxLength={600}
            placeholder="Supports variables like {check_interval} & {active_count}"
            onChange={(e) => onChange({ ...normalized, introMessage: e.target.value })}
            {...bindFocus("Optional Intro Note", (next) =>
              onChange({ ...normalized, introMessage: next })
            )}
          />
        </div>
      </div>

      {/* Colors */}
      <div className="space-y-3 rounded-lg border border-border bg-zinc-950/60 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-white">Dynamic Stock Accent Color</p>
            <p className="text-xs text-muted-foreground">
              Automatically switch sidebar stripe between In Stock and Sold Out colors.
            </p>
          </div>
          <Switch
            checked={value.useDynamicStockColor}
            onCheckedChange={(checked) =>
              onChange({ ...value, useDynamicStockColor: checked })
            }
          />
        </div>

        <div className="grid gap-3 pt-2 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Static / Fallback Hex</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={/^#[0-9A-F]{6}$/i.test(value.accentColor) ? value.accentColor : "#10B981"}
                onChange={(e) =>
                  onChange({ ...value, accentColor: e.target.value.toUpperCase() })
                }
                className="h-9 w-10 cursor-pointer rounded border border-border bg-zinc-950 p-0.5"
              />
              <Input
                value={value.accentColor}
                maxLength={7}
                onChange={(e) =>
                  onChange({ ...value, accentColor: e.target.value.toUpperCase() })
                }
                className="h-9 font-mono text-xs"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Active Stock Hex</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={/^#[0-9A-F]{6}$/i.test(value.inStockColor) ? value.inStockColor : "#10B981"}
                onChange={(e) =>
                  onChange({ ...value, inStockColor: e.target.value.toUpperCase() })
                }
                className="h-9 w-10 cursor-pointer rounded border border-border bg-zinc-950 p-0.5"
              />
              <Input
                value={value.inStockColor}
                maxLength={7}
                onChange={(e) =>
                  onChange({ ...value, inStockColor: e.target.value.toUpperCase() })
                }
                className="h-9 font-mono text-xs"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>All Sold Out Hex</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={/^#[0-9A-F]{6}$/i.test(value.soldOutColor) ? value.soldOutColor : "#52525B"}
                onChange={(e) =>
                  onChange({ ...value, soldOutColor: e.target.value.toUpperCase() })
                }
                className="h-9 w-10 cursor-pointer rounded border border-border bg-zinc-950 p-0.5"
              />
              <Input
                value={value.soldOutColor}
                maxLength={7}
                onChange={(e) =>
                  onChange({ ...value, soldOutColor: e.target.value.toUpperCase() })
                }
                className="h-9 font-mono text-xs"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Status Badges & Featured Slot */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 rounded-lg border border-border bg-zinc-950/60 p-3.5">
          <Label htmlFor="wt-instock-lbl">In Stock Status Label &amp; Emoji</Label>
          <Input
            id="wt-instock-lbl"
            value={normalized.inStockLabel}
            maxLength={50}
            onChange={(e) => onChange({ ...normalized, inStockLabel: e.target.value })}
            {...bindFocus("In Stock Status Label", (next) =>
              onChange({ ...normalized, inStockLabel: next })
            )}
          />
          <EmojiPickerButton
            label="In Stock Emoji"
            value={normalized.inStockEmoji}
            recentEmojis={recentEmojis}
            onSelectRecordRecent={onRecordRecentEmoji}
            onChange={(emoji) => onChange({ ...normalized, inStockEmoji: emoji })}
          />
        </div>

        <div className="space-y-2 rounded-lg border border-border bg-zinc-950/60 p-3.5">
          <Label htmlFor="wt-soldout-lbl">Sold Out Status Label &amp; Emoji</Label>
          <Input
            id="wt-soldout-lbl"
            value={normalized.soldOutLabel}
            maxLength={50}
            onChange={(e) => onChange({ ...normalized, soldOutLabel: e.target.value })}
            {...bindFocus("Sold Out Status Label", (next) =>
              onChange({ ...normalized, soldOutLabel: next })
            )}
          />
          <EmojiPickerButton
            label="Sold Out Emoji"
            value={normalized.soldOutEmoji}
            recentEmojis={recentEmojis}
            onSelectRecordRecent={onRecordRecentEmoji}
            onChange={(emoji) => onChange({ ...normalized, soldOutEmoji: emoji })}
          />
        </div>
      </div>

      {/* Featured Image, Count, Ordering */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Vehicle Columns Shown</Label>
          <Select
            value={String(value.vehicleCount)}
            onValueChange={(v) => onChange({ ...value, vehicleCount: Number(v) })}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  Up to {n} vehicle{n === 1 ? "" : "s"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Vehicle Ordering</Label>
          <Select
            value={value.vehicleOrdering}
            onValueChange={(v) =>
              onChange({
                ...value,
                vehicleOrdering: v === "in_stock_first" ? "in_stock_first" : "newest_first",
              })
            }
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest_first">Newest Discovered First</SelectItem>
              <SelectItem value="in_stock_first">In Stock First, Then Recent</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Featured Image Slot (Default: 3)</Label>
          <Select
            value={value.showFeaturedImage ? String(value.featuredImageSlot) : "off"}
            onValueChange={(v) => {
              if (v === "off") {
                onChange({ ...value, showFeaturedImage: false });
              } else {
                onChange({
                  ...value,
                  showFeaturedImage: true,
                  featuredImageSlot: Number(v),
                });
              }
            }}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="off">Hide Featured Image</SelectItem>
              {Array.from({ length: 10 }, (_, idx) => (
                <SelectItem key={idx} value={String(idx)}>
                  Slot {idx} {idx === 3 ? "(Default Widget)" : idx === 0 ? "(Primary)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary & Features Visibility */}
      <div className="space-y-3 rounded-lg border border-border bg-zinc-950/60 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-white">Show Active Listings Row</p>
            <p className="text-xs text-muted-foreground">
              Displays up to 3 currently active releases above vehicle columns.
            </p>
          </div>
          <Switch
            checked={value.showActiveSummary}
            onCheckedChange={(checked) => onChange({ ...value, showActiveSummary: checked })}
          />
        </div>

        {normalized.showActiveSummary && (
          <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="wt-active-heading">Active Summary Heading</Label>
              <Input
                id="wt-active-heading"
                value={normalized.activeSummaryHeading}
                maxLength={80}
                onChange={(e) => onChange({ ...normalized, activeSummaryHeading: e.target.value })}
                {...bindFocus("Active Summary Heading", (next) =>
                  onChange({ ...normalized, activeSummaryHeading: next })
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wt-view-btn">Inline Store Link Label</Label>
              <Input
                id="wt-view-btn"
                value={normalized.viewButtonLabel}
                maxLength={40}
                onChange={(e) => onChange({ ...normalized, viewButtonLabel: e.target.value })}
                {...bindFocus("Inline Store Link Label", (next) =>
                  onChange({ ...normalized, viewButtonLabel: next })
                )}
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <div>
            <p className="text-sm font-medium text-white">Show Normalized Vehicle Features</p>
            <p className="text-xs text-muted-foreground">
              Display extracted/admin vehicle specs inside each vehicle column.
            </p>
          </div>
          <Switch
            checked={value.showFeatures}
            onCheckedChange={(checked) => onChange({ ...value, showFeatures: checked })}
          />
        </div>

        {value.showFeatures && (
          <div className="space-y-2 border-t border-border pt-3">
            <Label className="text-xs text-muted-foreground">
              Feature Order, Visibility &amp; Label Overrides
            </Label>
            <div className="space-y-1.5">
              {orderedKeys.slice(0, 5).map((key, idx) => {
                const def = SUPPORTED_FEATURE_TEMPLATES.find((t) => t.key === key);
                const hidden = (value.hiddenFeatureKeys || []).includes(key);
                return (
                  <div
                    key={key}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-zinc-900/70 px-2.5 py-1.5"
                  >
                    <Checkbox
                      checked={!hidden}
                      onCheckedChange={() => toggleHiddenKey(key)}
                      aria-label={`Toggle ${def?.label || key}`}
                    />
                    <span className="w-36 truncate text-xs font-medium text-zinc-200">
                      {def?.label || key}
                    </span>
                    <Input
                      value={value.featureLabelOverrides?.[key] || ""}
                      placeholder="Default label"
                      maxLength={50}
                      onChange={(e) =>
                        onChange({
                          ...value,
                          featureLabelOverrides: {
                            ...(value.featureLabelOverrides || {}),
                            [key]: e.target.value,
                          },
                        })
                      }
                      className="h-7 flex-1 text-xs"
                    />
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={idx === 0}
                        onClick={() => moveFeatureKey(key, -1)}
                        className="h-7 w-7"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={idx === 4}
                        onClick={() => moveFeatureKey(key, 1)}
                        className="h-7 w-7"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Independent Timestamp & Monitoring Controls */}
      <div className="space-y-3 rounded-lg border border-border bg-zinc-950/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-white">Timestamp &amp; Monitoring Controls</p>
            <p className="text-xs text-muted-foreground">
              Independently toggle any combination of status timestamps, labels, or Discord embed footer timestamp (all 5 can be hidden).
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-[11px] text-zinc-400 hover:text-white"
            onClick={() =>
              updateTimestampFlags({
                showLastStoreCheck: false,
                showLastVerifiedStock: false,
                showMonitorState: false,
                showLastUpdated: false,
                showEmbedTimestamp: false,
              })
            }
          >
            Hide All 5
          </Button>
        </div>

        {/* 1. Last Store Check */}
        <div className="space-y-2 border-t border-border pt-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-white">1. Last Store Check</p>
              <p className="text-[11px] text-muted-foreground">
                Displays when the monitor check executed (`monitorStatus.checkedAt`).
              </p>
            </div>
            <Switch
              checked={normalized.showLastStoreCheck !== false}
              onCheckedChange={(checked) => updateTimestampFlags({ showLastStoreCheck: checked })}
            />
          </div>
          {normalized.showLastStoreCheck !== false && (
            <Input
              value={normalized.lastStoreCheckLabel || "Last Store Check"}
              maxLength={60}
              placeholder="Last Store Check"
              onChange={(e) =>
                onChange({ ...normalized, lastStoreCheckLabel: e.target.value })
              }
              {...bindFocus("Last Store Check Label", (next) =>
                onChange({ ...normalized, lastStoreCheckLabel: next })
              )}
              className="h-8 text-xs"
            />
          )}
        </div>

        {/* 2. Last Verified Stock */}
        <div className="space-y-2 border-t border-border pt-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-white">2. Last Verified Stock</p>
              <p className="text-[11px] text-muted-foreground">
                Displays the last authoritative non-blocked storefront verification (`lastSuccessAt`).
              </p>
            </div>
            <Switch
              checked={normalized.showLastVerifiedStock !== false}
              onCheckedChange={(checked) => updateTimestampFlags({ showLastVerifiedStock: checked })}
            />
          </div>
          {normalized.showLastVerifiedStock !== false && (
            <Input
              value={normalized.lastVerifiedStockLabel || "Last Verified Stock"}
              maxLength={60}
              placeholder="Last Verified Stock"
              onChange={(e) =>
                onChange({ ...normalized, lastVerifiedStockLabel: e.target.value })
              }
              {...bindFocus("Last Verified Stock Label", (next) =>
                onChange({ ...normalized, lastVerifiedStockLabel: next })
              )}
              className="h-8 text-xs"
            />
          )}
        </div>

        {/* 3. Monitor State */}
        <div className="space-y-2 border-t border-border pt-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-white">3. Monitor State</p>
              <p className="text-[11px] text-muted-foreground">
                Shows whether verification is active, Scrapling-backed, or blocked.
              </p>
            </div>
            <Switch
              checked={normalized.showMonitorState !== false}
              onCheckedChange={(checked) => updateTimestampFlags({ showMonitorState: checked })}
            />
          </div>
          {normalized.showMonitorState !== false && (
            <Input
              value={normalized.monitorStateLabel || "Monitor State"}
              maxLength={60}
              placeholder="Monitor State"
              onChange={(e) =>
                onChange({ ...normalized, monitorStateLabel: e.target.value })
              }
              {...bindFocus("Monitor State Label", (next) =>
                onChange({ ...normalized, monitorStateLabel: next })
              )}
              className="h-8 text-xs"
            />
          )}
        </div>

        {/* 4. Widget Last Updated */}
        <div className="space-y-2 border-t border-border pt-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-white">4. Widget Last Updated</p>
              <p className="text-[11px] text-muted-foreground">
                Reflects when the Discord widget message itself was last updated (`widgetUpdatedAt`), distinct from store checks.
              </p>
            </div>
            <Switch
              checked={normalized.showLastUpdated !== false}
              onCheckedChange={(checked) => updateTimestampFlags({ showLastUpdated: checked })}
            />
          </div>
          {normalized.showLastUpdated !== false && (
            <Input
              value={normalized.lastUpdatedLabel || "Widget Last Updated"}
              maxLength={60}
              placeholder="Widget Last Updated"
              onChange={(e) =>
                onChange({ ...normalized, lastUpdatedLabel: e.target.value })
              }
              {...bindFocus("Widget Last Updated Label", (next) =>
                onChange({ ...normalized, lastUpdatedLabel: next })
              )}
              className="h-8 text-xs"
            />
          )}
        </div>

        {/* 5. Native Discord Embed Footer Timestamp */}
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <div>
            <p className="text-xs font-medium text-white">5. Native Discord Embed Timestamp</p>
            <p className="text-[11px] text-muted-foreground">
              Attaches `embed.timestamp` next to the footer attribution (turn off for minimal boards).
            </p>
          </div>
          <Switch
            checked={normalized.showEmbedTimestamp !== false}
            onCheckedChange={(checked) => updateTimestampFlags({ showEmbedTimestamp: checked })}
          />
        </div>
      </div>

      {/* Section Ordering & Conditional Custom Blocks */}
      <div className="space-y-3 rounded-lg border border-border bg-zinc-950/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-white">Description Layout &amp; Custom Sections</p>
            <p className="text-xs text-muted-foreground">
              Reorder top-level sections and add optional conditional blocks supporting dynamic variables.
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
          {sectionOrder.map((secKey, idx) => {
            const meta = WIDGET_SECTION_LABELS[secKey];
            return (
              <div
                key={secKey}
                className="flex items-center justify-between gap-2 rounded-md border border-border bg-zinc-900/70 px-2.5 py-1.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-zinc-200">{meta.title}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{meta.hint}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={idx === 0}
                    onClick={() => moveSectionKey(secKey, -1)}
                    className="h-7 w-7"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={idx === sectionOrder.length - 1}
                    onClick={() => moveSectionKey(secKey, 1)}
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
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={cs.enabled}
                      onCheckedChange={(checked) => updateCustomSection(cs.id, { enabled: checked })}
                    />
                    <span className="text-xs font-semibold text-white">
                      Custom Section #{idx + 1}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-[11px] text-zinc-300">
                      <Checkbox
                        checked={Boolean(cs.inline)}
                        onCheckedChange={(checked) =>
                          updateCustomSection(cs.id, { inline: Boolean(checked) })
                        }
                      />
                      <span>Inline Embed Field</span>
                    </label>
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
                </div>

                <div className="grid gap-2.5 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-[11px]">Section Heading</Label>
                    <Input
                      value={cs.title}
                      maxLength={80}
                      placeholder="Section title (supports variables)"
                      onChange={(e) => updateCustomSection(cs.id, { title: e.target.value })}
                      {...bindFocus(`Widget Custom Section #${idx + 1} Title`, (next) =>
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
                        {WIDGET_CONDITION_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px]">Section Content</Label>
                  <textarea
                    rows={2}
                    value={cs.content}
                    maxLength={1000}
                    placeholder="Supports variables like {recent_releases}, {check_interval}, {active_count}..."
                    onChange={(e) => updateCustomSection(cs.id, { content: e.target.value })}
                    {...bindFocus(`Widget Custom Section #${idx + 1} Content`, (next) =>
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

      {/* Notices, Empty Message & Footer */}
      <div className="space-y-3 rounded-lg border border-border bg-zinc-950/60 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-white">Show Stale / Blocked Verification Notice</p>
            <p className="text-xs text-muted-foreground">
              Shows an informational notice whenever storefront verification is stale or blocked.
            </p>
          </div>
          <Switch
            checked={normalized.showStaleWarning}
            onCheckedChange={(checked) => onChange({ ...normalized, showStaleWarning: checked })}
          />
        </div>

        {normalized.showStaleWarning && (
          <div className="space-y-1.5">
            <Label htmlFor="wt-stale-text">Stale / Blocked Notice Copy</Label>
            <Input
              id="wt-stale-text"
              value={normalized.staleWarningText}
              maxLength={300}
              onChange={(e) => onChange({ ...normalized, staleWarningText: e.target.value })}
              {...bindFocus("Stale / Blocked Notice Copy", (next) =>
                onChange({ ...normalized, staleWarningText: next })
              )}
            />
          </div>
        )}

        <div className="space-y-1.5 border-t border-border pt-3">
          <Label htmlFor="wt-empty-text">Empty History Message</Label>
          <Input
            id="wt-empty-text"
            value={normalized.emptyStateMessage}
            maxLength={300}
            onChange={(e) => onChange({ ...normalized, emptyStateMessage: e.target.value })}
            {...bindFocus("Empty History Message", (next) =>
              onChange({ ...normalized, emptyStateMessage: next })
            )}
          />
        </div>

        <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="wt-footer">Footer Attribution</Label>
            <Input
              id="wt-footer"
              value={normalized.footerText}
              maxLength={200}
              onChange={(e) => onChange({ ...normalized, footerText: e.target.value })}
              {...bindFocus("Widget Footer Attribution", (next) =>
                onChange({ ...normalized, footerText: next })
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Footer Emoji (Unicode Only)</Label>
            <EmojiPickerButton
              label="Widget Footer Emoji"
              value={normalized.footerEmoji}
              recentEmojis={recentEmojis}
              onSelectRecordRecent={onRecordRecentEmoji}
              onChange={(emoji) => onChange({ ...normalized, footerEmoji: emoji })}
            />
          </div>
        </div>
      </div>

      {/* Action Buttons Row */}
      <div className="space-y-3 rounded-lg border border-border bg-zinc-950/60 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-white">Show Action Link Buttons Row</p>
            <p className="text-xs text-muted-foreground">
              Appends quick links to Live Archive and Everfall Store below the widget embed.
            </p>
          </div>
          <Switch
            checked={normalized.showButtonsRow}
            onCheckedChange={(checked) => onChange({ ...normalized, showButtonsRow: checked })}
          />
        </div>

        {normalized.showButtonsRow && (
          <div className="space-y-3 pt-2">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="wt-web-btn">Website Archive Button Label &amp; Emoji</Label>
                <Input
                  id="wt-web-btn"
                  value={normalized.websiteButtonLabel}
                  maxLength={60}
                  onChange={(e) => onChange({ ...normalized, websiteButtonLabel: e.target.value })}
                  {...bindFocus("Website Button Label", (next) =>
                    onChange({ ...normalized, websiteButtonLabel: next })
                  )}
                />
                <EmojiPickerButton
                  label="Website Button Emoji"
                  value={normalized.websiteButtonEmoji}
                  recentEmojis={recentEmojis}
                  onSelectRecordRecent={onRecordRecentEmoji}
                  onChange={(emoji) => onChange({ ...normalized, websiteButtonEmoji: emoji })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="wt-store-btn">Store Button Label &amp; Emoji</Label>
                <Input
                  id="wt-store-btn"
                  value={normalized.storeButtonLabel}
                  maxLength={60}
                  onChange={(e) => onChange({ ...normalized, storeButtonLabel: e.target.value })}
                  {...bindFocus("Store Button Label", (next) =>
                    onChange({ ...normalized, storeButtonLabel: next })
                  )}
                />
                <EmojiPickerButton
                  label="Store Button Emoji"
                  value={normalized.storeButtonEmoji}
                  recentEmojis={recentEmojis}
                  onSelectRecordRecent={onRecordRecentEmoji}
                  onChange={(emoji) => onChange({ ...normalized, storeButtonEmoji: emoji })}
                />
              </div>
            </div>

            <div className="space-y-1.5 border-t border-border pt-3">
              <Label htmlFor="wt-custom-store-url">Custom Store Button URL (Optional Override)</Label>
              <Input
                id="wt-custom-store-url"
                value={normalized.customStoreButtonUrl || ""}
                maxLength={300}
                placeholder="Defaults to Everfall Limited Cars category (or use {listing_url} / https://...)"
                onChange={(e) =>
                  onChange({ ...normalized, customStoreButtonUrl: e.target.value })
                }
                {...bindFocus("Custom Store Button URL", (next) =>
                  onChange({ ...normalized, customStoreButtonUrl: next })
                )}
                className="font-mono text-xs"
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            onChange({
              ...DEFAULT_WIDGET_TEMPLATE,
              id: normalized.id,
              name: normalized.name,
            })
          }
          className="text-xs text-muted-foreground hover:text-white"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset Widget Fields to Recommended Defaults
        </Button>
      </div>
    </div>
  );
}
