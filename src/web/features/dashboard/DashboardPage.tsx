import { ServerCustomizationsPanel } from "./ServerCustomizationsPanel";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRightLeft,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Hash,
  LayoutPanelTop,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Send,
  Shield,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  apiFetch,
  ApiError,
  DashboardServersResponse,
  ListingItem,
  ManagedServer,
  MonitorStatus,
  ServerStatus,
  WidgetDeployment,
  WidgetTemplateConfig,
} from "@/lib/api";
import { cn, formatLocalDateTime } from "@/lib/utils";
import { DEFAULT_WIDGET_TEMPLATE } from "../../../shared/presentation";
import { useAuthActions, useSession } from "@/features/auth/useAuthActions";
import { AppShell } from "@/components/layout/AppShell";
import { WidgetPreviewCard } from "@/components/discord/DiscordMessagePreview";
import { BotCreatorBadge } from "@/components/layout/BotCreatorBadge";
import {
  DiscordNameplateChip,
  DiscordPrimaryGuildTag,
  DiscordProfileAvatar,
} from "@/components/layout/DiscordProfileVisuals";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function ServerStatusIndicator({ status }: { status: ServerStatus }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/35 bg-emerald-950/60 px-2.5 py-1 text-xs font-medium text-emerald-300">
        <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
        Active
      </span>
    );
  }
  if (status === "setup_required") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/35 bg-amber-950/60 px-2.5 py-1 text-xs font-medium text-amber-300">
        <span className="h-2 w-2 rounded-full bg-amber-400" />
        Setup Required
      </span>
    );
  }
  if (status === "offline") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-red-500/35 bg-red-950/60 px-2.5 py-1 text-xs font-medium text-red-300">
        <span className="h-2 w-2 rounded-full bg-red-400" />
        Offline
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground">
      <span className="h-2 w-2 rounded-full bg-zinc-500" />
      Not Installed
    </span>
  );
}

