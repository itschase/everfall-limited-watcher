import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, ExternalLink, Loader2, Radio, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  apiFetch,
  RichPresenceAdminResponse,
} from "@/lib/api";
import { formatLocalDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  buildRichPresenceActivity,
  DEFAULT_RICH_PRESENCE_CONFIG,
  RICH_PRESENCE_VARIABLES,
  RichPresenceActivityType,
  RichPresenceConfig,
  RichPresenceStatus,
  RichPresenceTimestampMode,
} from "../../../shared/richPresence";

const RICH_PRESENCE_KEY = ["admin-rich-presence"] as const;

const ACTIVITY_OPTIONS: Array<{ value: RichPresenceActivityType; label: string }> = [
  { value: "playing", label: "Playing" },
  { value: "streaming", label: "Streaming" },
  { value: "listening", label: "Listening" },
  { value: "watching", label: "Watching" },
  { value: "competing", label: "Competing" },
  { value: "custom", label: "Custom status" },
];

const STATUS_OPTIONS: Array<{ value: RichPresenceStatus; label: string }> = [
  { value: "online", label: "Online" },
  { value: "idle", label: "Idle" },
  { value: "dnd", label: "Do Not Disturb" },
  { value: "invisible", label: "Invisible" },
];

const TIMESTAMP_OPTIONS: Array<{ value: RichPresenceTimestampMode; label: string }> = [
  { value: "none", label: "No timestamp" },
  { value: "last-check", label: "Relative time since last check" },
  { value: "next-check", label: "Relative time until next expected check" },
];

const PRESETS: Array<{
  id: string;
  label: string;
  values: Partial<RichPresenceConfig>;
}> = [
  {
    id: "monitoring",
    label: "Monitoring overview",
    values: {
      enabled: true,
      activityType: "playing",
      activityName: "Everfall Limited Watcher",
      activityState: "Monitoring {available_count} listings • checked {time_since_check} ago",
    },
  },
  {
    id: "latest",
    label: "Latest listing",
    values: {
      enabled: true,
      activityType: "watching",
      activityName: "Watching {latest_listing}",
      activityState: "{latest_listing_status} • checked {time_since_check} ago",
    },
  },
  {
    id: "stock",
    label: "Stock summary",
    values: {
      enabled: true,
      activityType: "listening",
      activityName: "Everfall store updates",
      activityState: "{available_count} in stock • {sold_out_count} sold out",
    },
  },
  {
    id: "next-check",
    label: "Next check countdown",
    values: {
      enabled: true,
      activityType: "watching",
      activityName: "The Everfall Limited store",
      activityState: "Next check in {next_check_in}",
    },
  },
  {
    id: "disabled",
    label: "Disabled",
    values: { enabled: false },
  },
];

const PREVIEW_SNAPSHOT = {
  now: Date.now(),
  lastCheckedAt: Date.now() - 3 * 60 * 1000,
  lastSuccessAt: Date.now() - 3 * 60 * 1000,
  scheduledIntervalMs: 7 * 60 * 1000,
  totalCount: 18,
  availableCount: 7,
  soldOutCount: 11,
  monitorStatus: "Online",
  latestListing: {
    id: "7815819",
    name: "Seraph GTS",
    isAvailable: true,
  },
  siteUrl: "https://everfall-limited-watcher.itschase.workers.dev/",
};

function isActivityType(value: string): value is RichPresenceActivityType {
  return ACTIVITY_OPTIONS.some((option) => option.value === value);
}

function isStatus(value: string): value is RichPresenceStatus {
  return STATUS_OPTIONS.some((option) => option.value === value);
}

function isTimestampMode(value: string): value is RichPresenceTimestampMode {
  return TIMESTAMP_OPTIONS.some((option) => option.value === value);
}

