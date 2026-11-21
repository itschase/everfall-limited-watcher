import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowRightLeft,
  CheckCircle2,
  ExternalLink,
  History,
  LayoutPanelTop,
  Loader2,
  Palette,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AdminWidgetsResponse, apiFetch, ApiError, WidgetDeployment } from "@/lib/api";
import { formatLocalDateTime, formatLocalTime } from "@/lib/utils";
import { ADMIN_OVERVIEW_KEY } from "./useAdminOverview";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const ADMIN_WIDGETS_KEY = ["admin-widgets"] as const;

export function AdminWidgetsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isFetching, refetch } = useQuery<AdminWidgetsResponse>({
    queryKey: ADMIN_WIDGETS_KEY,
    queryFn: () => apiFetch<AdminWidgetsResponse>("/api/admin/widgets"),
  });

  const [deployOpen, setDeployOpen] = useState(false);
  const [deployGuildId, setDeployGuildId] = useState("");
  const [deployChannelId, setDeployChannelId] = useState("");
  const [deployTemplateId, setDeployTemplateId] = useState("default");
  const [deployConfirmed, setDeployConfirmed] = useState(false);

  const [moveTarget, setMoveTarget] = useState<WidgetDeployment | null>(null);
  const [moveChannelId, setMoveChannelId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<WidgetDeployment | null>(null);
  const [historyTarget, setHistoryTarget] = useState<WidgetDeployment | null>(null);
  const [busyWidgetId, setBusyWidgetId] = useState<string | null>(null);

  const widgets = data?.widgets || [];
  const guilds = data?.guilds || [];
  const guildMap = useMemo(() => new Map(guilds.map((g) => [g.id, g])), [guilds]);

  const templateOptions = useMemo(() => {
    const out = [{ id: "default", name: data?.widgetDefault?.name || "Default Global Widget" }];
    for (const tpl of data?.widgetTemplates || []) {
      out.push({ id: tpl.id, name: tpl.name });
    }
    return out;
  }, [data?.widgetDefault, data?.widgetTemplates]);

  const selectedDeployGuild = guildMap.get(deployGuildId);
  const selectedMoveGuild = moveTarget ? guildMap.get(moveTarget.guildId) : undefined;

  const selectedDeployChannel = selectedDeployGuild?.channels.find(
    (c) => c.id === deployChannelId
  );
  const deployChannelBlocked = Boolean(
    selectedDeployChannel?.permissionsChecked && selectedDeployChannel.writable === false
  );
  const selectedMoveChannel = selectedMoveGuild?.channels.find((c) => c.id === moveChannelId);
  const moveChannelBlocked = Boolean(
    selectedMoveChannel?.permissionsChecked && selectedMoveChannel.writable === false
  );

  const formatApiErr = (err: Error, fallback: string) => {
    const apiErr = err as ApiError;
    return apiErr?.remediation ? `${apiErr.message} ${apiErr.remediation}` : err.message || fallback;
  };

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ADMIN_WIDGETS_KEY });
    void queryClient.invalidateQueries({ queryKey: ADMIN_OVERVIEW_KEY });
  };

  const refreshAllMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean; refreshed: number; skipped: number; failed: number }>(
        "/api/admin/widgets/refresh",
        { method: "POST", body: JSON.stringify({ force: true }) }
      ),
    onSuccess: (res) => {
      invalidateAll();
      if (res.refreshed === 0 && res.failed > 0) {
        toast.error(`Failed to refresh ${res.failed} widget(s). Inspect widget sync errors below.`);
      } else if (res.failed > 0) {
        toast.warning(
          `Refreshed ${res.refreshed} widget(s), ${res.failed} failed${res.skipped ? `, ${res.skipped} up to date` : ""}.`
        );
      } else {
        toast.success(
          `Refreshed ${res.refreshed} widget(s)${res.skipped ? ` (${res.skipped} already up to date)` : ""}.`
        );
      }
    },
    onError: (err: Error) => toast.error(formatApiErr(err, "Failed to refresh widgets.")),
  });

  const refreshSingleMutation = useMutation({
    mutationFn: (widgetId: string) =>
      apiFetch<{ ok: boolean }>(`/api/admin/widgets/${encodeURIComponent(widgetId)}/refresh`, {
        method: "POST",
      }),
    onSuccess: () => {
      setBusyWidgetId(null);
      invalidateAll();
      toast.success("Status widget updated on Discord.");
    },
    onError: (err: Error) => {
      setBusyWidgetId(null);
      invalidateAll();
      toast.error(formatApiErr(err, "Failed to update widget."));
    },
  });

  const deployMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean; jumpUrl?: string }>("/api/admin/widgets/deploy", {
        method: "POST",
        body: JSON.stringify({
          guildId: deployGuildId,
          channelId: deployChannelId,
          templateId: deployTemplateId,
        }),
      }),
    onSuccess: () => {
      setDeployOpen(false);
      setDeployConfirmed(false);
      setDeployChannelId("");
      invalidateAll();
      toast.success("Deployed live status widget to Discord channel.");
    },
    onError: (err: Error) => {
      toast.error(formatApiErr(err, "Failed to deploy status widget."));
    },
  });

  const moveMutation = useMutation({
    mutationFn: ({ widgetId, channelId }: { widgetId: string; channelId: string }) =>
      apiFetch<{ ok: boolean }>(`/api/admin/widgets/${encodeURIComponent(widgetId)}/move`, {
        method: "POST",
        body: JSON.stringify({ channelId }),
      }),
    onSuccess: () => {
      setMoveTarget(null);
      setMoveChannelId("");
      invalidateAll();
      toast.success("Moved live status widget to target channel.");
    },
    onError: (err: Error) => toast.error(formatApiErr(err, "Failed to move widget.")),
  });

  const assignTemplateMutation = useMutation({
    mutationFn: ({ widgetId, templateId }: { widgetId: string; templateId: string }) =>
      apiFetch<{ ok: boolean; error?: string | null }>(
        `/api/admin/widgets/${encodeURIComponent(widgetId)}/template`,
        {
          method: "PUT",
          body: JSON.stringify({ templateId }),
        }
      ),
    onSuccess: (res) => {
      setBusyWidgetId(null);
      invalidateAll();
      if (res.ok === false) {
        toast.error(res.error || "Saved template preset, but Discord sync failed.");
      } else {
        toast.success("Updated widget template & synced message.");
      }
    },
    onError: (err: Error) => {
      setBusyWidgetId(null);
      toast.error(formatApiErr(err, "Failed to assign template."));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (widgetId: string) =>
      apiFetch<{ ok: boolean }>(`/api/admin/widgets/${encodeURIComponent(widgetId)}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      setDeleteTarget(null);
      invalidateAll();
      toast.success("Deleted status widget from Discord & registry.");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to remove widget."),
  });

  return (
    <AppShell
      requireAdmin
      title="Status Widgets"
      description="Manage multi-channel live /widget embeds across connected Discord servers, inspect sync history, switch presets, and deploy new widgets with confirmation."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/embeds">
              <Palette className="h-3.5 w-3.5" />
              Edit Templates
            </Link>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Reload
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={widgets.length === 0 || refreshAllMutation.isPending}
            onClick={() => refreshAllMutation.mutate()}
          >
            {refreshAllMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Refresh All ({widgets.length})
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setDeployConfirmed(false);
              if (!deployGuildId && guilds.length > 0) setDeployGuildId(guilds[0].id);
              setDeployOpen(true);
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Deploy Widget
          </Button>
        </div>
      }
    >
      {isLoading || !data ? (
        <div className="space-y-4">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary */}
          <div className="grid gap-4 @xl/main:grid-cols-3">
            <Card className="p-5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Deployed Widgets</span>
                <LayoutPanelTop className="h-4 w-4 text-zinc-400" />
              </div>
              <p className="mt-2 text-2xl font-bold text-white tabular-nums">{widgets.length}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Multi-channel deployments across {new Set(widgets.map((w) => w.guildId)).size} server(s)
              </p>
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Healthy Syncs</span>
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              </div>
              <p className="mt-2 text-2xl font-bold text-white tabular-nums">
                {widgets.filter((w) => w.lastSyncStatus !== "error").length}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Hash-deduplicated to avoid redundant edits
              </p>
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Sync Errors</span>
                <AlertCircle className="h-4 w-4 text-zinc-400" />
              </div>
              <p className="mt-2 text-2xl font-bold text-white tabular-nums">
                {widgets.filter((w) => w.lastSyncStatus === "error").length}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Channels missing permissions or deleted messages
              </p>
            </Card>
          </div>

          {/* Deployments Table */}
          <Card>
            <CardHeader>
              <CardTitle>Active Widget Deployments</CardTitle>
              <CardDescription>
                Each widget is strictly scoped to its target channel. Re-syncs happen automatically when monitor status, stock, images, or metadata changes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {widgets.length === 0 ? (
                <div className="rounded-lg border border-border bg-zinc-950/60 p-8 text-center text-xs text-muted-foreground">
                  No status widgets have been deployed yet. Admins can run <code>/widget</code> in Discord or click <strong>Deploy Widget</strong> above.
                </div>
              ) : (
                <>
                  {/* Mobile Widget Cards */}
                  <div className="space-y-3 @3xl/main:hidden">
                    {widgets.map((w) => {
                      const guild = guildMap.get(w.guildId);
                      const channelName = guild?.channels.find((c) => c.id === w.channelId)?.name;
                      const busy = busyWidgetId === w.id;
                      const jumpUrl = `https://discord.com/channels/${w.guildId}/${w.channelId}/${w.messageId}`;
                      return (
                        <div
                          key={w.id}
                          className="space-y-3 rounded-lg border border-border bg-zinc-950/75 p-3.5 text-xs"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-white">
                                {guild?.name || `Server ${w.guildId}`}
                              </p>
                              <p className="mt-0.5 truncate select-text font-mono text-[11px] text-muted-foreground">
                                {channelName ? `#${channelName}` : `Ch ${w.channelId}`} &bull; Msg {w.messageId.slice(-6)}
                              </p>
                            </div>
                            <Badge
                              variant={
                                w.lastSyncStatus === "error"
                                  ? "destructive"
                                  : w.lastSyncStatus === "skipped"
                                    ? "secondary"
                                    : "success"
                              }
                              className="shrink-0"
                            >
                              {w.lastSyncStatus === "error"
                                ? "Error"
                                : w.lastSyncStatus === "skipped"
                                  ? "Up to Date"
                                  : "Synced"}
                            </Badge>
                          </div>

                          {w.lastSyncError && (
                            <p className="break-words text-[11px] text-red-300">{w.lastSyncError}</p>
                          )}

                          <div className="space-y-1">
                            <Label className="text-[11px] text-muted-foreground">Template Preset</Label>
                            <Select
                              value={w.templateId || "default"}
                              disabled={busy || assignTemplateMutation.isPending}
                              onValueChange={(tplId) => {
                                setBusyWidgetId(w.id);
                                assignTemplateMutation.mutate({ widgetId: w.id, templateId: tplId });
                              }}
                            >
                              <SelectTrigger className="h-8 w-full text-xs">
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

                          <div className="flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
                            <span>Last sync:</span>
                            <span>
                              {w.lastSyncedAt
                                ? formatLocalTime(w.lastSyncedAt)
                                : formatLocalTime(w.deployedAt)}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 border-t border-border/70 pt-2.5">
                            <a
                              href={jumpUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-secondary px-2 text-[11px] font-medium text-zinc-200 transition hover:bg-zinc-800 hover:text-white"
                            >
                              Open
                              <ExternalLink className="h-3 w-3" />
                            </a>
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={busy || refreshSingleMutation.isPending}
                              onClick={() => {
                                setBusyWidgetId(w.id);
                                refreshSingleMutation.mutate(w.id);
                              }}
                              className="h-7 px-2 text-[11px]"
                            >
                              {busy ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <RefreshCw className="h-3 w-3" />
                              )}
                              Refresh
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setMoveTarget(w);
                                setMoveChannelId(w.channelId);
                              }}
                              className="h-7 px-2 text-[11px]"
                            >
                              <ArrowRightLeft className="h-3 w-3" />
                              Move
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setHistoryTarget(w)}
                              aria-label="Sync History"
                              className="h-7 px-2 text-[11px]"
                            >
                              <History className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setDeleteTarget(w)}
                              aria-label="Remove Widget"
                              className="h-7 px-2 text-[11px] text-red-400 hover:bg-red-950/40 hover:text-red-300"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop Widget Table */}
                  <div className="hidden @3xl/main:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Server &amp; Channel</TableHead>
                          <TableHead>Template Preset</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Last Sync</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {widgets.map((w) => {
                          const guild = guildMap.get(w.guildId);
                          const channelName = guild?.channels.find((c) => c.id === w.channelId)?.name;
                          const busy = busyWidgetId === w.id;
                          const jumpUrl = `https://discord.com/channels/${w.guildId}/${w.channelId}/${w.messageId}`;
                          return (
                            <TableRow key={w.id}>
                              <TableCell>
                                <p className="font-semibold text-white">
                                  {guild?.name || `Server ${w.guildId}`}
                                </p>
                                <p className="select-text font-mono text-[11px] text-muted-foreground">
                                  {channelName ? `#${channelName}` : `Ch ${w.channelId}`} &bull; Msg{" "}
                                  {w.messageId.slice(-6)}
                                </p>
                              </TableCell>
                              <TableCell>
                                <Select
                                  value={w.templateId || "default"}
                                  disabled={busy || assignTemplateMutation.isPending}
                                  onValueChange={(tplId) => {
                                    setBusyWidgetId(w.id);
                                    assignTemplateMutation.mutate({ widgetId: w.id, templateId: tplId });
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
                              </TableCell>
                              <TableCell>
                                <div className="space-y-1">
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
                                      ? "Error"
                                      : w.lastSyncStatus === "skipped"
                                        ? "Up to Date"
                                        : "Synced"}
                                  </Badge>
                                  {w.lastSyncError && (
                                    <p className="max-w-[200px] truncate text-[11px] text-red-300">
                                      {w.lastSyncError}
                                    </p>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground tabular-nums">
                                {w.lastSyncedAt
                                  ? formatLocalTime(w.lastSyncedAt)
                                  : formatLocalTime(w.deployedAt)}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                                  <a
                                    href={jumpUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-secondary px-2 text-[11px] font-medium text-zinc-200 transition hover:bg-zinc-800 hover:text-white"
                                  >
                                    Open
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    disabled={busy || refreshSingleMutation.isPending}
                                    onClick={() => {
                                      setBusyWidgetId(w.id);
                                      refreshSingleMutation.mutate(w.id);
                                    }}
                                    className="h-7 px-2 text-[11px]"
                                  >
                                    {busy ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <RefreshCw className="h-3 w-3" />
                                    )}
                                    Refresh
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setMoveTarget(w);
                                      setMoveChannelId(w.channelId);
                                    }}
                                    className="h-7 px-2 text-[11px]"
                                  >
                                    <ArrowRightLeft className="h-3 w-3" />
                                    Move
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setHistoryTarget(w)}
                                    className="h-7 px-2 text-[11px]"
                                  >
                                    <History className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setDeleteTarget(w)}
                                    className="h-7 px-2 text-[11px] text-red-400 hover:bg-red-950/40 hover:text-red-300"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Deploy Widget Modal (Requires Explicit Confirmation) */}
      <Dialog open={deployOpen} onOpenChange={setDeployOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deploy Live Status Widget</DialogTitle>
            <DialogDescription>
              Select a server, target channel, and template preset. Nothing is posted until you confirm deployment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Connected Discord Server</Label>
              <Select
                value={deployGuildId}
                onValueChange={(gid) => {
                  setDeployGuildId(gid);
                  setDeployChannelId("");
                  setDeployConfirmed(false);
                }}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Choose server" />
                </SelectTrigger>
                <SelectContent>
                  {guilds.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name} ({g.channels.length} channels)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Target Discord Channel</Label>
              <Select value={deployChannelId} onValueChange={setDeployChannelId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Choose writable channel" />
                </SelectTrigger>
                <SelectContent>
                  {(selectedDeployGuild?.channels || []).map((ch) => (
                    <SelectItem key={ch.id} value={ch.id}>
                      #{ch.name}
                      {ch.permissionsChecked && ch.writable === false
                        ? ` — Missing: ${(ch.missingPermissions || []).join(", ") || "Permissions"}`
                        : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {deployChannelBlocked && selectedDeployChannel && (
                <p className="text-[11px] text-red-300">
                  Bot is missing{" "}
                  {(selectedDeployChannel.missingPermissions || []).join(", ")} in #
                  {selectedDeployChannel.name}. Grant these in Discord before deploying.
                </p>
              )}
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

            <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-zinc-950 p-3 text-xs text-zinc-200">
              <Checkbox
                checked={deployConfirmed}
                onCheckedChange={(v) => setDeployConfirmed(Boolean(v))}
              />
              <span>Confirm posting public status widget message into selected channel</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeployOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                !deployGuildId ||
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

      {/* Move Widget Modal */}
      <Dialog open={Boolean(moveTarget)} onOpenChange={(open) => !open && setMoveTarget(null)}>
        {moveTarget && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Move Status Widget</DialogTitle>
              <DialogDescription>
                Posts the live widget into a different channel in{" "}
                <strong className="text-white">
                  {selectedMoveGuild?.name || moveTarget.guildId}
                </strong>{" "}
                and deletes the old widget message cleanly.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label>Destination Channel</Label>
              <Select value={moveChannelId} onValueChange={setMoveChannelId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Choose channel" />
                </SelectTrigger>
                <SelectContent>
                  {(selectedMoveGuild?.channels || []).map((ch) => (
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

      {/* Sync History Modal */}
      <Dialog
        open={Boolean(historyTarget)}
        onOpenChange={(open) => !open && setHistoryTarget(null)}
      >
        {historyTarget && (
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Widget Sync History</DialogTitle>
              <DialogDescription className="font-mono text-xs">
                Widget ID: {historyTarget.id} &bull; Hash: {historyTarget.lastContentHash || "—"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-xs">
              <div className="rounded-lg border border-border bg-zinc-950 p-3 space-y-1">
                <p>
                  Deployed By:{" "}
                  <strong className="text-white">
                    {historyTarget.deployedByUsername || historyTarget.deployedBy || "Admin"}
                  </strong>
                </p>
                <p>Deployed At: {formatLocalDateTime(historyTarget.deployedAt)}</p>
                {historyTarget.lastSyncError && (
                  <p className="text-red-300">Last Error: {historyTarget.lastSyncError}</p>
                )}
              </div>
              <div className="max-h-60 space-y-1.5 overflow-y-auto pr-1 thin-scrollbar">
                {(historyTarget.history || []).length === 0 ? (
                  <p className="text-muted-foreground">No sync attempts recorded yet.</p>
                ) : (
                  (historyTarget.history || []).map((h, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-2 rounded-md border border-border bg-zinc-900/60 px-2.5 py-1.5"
                    >
                      <div>
                        <span className="font-mono text-[11px] text-zinc-200">{h.trigger}</span>
                        {h.error && <p className="text-[11px] text-red-300">{h.error}</p>}
                      </div>
                      <div className="text-right tabular-nums">
                        <Badge
                          variant={
                            h.status === "ok"
                              ? "success"
                              : h.status === "skipped"
                                ? "secondary"
                                : "destructive"
                          }
                        >
                          {h.status}
                        </Badge>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          {formatLocalTime(h.timestamp)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
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
                Deletes the Discord widget message (if present) and stops automatic updates for channel{" "}
                <code>{deleteTarget.channelId}</code>.
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
                {deleteMutation.isPending ? "Removing..." : "Confirm Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </AppShell>
  );
}
