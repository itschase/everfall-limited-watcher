import { ArrowDown, ArrowUp, RotateCcw } from "lucide-react";
import { DiscordEmojiRef, WidgetTemplateConfig } from "@/lib/api";
import { SUPPORTED_FEATURE_TEMPLATES } from "../../../shared/features";
import { DEFAULT_WIDGET_TEMPLATE } from "../../../shared/presentation";
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

export function WidgetTemplateEditor({
  value,
  onChange,
  recentEmojis,
  onRecordRecentEmoji,
  showTemplateName = false,
}: {
  value: WidgetTemplateConfig;
  onChange: (next: WidgetTemplateConfig) => void;
  recentEmojis?: DiscordEmojiRef[];
  onRecordRecentEmoji?: (emoji: DiscordEmojiRef) => void;
  showTemplateName?: boolean;
}) {
  const orderedKeys =
    value.featureOrder && value.featureOrder.length > 0
      ? [
          ...value.featureOrder,
          ...SUPPORTED_FEATURE_TEMPLATES.map((t) => t.key).filter(
            (k) => !value.featureOrder.includes(k)
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
    onChange({ ...value, featureOrder: copy });
  };

  const toggleHiddenKey = (key: string) => {
    const hidden = new Set(value.hiddenFeatureKeys || []);
    if (hidden.has(key)) hidden.delete(key);
    else hidden.add(key);
    onChange({ ...value, hiddenFeatureKeys: [...hidden] });
  };

  return (
    <div className="space-y-5">
      {showTemplateName && (
        <div className="space-y-1.5">
          <Label htmlFor="wt-name">Template Preset Name</Label>
          <Input
            id="wt-name"
            value={value.name}
            maxLength={80}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
          />
        </div>
      )}

      {/* Title & Subtitle */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="wt-title">Widget Header Title</Label>
          <Input
            id="wt-title"
            value={value.title}
            maxLength={200}
            onChange={(e) => onChange({ ...value, title: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Title Emoji</Label>
          <EmojiPickerButton
            label="Widget Title Emoji"
            value={value.titleEmoji}
            recentEmojis={recentEmojis}
            onSelectRecordRecent={onRecordRecentEmoji}
            onChange={(emoji) => onChange({ ...value, titleEmoji: emoji })}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="wt-subtitle">Subtitle Line</Label>
          <Input
            id="wt-subtitle"
            value={value.subtitle}
            maxLength={300}
            onChange={(e) => onChange({ ...value, subtitle: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wt-intro">Optional Intro Note</Label>
          <Input
            id="wt-intro"
            value={value.introMessage}
            maxLength={600}
            placeholder="Shown above timestamps when set"
            onChange={(e) => onChange({ ...value, introMessage: e.target.value })}
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
            value={value.inStockLabel}
            maxLength={50}
            onChange={(e) => onChange({ ...value, inStockLabel: e.target.value })}
          />
          <EmojiPickerButton
            label="In Stock Emoji"
            value={value.inStockEmoji}
            recentEmojis={recentEmojis}
            onSelectRecordRecent={onRecordRecentEmoji}
            onChange={(emoji) => onChange({ ...value, inStockEmoji: emoji })}
          />
        </div>

        <div className="space-y-2 rounded-lg border border-border bg-zinc-950/60 p-3.5">
          <Label htmlFor="wt-soldout-lbl">Sold Out Status Label &amp; Emoji</Label>
          <Input
            id="wt-soldout-lbl"
            value={value.soldOutLabel}
            maxLength={50}
            onChange={(e) => onChange({ ...value, soldOutLabel: e.target.value })}
          />
          <EmojiPickerButton
            label="Sold Out Emoji"
            value={value.soldOutEmoji}
            recentEmojis={recentEmojis}
            onSelectRecordRecent={onRecordRecentEmoji}
            onChange={(emoji) => onChange({ ...value, soldOutEmoji: emoji })}
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

        {value.showActiveSummary && (
          <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="wt-active-heading">Active Summary Heading</Label>
              <Input
                id="wt-active-heading"
                value={value.activeSummaryHeading}
                maxLength={80}
                onChange={(e) => onChange({ ...value, activeSummaryHeading: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wt-view-btn">Inline Store Link Label</Label>
              <Input
                id="wt-view-btn"
                value={value.viewButtonLabel}
                maxLength={40}
                onChange={(e) => onChange({ ...value, viewButtonLabel: e.target.value })}
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

      {/* Timestamps, Warnings & Footer */}
      <div className="space-y-3 rounded-lg border border-border bg-zinc-950/60 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-white">Show Last Store Check Timestamps</p>
            <p className="text-xs text-muted-foreground">
              Displays live relative Discord timestamps for store check &amp; verification.
            </p>
          </div>
          <Switch
            checked={value.showTimestamps}
            onCheckedChange={(checked) => onChange({ ...value, showTimestamps: checked })}
          />
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <div>
            <p className="text-sm font-medium text-white">Show Stale / Blocked Verification Notice</p>
            <p className="text-xs text-muted-foreground">
              Shows an informational notice whenever storefront verification is stale or blocked.
            </p>
          </div>
          <Switch
            checked={value.showStaleWarning}
            onCheckedChange={(checked) => onChange({ ...value, showStaleWarning: checked })}
          />
        </div>

        {value.showStaleWarning && (
          <div className="space-y-1.5">
            <Label htmlFor="wt-stale-text">Stale / Blocked Notice Copy</Label>
            <Input
              id="wt-stale-text"
              value={value.staleWarningText}
              maxLength={300}
              onChange={(e) => onChange({ ...value, staleWarningText: e.target.value })}
            />
          </div>
        )}

        <div className="space-y-1.5 border-t border-border pt-3">
          <Label htmlFor="wt-empty-text">Empty History Message</Label>
          <Input
            id="wt-empty-text"
            value={value.emptyStateMessage}
            maxLength={300}
            onChange={(e) => onChange({ ...value, emptyStateMessage: e.target.value })}
          />
        </div>

        <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="wt-footer">Footer Attribution</Label>
            <Input
              id="wt-footer"
              value={value.footerText}
              maxLength={200}
              onChange={(e) => onChange({ ...value, footerText: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Footer Emoji (Unicode Only)</Label>
            <EmojiPickerButton
              label="Widget Footer Emoji"
              value={value.footerEmoji}
              recentEmojis={recentEmojis}
              onSelectRecordRecent={onRecordRecentEmoji}
              onChange={(emoji) => onChange({ ...value, footerEmoji: emoji })}
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
            checked={value.showButtonsRow}
            onCheckedChange={(checked) => onChange({ ...value, showButtonsRow: checked })}
          />
        </div>

        {value.showButtonsRow && (
          <div className="grid gap-3 pt-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="wt-web-btn">Website Archive Button Label &amp; Emoji</Label>
              <Input
                id="wt-web-btn"
                value={value.websiteButtonLabel}
                maxLength={60}
                onChange={(e) => onChange({ ...value, websiteButtonLabel: e.target.value })}
              />
              <EmojiPickerButton
                label="Website Button Emoji"
                value={value.websiteButtonEmoji}
                recentEmojis={recentEmojis}
                onSelectRecordRecent={onRecordRecentEmoji}
                onChange={(emoji) => onChange({ ...value, websiteButtonEmoji: emoji })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wt-store-btn">Store Button Label &amp; Emoji</Label>
              <Input
                id="wt-store-btn"
                value={value.storeButtonLabel}
                maxLength={60}
                onChange={(e) => onChange({ ...value, storeButtonLabel: e.target.value })}
              />
              <EmojiPickerButton
                label="Store Button Emoji"
                value={value.storeButtonEmoji}
                recentEmojis={recentEmojis}
                onSelectRecordRecent={onRecordRecentEmoji}
                onChange={(emoji) => onChange({ ...value, storeButtonEmoji: emoji })}
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
              id: value.id,
              name: value.name,
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