export function RichPresenceControls() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<RichPresenceConfig>(DEFAULT_RICH_PRESENCE_CONFIG);
  const [initialized, setInitialized] = useState(false);

  const { data, isLoading } = useQuery<RichPresenceAdminResponse>({
    queryKey: RICH_PRESENCE_KEY,
    queryFn: () => apiFetch<RichPresenceAdminResponse>("/api/admin/bot/presence"),
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (data && !initialized) {
      setDraft(data.config);
      setInitialized(true);
    }
  }, [data, initialized]);

  const saveMutation = useMutation({
    mutationFn: (config: RichPresenceConfig) =>
      apiFetch<{ ok: boolean; config: RichPresenceConfig; warning?: string | null }>(
        "/api/admin/bot/presence",
        {
          method: "PUT",
          body: JSON.stringify(config),
        }
      ),
    onSuccess: (response) => {
      setDraft(response.config);
      if (response.warning) toast.warning(response.warning);
      else toast.success("Rich Presence settings saved.");
      void queryClient.invalidateQueries({ queryKey: RICH_PRESENCE_KEY });
    },
    onError: (error: Error) => toast.error(error.message || "Failed to save Rich Presence settings."),
  });

  const webhookActionMutation = useMutation({
    mutationFn: (action: "sync" | "delete") =>
      apiFetch<{ ok: boolean; action: string; warning?: string | null }>(
        "/api/admin/bot/presence/webhook-card",
        {
          method: "POST",
          body: JSON.stringify({ action }),
        }
      ),
    onSuccess: (response, action) => {
      if (response.warning) {
        toast.warning(response.warning);
      } else {
        toast.success(
          action === "sync" ? "Status card update queued." : "Status card removal queued."
        );
      }
      void queryClient.invalidateQueries({ queryKey: RICH_PRESENCE_KEY });
    },
    onError: (error: Error) => toast.error(error.message || "Failed to queue the webhook action."),
  });

  const updateDraft = (patch: Partial<RichPresenceConfig>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const applyPreset = (presetId: string) => {
    const preset = PRESETS.find((item) => item.id === presetId);
    if (preset) updateDraft(preset.values);
  };

  const previewActivity = buildRichPresenceActivity(draft, PREVIEW_SNAPSHOT);
  const serviceOnline = data?.service.online === true;
  const serviceConnected = serviceOnline && data?.service.connected === true;
  const webhookReady = serviceOnline && data?.service.webhookConfigured === true;
  const presenceEnabled = data?.config.enabled === true || data?.config.webhookCardEnabled === true;
  const connectionLabel = !presenceEnabled
    ? "Disabled"
    : serviceConnected
      ? "Gateway connected"
      : serviceOnline
        ? "Connecting"
        : "Offline";
  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 @2xl/main:flex-row @2xl/main:items-start @2xl/main:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-zinc-300" />
            Rich Presence &amp; Status Card
          </CardTitle>
          <CardDescription className="mt-1 max-w-3xl">
            Configure the bot-wide Discord activity and an optional status card. Activity updates
            do not post messages; the card is separate and only publishes when requested.
            Templates can use current listings and store-check timing.
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={
              !presenceEnabled
                ? "outline"
                : serviceConnected
                  ? "success"
                  : serviceOnline
                    ? "warning"
                    : "destructive"
            }
          >
            {connectionLabel}
          </Badge>
          {data?.service.lastHeartbeatAt && (
            <span className="text-[11px] text-muted-foreground">
              Heartbeat {formatLocalDateTime(data.service.lastHeartbeatAt)}
            </span>
          )}
          {data?.config.enabled && (
            <span className="text-[11px] text-muted-foreground">
              Last activity sent: {data.service.activity || "None yet"}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {presenceEnabled && !serviceConnected && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
            <p className="font-medium">The Cloudflare Gateway is not connected.</p>
            <p className="mt-1 text-amber-100/80">
              The Gateway runs automatically in Cloudflare when Rich Presence is enabled. Check
              that <code>DISCORD_BOT_TOKEN</code> is configured as a Worker secret and that the
              Durable Object binding is deployed. No separate process, sync secret, or webhook is
              needed for profile activity.
            </p>
          </div>
        )}

        {data?.service.error && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
            Last service error: {data.service.error}
          </div>
        )}

        <div className="rounded-lg border border-border bg-zinc-950/60 p-3 text-xs text-muted-foreground">
          Discord bot accounts support activity name, activity type, state text, and a streaming
          URL. Native activity details, elapsed-time fields, and Rich Presence buttons are not
          available to bots. Use the live timing placeholders in the state text; the optional
          webhook card can display details, Discord-relative timestamps, and a site-link button.
          A heartbeat confirms the Gateway connection, not that Discord acknowledged a presence
          update.
        </div>

        <div className="grid gap-6 @4xl/main:grid-cols-2">
          <section className="space-y-4 rounded-lg border border-border bg-zinc-950/50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-white">Bot profile activity</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Disabled clears the activity while leaving the selected online status unchanged.
                </p>
              </div>
              <Switch
                checked={draft.enabled}
                onCheckedChange={(enabled) => updateDraft({ enabled })}
                aria-label="Enable Discord Rich Presence"
              />
            </div>

            <div className="grid gap-4 @xl/card:grid-cols-2">
              <div className="space-y-2">
                <Label>Starting preset</Label>
                <Select onValueChange={applyPreset}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a pre-filled option" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRESETS.map((preset) => (
                      <SelectItem key={preset.id} value={preset.id}>
                        {preset.label}
                      </SelectItem>
                    ))}
                    <SelectItem value="custom">Custom (keep current fields)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Discord status</Label>
                <Select
                  value={draft.status}
                  onValueChange={(value) => {
                    if (isStatus(value)) updateDraft({ status: value });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Activity type</Label>
                <Select
                  value={draft.activityType}
                  onValueChange={(value) => {
                    if (isActivityType(value)) updateDraft({ activityType: value });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTIVITY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="rich-presence-name">Activity name</Label>
                <Input
                  id="rich-presence-name"
                  maxLength={128}
                  value={draft.activityName}
                  onChange={(event) => updateDraft({ activityName: event.target.value })}
                  placeholder="Everfall Limited Watcher"
                />
                <p className="text-right text-[10px] text-muted-foreground">
                  {draft.activityName.length}/128
                </p>
              </div>

              <div className="space-y-2 @xl/card:col-span-2">
                <Label htmlFor="rich-presence-state">Activity state</Label>
                <Input
                  id="rich-presence-state"
                  maxLength={128}
                  value={draft.activityState}
                  onChange={(event) => updateDraft({ activityState: event.target.value })}
                  placeholder="Watching {latest_listing}"
                />
                <p className="text-right text-[10px] text-muted-foreground">
                  {draft.activityState.length}/128
                </p>
              </div>

              {draft.activityType === "streaming" && (
                <div className="space-y-2 @xl/card:col-span-2">
                  <Label htmlFor="rich-presence-stream-url">Twitch or YouTube URL</Label>
                  <Input
                    id="rich-presence-stream-url"
                    type="url"
                    value={draft.streamUrl}
                    onChange={(event) => updateDraft({ streamUrl: event.target.value })}
                    placeholder="https://www.twitch.tv/..."
                  />
                </div>
              )}
            </div>

            <div className="rounded-md border border-border/70 bg-zinc-950 p-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Live example
              </p>
              <p className="mt-1 text-sm font-medium text-zinc-100">
                {previewActivity
                  ? `${previewActivity.type[0].toUpperCase()}${previewActivity.type.slice(1)} ${previewActivity.name}`
                  : "No activity (disabled)"}
              </p>
              {previewActivity?.state && (
                <p className="mt-0.5 text-xs text-zinc-400">{previewActivity.state}</p>
              )}
            </div>
          </section>

          <section className="space-y-4 rounded-lg border border-border bg-zinc-950/50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-white">Optional webhook status card</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Adds the details and custom link button Discord does not support in bot profile
                  activity.
                </p>
              </div>
              <Switch
                checked={draft.webhookCardEnabled}
                onCheckedChange={(webhookCardEnabled) => updateDraft({ webhookCardEnabled })}
                aria-label="Enable webhook status card"
              />
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="presence-webhook-title">Card title</Label>
                <Input
                  id="presence-webhook-title"
                  maxLength={256}
                  value={draft.webhookTitle}
                  onChange={(event) => updateDraft({ webhookTitle: event.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="presence-webhook-description">Card details</Label>
                <textarea
                  id="presence-webhook-description"
                  rows={3}
                  maxLength={4096}
                  value={draft.webhookDescription}
                  onChange={(event) => updateDraft({ webhookDescription: event.target.value })}
                  className="w-full resize-y rounded-lg border border-border bg-zinc-950/70 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <p className="text-right text-[10px] text-muted-foreground">
                  {draft.webhookDescription.length}/4096
                </p>
              </div>

              <div className="grid gap-4 @xl/card:grid-cols-2">
                <div className="space-y-2">
                  <Label>Card timestamp</Label>
                  <Select
                    value={draft.webhookTimestampMode}
                    onValueChange={(value) => {
                      if (isTimestampMode(value)) {
                        updateDraft({ webhookTimestampMode: value });
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMESTAMP_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="presence-webhook-button-label">Link button label</Label>
                  <Input
                    id="presence-webhook-button-label"
                    maxLength={80}
                    value={draft.webhookButtonLabel}
                    onChange={(event) => updateDraft({ webhookButtonLabel: event.target.value })}
                    placeholder="Visit the site"
                  />
                </div>
                <div className="space-y-2 @xl/card:col-span-2">
                  <Label htmlFor="presence-webhook-button-url">Link button HTTPS URL</Label>
                  <Input
                    id="presence-webhook-button-url"
                    type="url"
                    value={draft.webhookButtonUrl}
                    onChange={(event) => updateDraft({ webhookButtonUrl: event.target.value })}
                    placeholder="https://example.com/"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={webhookReady ? "success" : "outline"}>
                  {webhookReady
                    ? "Optional webhook configured"
                    : "Optional webhook not configured"}
                </Badge>
                {data?.webhookCard.exists && (
                  <Badge variant="secondary">
                    {data.webhookCard.pending ? "Card action pending" : "Card published"}
                  </Badge>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={
                    !serviceConnected ||
                    !webhookReady ||
                    !draft.webhookCardEnabled ||
                    webhookActionMutation.isPending
                  }
                  onClick={() => webhookActionMutation.mutate("sync")}
                >
                  {webhookActionMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ExternalLink className="h-3.5 w-3.5" />
                  )}
                  Publish / Sync Card
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={
                    !serviceConnected ||
                    !webhookReady ||
                    !data?.webhookCard.exists ||
                    webhookActionMutation.isPending
                  }
                  onClick={() => webhookActionMutation.mutate("delete")}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove Card
                </Button>
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Configure <code>DISCORD_STATUS_WEBHOOK_URL</code> as an optional Cloudflare Worker secret.
                This sends a single card to its configured channel and is not needed for profile
                activity. Publishing is an explicit action; after creation, the Gateway edits that
                same message as its live values change. Saving settings alone never posts a message.
              </p>
              {data?.webhookCard.error && (
                <p className="text-xs text-amber-300">
                  Last webhook action failed: {data.webhookCard.error}
                </p>
              )}
            </div>
          </section>
        </div>

        <div className="space-y-3 rounded-lg border border-border bg-zinc-950/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-white">Dynamic template variables</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Use these in activity name/state or the webhook title/details.
              </p>
            </div>
            <Badge variant="outline">
              <Radio className="mr-1 h-3 w-3" />
              Refreshes about once per minute
            </Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            {RICH_PRESENCE_VARIABLES.map(({ token }) => (
              <code
                key={token}
                className="rounded border border-border bg-zinc-950 px-1.5 py-1 text-[10px] text-zinc-300"
              >
                {token}
              </code>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Activity fields have a 128-character limit. The site-check elapsed/next-check values
            render as changing text in the bot status; the webhook card can show Discord-relative
            timestamps.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <div className="text-xs text-muted-foreground">
            {data?.service.activity ? `Current activity: ${data.service.activity}` : "No activity reported"}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!data || saveMutation.isPending || webhookActionMutation.isPending}
              onClick={() => setDraft(data?.config || DEFAULT_RICH_PRESENCE_CONFIG)}
            >
              Reset draft
            </Button>
            <Button
              size="sm"
              disabled={isLoading || saveMutation.isPending || webhookActionMutation.isPending}
              onClick={() => saveMutation.mutate(draft)}
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Save Rich Presence
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