function ServerWidgetsSection({
  server,
  widgetDefault,
  widgetTemplates,
  previewListings,
  monitorStatus,
  publicOrigin,
  onMutated,
}: {
  server: ManagedServer;
  widgetDefault: WidgetTemplateConfig;
  widgetTemplates: WidgetTemplateConfig[];
  previewListings: ListingItem[];
  monitorStatus: MonitorStatus | null;
  publicOrigin?: string;
  onMutated: () => void;
}) {
  const [deployOpen, setDeployOpen] = useState(false);
  const [deployChannelId, setDeployChannelId] = useState(
    server.config.channelId || server.channels[0]?.id || ""
  );
  const [deployTemplateId, setDeployTemplateId] = useState(
    server.config.widgetTemplateId || "default"
  );
  const [deployConfirmed, setDeployConfirmed] = useState(false);
  const [moveTarget, setMoveTarget] = useState<WidgetDeployment | null>(null);
  const [moveChannelId, setMoveChannelId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<WidgetDeployment | null>(null);
  const [busyWidgetId, setBusyWidgetId] = useState<string | null>(null);

  const widgets = server.widgets || [];
  const templateOptions = useMemo(() => {
    const out = [{ id: "default", name: widgetDefault.name || "Default Global Widget", template: widgetDefault }];
    for (const tpl of widgetTemplates) {
      out.push({ id: tpl.id, name: tpl.name, template: tpl });
    }
    return out;
  }, [widgetDefault, widgetTemplates]);

  const selectedDeployTemplate = useMemo(
    () =>
      templateOptions.find((t) => t.id === deployTemplateId)?.template || widgetDefault,
    [deployTemplateId, templateOptions, widgetDefault]
  );

  const selectedDeployChannel = server.channels.find((c) => c.id === deployChannelId);
  const deployChannelBlocked = Boolean(
    selectedDeployChannel?.permissionsChecked && selectedDeployChannel.writable === false
  );
  const selectedMoveChannel = server.channels.find((c) => c.id === moveChannelId);
  const moveChannelBlocked = Boolean(
    selectedMoveChannel?.permissionsChecked && selectedMoveChannel.writable === false
  );

  const formatApiErr = (err: Error, fallback: string) => {
    const apiErr = err as ApiError;
    return apiErr?.remediation
      ? `${apiErr.message} ${apiErr.remediation}`
      : err.message || fallback;
  };

  const deployMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean; jumpUrl?: string }>(
        `/api/dashboard/servers/${server.id}/widgets/deploy`,
        {
          method: "POST",
          body: JSON.stringify({
            channelId: deployChannelId,
            templateId: deployTemplateId,
          }),
        }
      ),
    onSuccess: () => {
      setDeployOpen(false);
      setDeployConfirmed(false);
      onMutated();
      toast.success(`Live status widget deployed to #${selectedDeployChannel?.name || "channel"}.`);
    },
    onError: (err: Error) => {
      toast.error(formatApiErr(err, "Failed to deploy status widget."));
    },
  });

  const refreshMutation = useMutation({
    mutationFn: (widgetId: string) =>
      apiFetch<{ ok: boolean }>(
        `/api/dashboard/servers/${server.id}/widgets/${encodeURIComponent(widgetId)}/refresh`,
        { method: "POST" }
      ),
    onSuccess: () => {
      setBusyWidgetId(null);
      onMutated();
      toast.success("Status widget updated on Discord.");
    },
    onError: (err: Error) => {
      setBusyWidgetId(null);
      toast.error(err.message || "Failed to refresh widget.");
    },
  });

  const templateMutation = useMutation({
    mutationFn: ({ widgetId, templateId }: { widgetId: string; templateId: string }) =>
      apiFetch<{ ok: boolean; error?: string | null }>(
        `/api/dashboard/servers/${server.id}/widgets/${encodeURIComponent(widgetId)}/template`,
        {
          method: "PUT",
          body: JSON.stringify({ templateId }),
        }
      ),
    onSuccess: (res) => {
      setBusyWidgetId(null);
      onMutated();
      if (res.ok) {
        toast.success("Widget preset saved and synced on Discord.");
      } else {
        toast.warning(res.error || "Preset saved, but Discord sync returned a warning.");
      }
    },
    onError: (err: Error) => {
      setBusyWidgetId(null);
      toast.error(err.message || "Failed to switch widget template.");
    },
  });

  const moveMutation = useMutation({
    mutationFn: ({ widgetId, channelId }: { widgetId: string; channelId: string }) =>
      apiFetch<{ ok: boolean }>(
        `/api/dashboard/servers/${server.id}/widgets/${encodeURIComponent(widgetId)}/move`,
        {
          method: "POST",
          body: JSON.stringify({ channelId }),
        }
      ),
    onSuccess: () => {
      setMoveTarget(null);
      setMoveChannelId("");
      onMutated();
      toast.success("Moved live status widget to destination channel.");
    },
    onError: (err: Error) => {
      toast.error(formatApiErr(err, "Failed to move widget."));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (widgetId: string) =>
      apiFetch<{ ok: boolean }>(
        `/api/dashboard/servers/${server.id}/widgets/${encodeURIComponent(widgetId)}`,
        { method: "DELETE" }
      ),
    onSuccess: () => {
      setDeleteTarget(null);
      onMutated();
      toast.success("Removed status widget from Discord & server registry.");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to remove widget.");
    },
  });

  return (
    <div className="space-y-4 border-t border-border pt-6">
      <div className="flex flex-col gap-3 @2xl/main:flex-row @2xl/main:items-center @2xl/main:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <LayoutPanelTop className="h-4 w-4 text-zinc-400" />
            <h4 className="text-sm font-semibold text-white">
              Live Status Widget ({widgets.length})
            </h4>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Deploy or manage live stock &amp; recent drops embeds in this server. Updates in-place automatically whenever stock, vehicle details, or appearance change without mentioning roles.
          </p>
        </div>

        <Button
          variant="secondary"
          size="sm"
          disabled={server.channels.length === 0}
          onClick={() => {
            setDeployChannelId(
              (curr) => curr || server.config.channelId || server.channels[0]?.id || ""
            );
            setDeployConfirmed(false);
            setDeployOpen(true);
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          Deploy Live Widget
        </Button>
      </div>

      {widgets.length === 0 ? (
        <div className="rounded-lg border border-border bg-zinc-950/70 p-4 text-xs text-muted-foreground">
          No live status widget is deployed in <strong>{server.name}</strong> yet. Click{" "}
          <strong className="text-zinc-200">Deploy Live Widget</strong> above to preview and post one, or
          run <code>/widget</code> inside any writable Discord channel.
        </div>
      ) : (
        <div className="space-y-3">
          {widgets.map((w) => {
            const channelObj = server.channels.find((c) => c.id === w.channelId);
            const busy = busyWidgetId === w.id;
            const jumpUrl = `https://discord.com/channels/${w.guildId}/${w.channelId}/${w.messageId}`;
            return (
              <div
                key={w.id}
                className="flex flex-col gap-3 rounded-lg border border-border bg-zinc-950/85 p-3.5 @3xl/main:flex-row @3xl/main:items-center @3xl/main:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-white">
                      <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                      {channelObj ? channelObj.name : w.channelId}
                    </span>
                    <Badge
                      variant={
                        w.lastSyncStatus === "error"
                          ? "destructive"
                          : w.lastSyncStatus === "skipped"
                            ? "secondary"
                            : "success"
                      }
                    >
                      {w.lastSyncStatus === "error"
                        ? "Sync Error"
                        : w.lastSyncStatus === "skipped"
                          ? "Up to Date"
                          : "Synced"}
                    </Badge>
                    {!channelObj && !server.controlsError && (
                      <Badge variant="warning">Channel Missing</Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground tabular-nums">
                    Last synced:{" "}
                    {w.lastSyncedAt
                      ? formatLocalDateTime(w.lastSyncedAt)
                      : formatLocalDateTime(w.deployedAt)}
                    {w.deployedByUsername ? ` • Deployed by ${w.deployedByUsername}` : ""}
                  </p>
                  {w.lastSyncError && (
                    <p className="text-[11px] text-red-300">{w.lastSyncError}</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={w.templateId || "default"}
                    disabled={busy || templateMutation.isPending}
                    onValueChange={(tplId) => {
                      setBusyWidgetId(w.id);
                      templateMutation.mutate({ widgetId: w.id, templateId: tplId });
                    }}
                  >
                    <SelectTrigger className="h-8 w-44 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {templateOptions.map((tpl) => (
                        <SelectItem key={tpl.id} value={tpl.id}>
                          {tpl.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <a
                    href={jumpUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-secondary px-2.5 text-xs font-medium text-zinc-200 transition hover:bg-zinc-800 hover:text-white"
                  >
                    Open
                    <ExternalLink className="h-3 w-3" />
                  </a>

                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy || refreshMutation.isPending}
                    onClick={() => {
                      setBusyWidgetId(w.id);
                      refreshMutation.mutate(w.id);
                    }}
                    className="h-8 px-2.5 text-xs"
                  >
                    {busy && refreshMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    Refresh
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    disabled={server.channels.length < 2}
                    onClick={() => {
                      setMoveTarget(w);
                      setMoveChannelId(w.channelId);
                    }}
                    className="h-8 px-2.5 text-xs"
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5" />
                    Move
                  </Button>

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDeleteTarget(w)}
                    className="h-8 px-2.5 text-xs text-red-400 hover:bg-red-950/40 hover:text-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Preview & Confirm Deploy Modal */}
      <Dialog open={deployOpen} onOpenChange={setDeployOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto thin-scrollbar">
          <DialogHeader>
            <DialogTitle>Preview &amp; Deploy Live Status Widget — {server.name}</DialogTitle>
            <DialogDescription>
              Choose the destination channel and template preset. Nothing will be posted publicly until
              you confirm deployment.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 @xl/main:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Destination Channel</Label>
                <Select value={deployChannelId} onValueChange={setDeployChannelId}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Choose writable channel" />
                  </SelectTrigger>
                  <SelectContent>
                    {server.channels.map((ch) => (
                      <SelectItem key={ch.id} value={ch.id}>
                        #{ch.name}
                        {ch.permissionsChecked && ch.writable === false
                          ? ` — Missing: ${(ch.missingPermissions || []).join(", ") || "Permissions"}`
                          : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Widget Template Preset</Label>
                <Select value={deployTemplateId} onValueChange={setDeployTemplateId}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {templateOptions.map((tpl) => (
                      <SelectItem key={tpl.id} value={tpl.id}>
                        {tpl.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {deployChannelBlocked && selectedDeployChannel && (
              <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-950/35 p-3 text-xs text-red-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                <div>
                  <p className="font-semibold">
                    Bot lacks required permissions in #{selectedDeployChannel.name}
                  </p>
                  <p className="mt-0.5 text-[11px]">
                    Missing: {(selectedDeployChannel.missingPermissions || []).join(", ")}. Grant these permissions in Discord Channel Settings before deploying.
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Live Widget Embed Preview</Label>
              <WidgetPreviewCard
                template={selectedDeployTemplate}
                listings={previewListings}
                monitorStatus={monitorStatus}
                portalOrigin={publicOrigin}
              />
            </div>

            <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-zinc-950 p-3 text-xs text-zinc-200">
              <Checkbox
                checked={deployConfirmed}
                onCheckedChange={(v) => setDeployConfirmed(Boolean(v))}
              />
              <span>
                Confirm posting this public auto-updating widget into{" "}
                <strong>#{selectedDeployChannel?.name || "selected channel"}</strong> (no role
                mentions).
              </span>
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeployOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                !deployChannelId ||
                !deployConfirmed ||
                deployChannelBlocked ||
                deployMutation.isPending
              }
              onClick={() => deployMutation.mutate()}
            >
              {deployMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Deploying...
                </>
              ) : (
                "Post Status Widget"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move Widget Channel Modal */}
      <Dialog open={Boolean(moveTarget)} onOpenChange={(open) => !open && setMoveTarget(null)}>
        {moveTarget && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Move Status Widget Channel</DialogTitle>
              <DialogDescription>
                Posts a fresh live widget in the destination channel inside <strong>{server.name}</strong>{" "}
                and cleanly deletes the previous widget message.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label>Destination Channel</Label>
              <Select value={moveChannelId} onValueChange={setMoveChannelId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Choose channel" />
                </SelectTrigger>
                <SelectContent>
                  {server.channels.map((ch) => (
                    <SelectItem key={ch.id} value={ch.id}>
                      #{ch.name}
                      {ch.permissionsChecked && ch.writable === false
                        ? ` — Missing: ${(ch.missingPermissions || []).join(", ") || "Permissions"}`
                        : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {moveChannelBlocked && selectedMoveChannel && (
                <p className="text-[11px] text-red-300">
                  Missing permissions in #{selectedMoveChannel.name}:{" "}
                  {(selectedMoveChannel.missingPermissions || []).join(", ")}.
                </p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setMoveTarget(null)}>
                Cancel
              </Button>
              <Button
                disabled={
                  !moveChannelId ||
                  moveChannelId === moveTarget.channelId ||
                  moveChannelBlocked ||
                  moveMutation.isPending
                }
                onClick={() =>
                  moveMutation.mutate({ widgetId: moveTarget.id, channelId: moveChannelId })
                }
              >
                {moveMutation.isPending ? "Moving..." : "Move Widget"}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        {deleteTarget && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remove Live Status Widget</DialogTitle>
              <DialogDescription>
                Deletes the Discord widget message (if still present) and stops automatic updates for
                that channel in <strong>{server.name}</strong>.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
              >
                {deleteMutation.isPending ? "Removing..." : "Confirm Remove"}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function ServerConfigPanel({
  server,
  widgetDefault,
  widgetTemplates,
  previewListings,
  monitorStatus,
  publicOrigin,
  onSaved,
}: {
  server: ManagedServer;
  widgetDefault: WidgetTemplateConfig;
  widgetTemplates: WidgetTemplateConfig[];
  previewListings: ListingItem[];
  monitorStatus: MonitorStatus | null;
  publicOrigin?: string;
  onSaved: () => void;
}) {
  const [panelTab, setPanelTab] = useState("settings");
  const [channelId, setChannelId] = useState(server.config.channelId || "");
  const [roleIds, setRoleIds] = useState<string[]>(server.config.roleIds || []);
  const [channelSearch, setChannelSearch] = useState("");
  const [roleSearch, setRoleSearch] = useState("");

  useEffect(() => {
    setChannelId(server.config.channelId || "");
    setRoleIds(server.config.roleIds || []);
  }, [server.config.channelId, server.config.roleIds]);

  const isDirty = useMemo(() => {
    if (channelId !== (server.config.channelId || "")) return true;
    const savedSorted = [...(server.config.roleIds || [])].sort().join(",");
    const currSorted = [...roleIds].sort().join(",");
    return savedSorted !== currSorted;
  }, [channelId, roleIds, server.config.channelId, server.config.roleIds]);

  const filteredChannels = useMemo(() => {
    const q = channelSearch.trim().toLowerCase();
    return server.channels.filter((c) => !q || c.name.toLowerCase().includes(q));
  }, [channelSearch, server.channels]);

  const filteredRoles = useMemo(() => {
    const q = roleSearch.trim().toLowerCase();
    return server.roles.filter((r) => !q || r.name.toLowerCase().includes(q));
  }, [roleSearch, server.roles]);

  const selectedRoleObjects = useMemo(
    () => server.roles.filter((r) => roleIds.includes(r.id)),
    [roleIds, server.roles]
  );

  const selectedChannelObj = useMemo(
    () => server.channels.find((c) => c.id === channelId),
    [channelId, server.channels]
  );
  const selectedChannelBlocked = Boolean(
    selectedChannelObj?.permissionsChecked && selectedChannelObj.writable === false
  );

  const saveMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean }>(`/api/dashboard/servers/${server.id}`, {
        method: "PUT",
        body: JSON.stringify({ channelId, roleIds }),
      }),
    onSuccess: () => {
      toast.success(`Saved settings for ${server.name}`);
      onSaved();
    },
    onError: (err: Error) => {
      const apiErr = err as ApiError;
      toast.error(
        apiErr?.remediation
          ? `${apiErr.message} ${apiErr.remediation}`
          : err.message || "Failed to save server configuration."
      );
    },
  });

  const testMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean }>(`/api/dashboard/servers/${server.id}/test`, {
        method: "POST",
      }),
    onSuccess: () => {
      toast.success(`Test notification delivered to ${server.name} without role mentions.`);
    },
    onError: (err: Error) => {
      const apiErr = err as ApiError;
      toast.error(
        apiErr?.remediation
          ? `${apiErr.message} ${apiErr.remediation}`
          : err.message || "Could not send test notification."
      );
    },
  });

  const toggleRole = (id: string) => {
    setRoleIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  return (
    <div className="border-t border-border bg-zinc-900/50 p-4 sm:p-5 space-y-6">
      <Tabs value={panelTab} onValueChange={setPanelTab}><TabsList className="h-auto flex-wrap"><TabsTrigger value="settings">Channel & roles</TabsTrigger><TabsTrigger value="customizations">Customizations</TabsTrigger><TabsTrigger value="widgets">Widgets</TabsTrigger></TabsList>
      <TabsContent value="customizations"><ServerCustomizationsPanel server={server} onSaved={onSaved} /></TabsContent>
      <TabsContent value="settings" className="space-y-4">
      {server.controlsError && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/35 bg-amber-950/40 p-3 text-xs text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div>
            Could not load channels or roles from Discord ({server.controlsError}). Ensure the bot has
            permissions in this server.
          </div>
        </div>
      )}

      {(server.config.channelMissing || server.config.channelPermissionError) && (
        <div className="flex items-start gap-2.5 rounded-lg border border-red-500/35 bg-red-950/40 p-3 text-xs text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <div className="space-y-1">
            {server.config.channelMissing ? (
              <p>
                The previously saved notification channel is missing or deleted in Discord. Choose
                another channel below.
              </p>
            ) : (
              <>
                <p className="font-semibold text-red-100">
                  Saved Channel Missing Bot Permissions
                  {server.config.channelName ? ` (#${server.config.channelName})` : ""}
                </p>
                {server.config.channelMissingPermissions &&
                  server.config.channelMissingPermissions.length > 0 && (
                    <p>
                      Missing permissions:{" "}
                      <strong className="text-white">
                        {server.config.channelMissingPermissions.join(", ")}
                      </strong>
                    </p>
                  )}
                {server.config.channelRemediation && (
                  <p className="text-[11px] text-red-200/90">{server.config.channelRemediation}</p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-6 @3xl/main:grid-cols-2">
        {/* Notification Channel Selection */}
        <div className="space-y-3">
          <div>
            <Label className="text-sm font-semibold text-white">Notification Channel</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Choose where new limited drop notifications will be posted.
            </p>
          </div>

          {server.channels.length > 6 && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={channelSearch}
                onChange={(e) => setChannelSearch(e.target.value)}
                placeholder="Filter text channels..."
                className="h-9 pl-8 text-xs"
              />
            </div>
          )}

          <div className="thin-scrollbar max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border bg-zinc-950 p-2">
            {filteredChannels.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">
                No accessible text or announcement channels found.
              </p>
            ) : (
              filteredChannels.map((channel) => {
                const selected = channel.id === channelId;
                const lacksPerms = channel.permissionsChecked && channel.writable === false;
                return (
                  <button
                    key={channel.id}
                    type="button"
                    onClick={() => setChannelId(channel.id)}
                    className={cn(
                      "flex w-full flex-wrap items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-xs transition cursor-pointer",
                      selected
                        ? lacksPerms
                          ? "bg-red-950/40 font-semibold text-red-100 border border-red-500/40"
                          : "bg-zinc-800/90 font-semibold text-white border border-zinc-600"
                        : lacksPerms
                          ? "text-zinc-400 hover:bg-red-950/20 border border-transparent"
                          : "text-zinc-300 hover:bg-secondary border border-transparent"
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2 truncate">
                      <Hash className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{channel.name}</span>
                    </span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {lacksPerms && (
                        <Badge variant="destructive" className="text-[10px]">
                          Missing:{" "}
                          {(channel.missingPermissions || []).join(", ") || "Permissions"}
                        </Badge>
                      )}
                      {selected && <span className="text-[11px] text-zinc-300">Selected</span>}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {selectedChannelBlocked && selectedChannelObj && (
            <div className="rounded-lg border border-red-500/35 bg-red-950/35 p-3 text-[11px] text-red-200">
              <strong>Cannot save #{selectedChannelObj.name}:</strong> Bot is missing{" "}
              {(selectedChannelObj.missingPermissions || []).join(", ")}. Grant those permissions in
              Discord Channel Settings or pick a writable channel above.
            </div>
          )}
        </div>

        {/* Notification Roles Selection */}
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <Label className="text-sm font-semibold text-white">Notification Roles</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Select roles to mention on new limited drops (optional — zero roles is valid).
              </p>
            </div>
            {roleIds.length > 0 && (
              <button
                type="button"
                onClick={() => setRoleIds([])}
                className="text-xs font-medium text-muted-foreground hover:text-white cursor-pointer"
              >
                Clear All
              </button>
            )}
          </div>

          {selectedRoleObjects.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedRoleObjects.map((role) => (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => toggleRole(role.id)}
                  className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-100 hover:bg-zinc-700 cursor-pointer"
                >
                  @{role.name}
                  <X className="h-3 w-3" />
                </button>
              ))}
            </div>
          )}

          {server.roles.length > 6 && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={roleSearch}
                onChange={(e) => setRoleSearch(e.target.value)}
                placeholder="Filter assignable roles..."
                className="h-9 pl-8 text-xs"
              />
            </div>
          )}

          <div className="thin-scrollbar max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border bg-zinc-950 p-2">
            {filteredRoles.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">
                No assignable roles were returned by Discord. Notifications will still post without role mentions.
              </p>
            ) : (
              filteredRoles.map((role) => {
                const checked = roleIds.includes(role.id);
                return (
                  <label
                    key={role.id}
                    onClick={(e) => {
                      e.preventDefault();
                      toggleRole(role.id);
                    }}
                    className={cn(
                      "flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-xs transition",
                      checked ? "bg-zinc-800/80 text-white" : "text-zinc-300 hover:bg-secondary"
                    )}
                  >
                    <span className="truncate">@{role.name}</span>
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleRole(role.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </label>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Footer Save & Test Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <div className="flex items-center gap-3">
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={!channelId || !isDirty || selectedChannelBlocked || saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Settings"
            )}
          </Button>
          {isDirty && !selectedChannelBlocked && (
            <span className="text-xs font-medium text-amber-300">Unsaved changes</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={
              !server.config.channelId ||
              Boolean(server.config.channelMissing) ||
              Boolean(server.config.channelPermissionError) ||
              isDirty ||
              testMutation.isPending
            }
            onClick={() => testMutation.mutate()}
          >
            {testMutation.isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-3.5 w-3.5" />
                Send Test Notification
              </>
            )}
          </Button>
          <a
            href={server.inviteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-white"
          >
            Permissions
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      </TabsContent><TabsContent value="widgets">
      <ServerWidgetsSection
        server={server}
        widgetDefault={widgetDefault}
        widgetTemplates={widgetTemplates}
        previewListings={previewListings}
        monitorStatus={monitorStatus}
        publicOrigin={publicOrigin}
        onMutated={onSaved}
      />
      </TabsContent></Tabs>
    </div>
  );
}

export function DashboardPage() {
  const queryClient = useQueryClient();
  const { startLogin, isLoggingIn } = useAuthActions();
  const { data: session } = useSession();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "setup_required" | "not_installed">("all");
  const [expandedGuildId, setExpandedGuildId] = useState<string | null>(null);

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ["dashboard-servers"],
    queryFn: () => apiFetch<DashboardServersResponse>("/api/dashboard/servers"),
  });

  const servers = data?.servers || [];
  const counts = useMemo(() => {
    return {
      total: servers.length,
      active: servers.filter((s) => s.status === "active").length,
      setupRequired: servers.filter((s) => s.status === "setup_required").length,
      notInstalled: servers.filter((s) => s.status === "not_installed").length,
    };
  }, [servers]);

  const filteredServers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return servers.filter((server) => {
      if (filter === "active" && server.status !== "active") return false;
      if (filter === "setup_required" && server.status !== "setup_required") return false;
      if (filter === "not_installed" && server.status !== "not_installed") return false;
      if (q && !server.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [filter, search, servers]);

  const refreshLive = async () => {
    try {
      const refreshed = await apiFetch<DashboardServersResponse>("/api/dashboard/servers?refresh=1");
      queryClient.setQueryData(["dashboard-servers"], refreshed);
      toast.success("Server status refreshed from Discord");
    } catch {
      void startLogin({ refresh: true });
    }
  };

  return (
    <AppShell
      title="Your Managed Discord Servers"
      description="Configure alert channels and optional notification roles for Discord servers you manage."
      actions={
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-sky-500/35 bg-sky-500/15 px-2.5 py-1.5 text-xs font-semibold text-sky-300">
            <Shield className="h-3.5 w-3.5" />
            Server Manager
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void refreshLive()}
            disabled={isFetching || isLoggingIn}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
            Refresh Server List
          </Button>
        </div>
      }
    >
      {session?.user && (
        <Card className="mb-6 overflow-hidden border-zinc-800 bg-zinc-950 p-0">
          <div
            className={cn(
              "relative h-24 overflow-hidden sm:h-28",
              session.user.profile?.accentColor
                ? "bg-zinc-900"
                : "bg-gradient-to-br from-zinc-700/70 via-zinc-900 to-zinc-950"
            )}
            style={
              session.user.profile?.accentColor
                ? { backgroundColor: session.user.profile.accentColor }
                : undefined
            }
          >
            {session.user.profile?.bannerUrl && (
              <img
                src={session.user.profile.bannerUrl}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-zinc-950/75 via-zinc-950/30 to-transparent" />
          </div>
          <div className="flex flex-col gap-3 px-4 pb-4 sm:flex-row sm:items-end sm:gap-4">
            <DiscordProfileAvatar
              avatarUrl={session.user.avatarUrl}
              decorationUrl={session.user.profile?.avatarDecorationUrl}
              alt={session.user.profile?.globalName || session.user.username}
              className="-mt-8 h-20 w-20 rounded-full bg-zinc-950 sm:-mt-10 sm:h-24 sm:w-24"
            />
            <div className="min-w-0 flex-1 pb-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-lg font-semibold text-white">
                  {session.user.profile?.globalName || session.user.username}
                </h2>
                {session.user.isAdmin ? (
                  <BotCreatorBadge />
                ) : (
                  <Badge variant="outline" className="border-zinc-700 bg-zinc-900 text-zinc-300">
                    Server Manager
                  </Badge>
                )}
              </div>
              <p className="mt-0.5 truncate font-mono text-xs text-zinc-400">
                @{session.user.username}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <DiscordNameplateChip nameplate={session.user.profile?.nameplate} />
                <DiscordPrimaryGuildTag primaryGuild={session.user.profile?.primaryGuild} />
              </div>
            </div>
            <a
              href={`https://discord.com/users/${session.user.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-100 transition hover:border-zinc-600 hover:bg-zinc-800 sm:w-auto"
            >
              Open Discord Profile
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </Card>
      )}

      {/* Compact Overview Strip */}
      <div className="mb-6 grid gap-4 @xl/main:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs font-medium text-muted-foreground">Managed Servers</p>
          <p className="mt-1 text-2xl font-bold text-white tabular-nums">{counts.total}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-muted-foreground">Active &amp; Configured</p>
          <p className="mt-1 text-2xl font-bold text-emerald-400 tabular-nums">{counts.active}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-muted-foreground">Setup Required</p>
          <p className="mt-1 text-2xl font-bold text-amber-400 tabular-nums">
            {counts.setupRequired}
          </p>
        </Card>
      </div>

      {/* Filter & Search Bar */}
      <div className="mb-5 flex flex-col gap-3 @3xl/main:flex-row @3xl/main:items-center @3xl/main:justify-between">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
          <TabsList>
            <TabsTrigger value="all">All ({counts.total})</TabsTrigger>
            <TabsTrigger value="active">Active ({counts.active})</TabsTrigger>
            <TabsTrigger value="setup_required">Setup Required ({counts.setupRequired})</TabsTrigger>
            <TabsTrigger value="not_installed">Not Installed ({counts.notInstalled})</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search servers by name..."
            className="pl-9"
          />
        </div>
      </div>

      {/* Server Cards */}
      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((s) => (
            <Skeleton key={s} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-red-400">{(error as Error)?.message}</p>
          <Button variant="secondary" size="sm" className="mt-4" onClick={() => void refetch()}>
            Retry
          </Button>
        </Card>
      ) : filteredServers.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-sm text-muted-foreground">
            {servers.length === 0
              ? "No Discord servers found with Manage Server or Administrator permissions."
              : "No servers match your current filter."}
          </p>
          {servers.length === 0 && (
            <Button variant="outline" size="sm" className="mt-4" onClick={() => void startLogin({ refresh: true })}>
              Re-sync Discord Permissions
            </Button>
          )}
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredServers.map((server) => {
            const isExpanded = expandedGuildId === server.id;
            return (
              <Card key={server.id} className="overflow-hidden">
                <div className="flex flex-col gap-4 p-4 @2xl/main:flex-row @2xl/main:items-center @2xl/main:justify-between">
                  <div className="flex items-center gap-3.5 min-w-0">
                    {server.iconUrl ? (
                      <img
                        src={server.iconUrl}
                        alt={server.name}
                        className="h-11 w-11 shrink-0 rounded-xl border border-white/10"
                      />
                    ) : (
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-secondary text-sm font-bold text-white">
                        {server.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-base font-semibold text-white">{server.name}</h3>
                        <ServerStatusIndicator status={server.status} />
                        {server.config.channelPermissionError && (
                          <Badge variant="destructive" className="text-[10px]">
                            Missing Perms:{" "}
                            {(server.config.channelMissingPermissions || []).join(", ") ||
                              "Check Channel"}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {server.isInstalled ? (
                          <>
                            <span>
                              Notification Channel:{" "}
                              <strong className="font-medium text-zinc-200">
                                {server.config.channelName
                                  ? `#${server.config.channelName}`
                                  : "Not configured"}
                              </strong>
                            </span>
                            <span>
                              Mention Roles:{" "}
                              <strong className="font-medium text-zinc-200">
                                {server.config.roleIds.length > 0
                                  ? `${server.config.roleIds.length} selected`
                                  : "None"}
                              </strong>
                            </span>
                            <span>
                              Live Widgets:{" "}
                              <strong className="font-medium text-zinc-200">
                                {(server.widgets?.length || 0) > 0
                                  ? `${server.widgets.length} active`
                                  : "None"}
                              </strong>
                            </span>
                          </>
                        ) : (
                          <span>{server.statusReason}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {server.isInstalled ? (
                      <Button
                        variant={isExpanded ? "outline" : "secondary"}
                        size="sm"
                        onClick={() =>
                          setExpandedGuildId((curr) => (curr === server.id ? null : server.id))
                        }
                      >
                        Manage Settings
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    ) : (
                      <Button variant="secondary" size="sm" asChild>
                        <a href={server.inviteUrl} target="_blank" rel="noopener noreferrer">
                          Invite Bot
                        </a>
                      </Button>
                    )}
                  </div>
                </div>

                {server.isInstalled && isExpanded && (
                  <ServerConfigPanel
                    server={server}
                    widgetDefault={data?.widgetDefault || DEFAULT_WIDGET_TEMPLATE}
                    widgetTemplates={data?.widgetTemplates || []}
                    previewListings={data?.previewListings || []}
                    monitorStatus={data?.monitorStatus || null}
                    publicOrigin={data?.publicOrigin}
                    onSaved={() => void queryClient.invalidateQueries({ queryKey: ["dashboard-servers"] })}
                  />
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Subtle Quick Setup Guidance */}
      <div className="mt-6 rounded-xl border border-border bg-card/60 p-4 text-xs text-muted-foreground">
        <span className="font-semibold text-zinc-200">Quick Setup:</span> After adding the bot to a
        Discord server, you can run{" "}
        <code className="select-all cursor-text rounded border border-border bg-zinc-950 px-1.5 py-0.5 font-mono text-zinc-200">
          /setup #your-channel
        </code>{" "}
        or{" "}
        <code className="select-all cursor-text rounded border border-border bg-zinc-950 px-1.5 py-0.5 font-mono text-zinc-200">
          /widget
        </code>{" "}
        inside Discord, or deploy widgets directly from any server panel above.
      </div>
    </AppShell>
  );
}
