import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AdminOverviewResponse, apiFetch, EmbedConfig } from "@/lib/api";
import { ADMIN_OVERVIEW_KEY, useAdminOverview } from "./useAdminOverview";
import { formatLocalDateTime } from "@/lib/utils";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function AdminEmbedsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useAdminOverview();
  const [form, setForm] = useState<EmbedConfig>({
    color: "#F59E0B",
    titlePrefix: "<:everfall:1571981507973746868> Limited Edition Drop:",
    footerText: "Everfall Limited Watcher • Verified Drop Alert",
    galleryHeading: "",
    storeButtonLabel: "View Package on Everfall",
    soldOutButtonLabel: "Open Everfall Store",
    showDetectionTime: true,
    showLastVerified: true,
  });
  const [previewMode, setPreviewMode] = useState<"in_stock" | "sold_out">("in_stock");
  const [selectedCarId, setSelectedCarId] = useState<string>("");
  const lastSyncedRef = useRef<string>("");

  const isDirty = Boolean(
    data?.embedConfig &&
      (form.color !== data.embedConfig.color ||
        form.titlePrefix !== data.embedConfig.titlePrefix ||
        form.footerText !== data.embedConfig.footerText ||
        form.storeButtonLabel !== data.embedConfig.storeButtonLabel ||
        form.soldOutButtonLabel !== data.embedConfig.soldOutButtonLabel ||
        form.showDetectionTime !== data.embedConfig.showDetectionTime ||
        form.showLastVerified !== data.embedConfig.showLastVerified)
  );

  useEffect(() => {
    if (data?.embedConfig) {
      const serialized = JSON.stringify(data.embedConfig);
      if (serialized !== lastSyncedRef.current && (!isDirty || lastSyncedRef.current === "")) {
        lastSyncedRef.current = serialized;
        setForm(data.embedConfig);
      }
    }
    if (data?.listings?.length && !selectedCarId) {
      setSelectedCarId(data.listings[0].id);
    }
  }, [data?.embedConfig, data?.listings, selectedCarId, isDirty]);

  const sampleCar =
    data?.listings?.find((l) => l.id === selectedCarId) ||
    data?.listings?.[0] || {
      id: "7815819",
      name: "Seraph GTS",
      description:
        "This vehicle is quantity-limited; get it while it is still available. It comes with a custom sound and can only be traded with other limiteds.",
      url: "https://store.everfallcommunity.com/package/7815819",
      images: [],
      isAvailable: true,
      detectedAt: Date.now() - 3600_000,
      lastVerifiedAt: Date.now(),
    };

  const saveMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean; embedConfig: EmbedConfig }>("/api/admin/embed-config", {
        method: "PUT",
        body: JSON.stringify(form),
      }),
    onSuccess: (res) => {
      if (res?.embedConfig) {
        lastSyncedRef.current = JSON.stringify(res.embedConfig);
        setForm(res.embedConfig);
        queryClient.setQueryData<AdminOverviewResponse>(ADMIN_OVERVIEW_KEY, (old) =>
          old ? { ...old, embedConfig: res.embedConfig } : old
        );
      }
      toast.success("Global Discord embed settings saved");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to save embed configuration.");
    },
  });

  const cleanPrefix = form.titlePrefix.replace(/<a?:[a-zA-Z0-9_]+:\d+>/g, "").trim();
  const isSoldOutPreview = previewMode === "sold_out";
  const accentColor = isSoldOutPreview ? "#DC2626" : /^#[0-9A-F]{6}$/i.test(form.color) ? form.color : "#F59E0B";

  return (
    <AppShell
      requireAdmin
      title="Global Embed Manager"
      description="Configure global Discord drop announcement styling and verify In Stock vs. Sold Out previews before saving."
    >
      {isLoading ? (
        <div className="h-96 animate-pulse rounded-xl border border-border bg-card" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Controls Form */}
          <Card>
            <CardHeader>
              <CardTitle>Message Appearance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="embed-color">Accent Color (Hex)</Label>
                <div className="flex items-center gap-3">
                  <input
                    id="embed-color"
                    type="color"
                    value={/^#[0-9A-F]{6}$/i.test(form.color) ? form.color : "#F59E0B"}
                    onChange={(e) => setForm((f) => ({ ...f, color: e.target.value.toUpperCase() }))}
                    className="h-10 w-12 cursor-pointer rounded-lg border border-border bg-zinc-950 p-1"
                  />
                  <Input
                    value={form.color}
                    onChange={(e) => setForm((f) => ({ ...f, color: e.target.value.toUpperCase() }))}
                    maxLength={7}
                    className="font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="title-prefix">Title Prefix</Label>
                <Input
                  id="title-prefix"
                  value={form.titlePrefix}
                  maxLength={120}
                  onChange={(e) => setForm((f) => ({ ...f, titlePrefix: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="footer-text">Footer Notice</Label>
                <Input
                  id="footer-text"
                  value={form.footerText}
                  maxLength={180}
                  onChange={(e) => setForm((f) => ({ ...f, footerText: e.target.value }))}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="instock-btn">In-Stock Button Label</Label>
                  <Input
                    id="instock-btn"
                    value={form.storeButtonLabel}
                    maxLength={80}
                    onChange={(e) => setForm((f) => ({ ...f, storeButtonLabel: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="soldout-btn">Sold-Out Button Label</Label>
                  <Input
                    id="soldout-btn"
                    value={form.soldOutButtonLabel}
                    maxLength={80}
                    onChange={(e) => setForm((f) => ({ ...f, soldOutButtonLabel: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-3 rounded-lg border border-border bg-zinc-950/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white">Show First Detected Timestamp</p>
                    <p className="text-xs text-muted-foreground">
                      Include immutable discovery timestamp inside the Discord post.
                    </p>
                  </div>
                  <Switch
                    checked={form.showDetectionTime}
                    onCheckedChange={(checked) =>
                      setForm((f) => ({ ...f, showDetectionTime: checked }))
                    }
                  />
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                  <div>
                    <p className="text-sm font-medium text-white">Show Last Verified Timestamp</p>
                    <p className="text-xs text-muted-foreground">
                      Include most recent verification timestamp inside the Discord post.
                    </p>
                  </div>
                  <Switch
                    checked={form.showLastVerified}
                    onCheckedChange={(checked) =>
                      setForm((f) => ({ ...f, showLastVerified: checked }))
                    }
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <Button
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending || !isDirty}
                >
                  {saveMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Appearance"
                  )}
                </Button>
                {isDirty && <span className="text-xs text-amber-300">Unsaved changes</span>}
              </div>
            </CardContent>
          </Card>

          {/* Realistic Discord Preview */}
          <Card>
            <CardHeader className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle>Discord Message Preview</CardTitle>
                <Tabs value={previewMode} onValueChange={(v) => setPreviewMode(v as any)}>
                  <TabsList>
                    <TabsTrigger value="in_stock">In Stock</TabsTrigger>
                    <TabsTrigger value="sold_out">Sold Out</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              {data?.listings && data.listings.length > 0 && (
                <div className="flex items-center gap-2">
                  <Label className="shrink-0">Preview Vehicle:</Label>
                  <select
                    value={sampleCar.id}
                    onChange={(e) => setSelectedCarId(e.target.value)}
                    className="h-9 flex-1 rounded-lg border border-border bg-zinc-950 px-2.5 text-xs text-white"
                  >
                    {data.listings.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} (#{item.id})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </CardHeader>
            <CardContent>
              <div
                className="rounded-xl border border-white/10 bg-[#2B2D31] p-5 text-sm text-[#DBDEE1]"
                style={{ boxShadow: `inset 4px 0 0 ${accentColor}` }}
              >
                <p className="text-base font-bold text-white">
                  {cleanPrefix ? `${cleanPrefix} ` : ""}
                  {sampleCar.name}
                </p>
                <p className="mt-2 text-xs">
                  <strong className="text-white">Availability:</strong>{" "}
                  <span className={isSoldOutPreview ? "text-red-300 font-semibold" : "text-emerald-300 font-semibold"}>
                    {isSoldOutPreview ? "Sold Out" : "In Stock"}
                  </span>
                </p>
                <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-[#DBDEE1]">
                  {sampleCar.description}
                </p>

                {form.showDetectionTime && (
                  <p className="mt-3 text-xs text-[#DBDEE1]">
                    <strong className="text-white">First Detected:</strong>{" "}
                    {formatLocalDateTime(sampleCar.detectedAt)}
                  </p>
                )}
                {form.showLastVerified && (
                  <p className="mt-1 text-xs text-[#DBDEE1]">
                    <strong className="text-white">Last Verified:</strong>{" "}
                    {formatLocalDateTime(sampleCar.lastVerifiedAt)}
                  </p>
                )}

                {sampleCar.images?.length > 0 && (
                  <div className="mt-3 grid grid-cols-2 gap-1.5 overflow-hidden rounded-lg">
                    {sampleCar.images.slice(0, 4).map((img, i) => (
                      <img
                        key={i}
                        src={img}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="aspect-video w-full object-cover bg-[#1E1F22]"
                      />
                    ))}
                  </div>
                )}

                <div className="mt-4">
                  <span className="inline-flex items-center gap-1.5 rounded bg-[#4E5058] px-3 py-1.5 text-xs font-semibold text-white">
                    {isSoldOutPreview ? form.soldOutButtonLabel : form.storeButtonLabel}
                    <ExternalLink className="h-3 w-3" />
                  </span>
                </div>

                <p className="mt-3 text-[11px] text-[#949BA4]">{form.footerText}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
