import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Edit3,
  ExternalLink,
  History,
  LayoutPanelTop,
  Link2,
  Loader2,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  apiFetch,
  DeliveryLogEntry,
  RecoverExecuteResponse,
  RecoverPreviewResponse,
} from "@/lib/api";
import { formatLocalDateTime, formatLocalTime, safeExternalUrl } from "@/lib/utils";
import { ADMIN_OVERVIEW_KEY, useAdminOverview } from "./useAdminOverview";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function AdminDispatchPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useAdminOverview();
  const [logPage, setLogPage] = useState(1);
  const logPageSize = 40;
  const [selectedListingId, setSelectedListingId] = useState<string>("");
  // Explicitly unchecked by default per Issue #6
  const [selectedGuildIds, setSelectedGuildIds] = useState<string[]>([]);
  const [forceResend, setForceResend] = useState(false);
  const [includeRoleMentions, setIncludeRoleMentions] = useState(true);
  const [confirmMode, setConfirmMode] = useState<"publish" | "edit" | null>(null);
  const [inspectDelivery, setInspectDelivery] = useState<DeliveryLogEntry | null>(null);
  const [editingGuildId, setEditingGuildId] = useState<string | null>(null);
  const [removingWidgetGuildId, setRemovingWidgetGuildId] = useState<string | null>(null);

  // Recover Existing Embed dialog state
  const [recoverOpen, setRecoverOpen] = useState(false);
  const [recoverMessageRef, setRecoverMessageRef] = useState("");
  const [recoverGuildId, setRecoverGuildId] = useState("");
  const [recoverChannelId, setRecoverChannelId] = useState("");
  const [recoverListingId, setRecoverListingId] = useState("");
  const [recoverPreview, setRecoverPreview] = useState<RecoverPreviewResponse | null>(null);
  const [recoverError, setRecoverError] = useState<string | null>(null);
  const [recoverAllowOverwrite, setRecoverAllowOverwrite] = useState(false);
  const [recoverApplyTemplate, setRecoverApplyTemplate] = useState(true);

  const listings = data?.listings || [];
  const connectedGuilds = data?.connectedGuilds || [];
  const configuredGuilds = connectedGuilds.filter((g) => g.configured);
  const deployedWidgets = useMemo(
    () => connectedGuilds.filter((g) => Boolean(g.widget)),
    [connectedGuilds]
  );
  const selectedListing = listings.find((l) => l.id === selectedListingId) || listings[0];

  useEffect(() => {
    if (listings.length > 0 && !selectedListingId) {
      setSelectedListingId(listings[0].id);
    }
  }, [listings, selectedListingId]);

  const duplicateCount = selectedGuildIds.filter(
    (gid) => configuredGuilds.find((g) => g.id === gid)?.sentListingIds[selectedListing?.id || ""]
  ).length;

  const editableSelectedCount = selectedGuildIds.filter((gid) => {
    const guild = configuredGuilds.find((g) => g.id === gid);
    return Boolean(selectedListing && guild?.sentMessages?.[selectedListing.id]?.messageId);
  }).length;

  const dispatchMutation = useMutation({
    mutationFn: () =>
      apiFetch<{
        ok: boolean;
        deliveredCount: number;
        skippedCount: number;
        failedCount: number;
        deliveryLogs: DeliveryLogEntry[];
      }>("/api/admin/dispatch", {
        method: "POST",
        body: JSON.stringify({
          listingId: selectedListing?.id,
          guildIds: selectedGuildIds,
          forceResend,
          includeRoleMentions,
        }),
      }),
    onSuccess: (res) => {
      setConfirmMode(null);
      setSelectedGuildIds([]);
      void queryClient.invalidateQueries({ queryKey: ADMIN_OVERVIEW_KEY });
      toast.success(
        `Dispatch finished: ${res.deliveredCount} delivered, ${res.skippedCount} skipped (already sent), ${res.failedCount} failed.`
      );
    },
    onError: (err: Error) => {
      setConfirmMode(null);
      toast.error(err.message || "Dispatch failed.");
    },
  });

  const editEmbedMutation = useMutation({
    mutationFn: (payload: {
      listingId: string;
      guildIds: string[];
      overrideMessageId?: string;
      overrideChannelId?: string;
    }) =>
      apiFetch<{
        ok: boolean;
        updatedCount: number;
        skippedCount: number;
        failedCount: number;
        deliveryLogs: DeliveryLogEntry[];
      }>("/api/admin/dispatch/edit", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (res) => {
      setConfirmMode(null);
      setEditingGuildId(null);
      void queryClient.invalidateQueries({ queryKey: ADMIN_OVERVIEW_KEY });
      toast.success(
        `Embed update complete: ${res.updatedCount} updated in-place, ${res.skippedCount} skipped (no tracked message), ${res.failedCount} failed.`
      );
    },
    onError: (err: Error) => {
      setConfirmMode(null);
      setEditingGuildId(null);
      toast.error(err.message || "Failed to update deployed Discord embed.");
    },
  });

  const refreshWidgetsMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean; refreshed: number; failed: number }>("/api/admin/widgets/refresh", {
        method: "POST",
      }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ADMIN_OVERVIEW_KEY });
      toast.success(
        `Refreshed ${res.refreshed} deployed status widget(s)${res.failed ? ` (${res.failed} failed)` : ""}.`
      );
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to refresh live status widgets.");
    },
  });

  const removeWidgetMutation = useMutation({
    mutationFn: (guildId: string) =>
      apiFetch<{ ok: boolean }>(`/api/admin/widgets/${guildId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      setRemovingWidgetGuildId(null);
      void queryClient.invalidateQueries({ queryKey: ADMIN_OVERVIEW_KEY });
      toast.success("Removed status widget deployment from server registry.");
    },
    onError: (err: Error) => {
      setRemovingWidgetGuildId(null);
      toast.error(err.message || "Failed to remove widget.");
    },
  });

  const recoverPreviewMutation = useMutation({
    mutationFn: () =>
      apiFetch<RecoverPreviewResponse>("/api/admin/dispatch/recover/preview", {
        method: "POST",
        body: JSON.stringify({
          guildId: recoverGuildId,
          channelId: recoverChannelId.trim(),
          messageIdOrUrl: recoverMessageRef.trim(),
          listingId: recoverListingId,
        }),
      }),
    onSuccess: (res) => {
      setRecoverError(null);
      setRecoverPreview(res);
      setRecoverAllowOverwrite(false);
      if (res.preview?.channelId) {
        setRecoverChannelId(res.preview.channelId);
      }
      if (res.preview?.guildId) {
        setRecoverGuildId(res.preview.guildId);
      }
    },
    onError: (err: Error) => {
      setRecoverPreview(null);
      setRecoverError(err.message || "Failed to inspect Discord message.");
    },
  });

  const recoverExecuteMutation = useMutation({
    mutationFn: () =>
      apiFetch<RecoverExecuteResponse>("/api/admin/dispatch/recover", {
        method: "POST",
        body: JSON.stringify({
          guildId: recoverGuildId,
          channelId: recoverChannelId.trim(),
          messageIdOrUrl: recoverMessageRef.trim(),
          listingId: recoverListingId,
          allowOverwrite: recoverAllowOverwrite,
          applyTemplateNow: recoverApplyTemplate,
        }),
      }),
    onSuccess: (res) => {
      setRecoverOpen(false);
      setRecoverPreview(null);
      setRecoverError(null);
      setRecoverMessageRef("");
      void queryClient.invalidateQueries({ queryKey: ADMIN_OVERVIEW_KEY });
      toast.success(
        res.updatedInPlace
          ? `Recovered & updated embed #${res.recoveredMeta.messageId.slice(-6)} in place.`
          : `Restored persistent tracking for message #${res.recoveredMeta.messageId.slice(-6)}.`
      );
    },
    onError: (err: Error) => {
      setRecoverError(err.message || "Failed to recover Discord embed.");
    },
  });

  const openRecoverDialog = (opts?: {
    guildId?: string;
    channelId?: string;
    listingId?: string;
  }) => {
    const targetGuildId =
      opts?.guildId || configuredGuilds[0]?.id || connectedGuilds[0]?.id || "";
    const targetGuild = connectedGuilds.find((g) => g.id === targetGuildId);
    const targetChannelId = opts?.channelId || targetGuild?.channelId || "";
    const targetListingId = opts?.listingId || selectedListing?.id || listings[0]?.id || "";
    setRecoverGuildId(targetGuildId);
    setRecoverChannelId(targetChannelId);
    setRecoverListingId(targetListingId);
    setRecoverMessageRef("");
    setRecoverPreview(null);
    setRecoverError(null);
    setRecoverAllowOverwrite(false);
    setRecoverApplyTemplate(true);
    setRecoverOpen(true);
  };

  const handleRecoverInputChange = (val: string) => {
    setRecoverMessageRef(val);
    setRecoverPreview(null);
    setRecoverError(null);
    const urlMatch = val
      .trim()
      .match(/^https?:\/\/(?:(?:ptb|canary)\.)?discord\.com\/channels\/(\d{17,22})\/(\d{17,22})\/(\d{17,22})/i);
    if (urlMatch) {
      const [, parsedGuildId, parsedChannelId] = urlMatch;
      if (connectedGuilds.some((g) => g.id === parsedGuildId)) {
        setRecoverGuildId(parsedGuildId);
      }
      setRecoverChannelId(parsedChannelId);
    }
  };

  const toggleGuild = (guildId: string) => {
    setSelectedGuildIds((prev) =>
      prev.includes(guildId) ? prev.filter((id) => id !== guildId) : [...prev, guildId]
    );
  };

  const deliveryLogs = data?.deliveryLogs || [];
  const totalLogPages = Math.max(1, Math.ceil(deliveryLogs.length / logPageSize));
  const safeLogPage = Math.min(logPage, totalLogPages);
  const pagedDeliveryLogs = deliveryLogs.slice(
    (safeLogPage - 1) * logPageSize,
    safeLogPage * logPageSize
  );

  const handleRowClick = (fn: () => void) => {
    const sel = typeof window !== "undefined" ? window.getSelection()?.toString() : "";
    if (sel && sel.trim().length > 0) return;
    fn();
  };

  const copyDeliveryLog = async (entry: DeliveryLogEntry) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(entry, null, 2));
      toast.success("Copied delivery record JSON");
    } catch {
      toast.info("Select the fields in the dialog to copy.");
    }
  };

  return (
    <AppShell
      requireAdmin
      title="Dispatch & Deliveries"
      description="Publish drop embeds, edit already-deployed Discord messages in-place (including Sold Out updates), recover untracked announcements, and manage live server status widgets."
      actions={
        <Button
          variant="secondary"
          size="sm"
          disabled={isLoading || listings.length === 0 || connectedGuilds.length === 0}
          onClick={() => openRecoverDialog()}
        >
          <Link2 className="h-3.5 w-3.5" />
          Recover Existing Embed
        </Button>
      }
    >
      {isLoading ? (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Skeleton className="h-96 w-full rounded-xl" />
            <Skeleton className="h-96 w-full rounded-xl" />
          </div>
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Step 1: Select Listing */}
            <Card>
              <CardHeader>
                <CardTitle>1. Select Vehicle Listing</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Select
                  value={selectedListing?.id || ""}
                  onValueChange={(val) => {
                    setSelectedListingId(val);
                    setSelectedGuildIds([]);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a vehicle listing" />
                  </SelectTrigger>
                  <SelectContent>
                    {listings.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name} (#{item.id}) — {item.isAvailable ? "In Stock" : "Sold Out"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedListing && (
                  <div className="rounded-lg border border-border bg-zinc-950 p-4 space-y-2 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-white">{selectedListing.name}</span>
                      <div className="flex items-center gap-1.5">
                        <Badge variant={selectedListing.isAvailable ? "success" : "destructive"}>
                          {selectedListing.isAvailable ? "In Stock" : "Sold Out"}
                        </Badge>
                        <Badge variant={selectedListing.readiness === "ready" ? "success" : "warning"}>
                          {selectedListing.readiness === "ready" ? "Ready" : "Incomplete"}
                        </Badge>
                      </div>
                    </div>
                    <p className="text-muted-foreground line-clamp-3">
                      {selectedListing.description}
                    </p>
                    <p className="text-[11px] text-muted-foreground tabular-nums">
                      First Detected: {formatLocalDateTime(selectedListing.detectedAt)}
                      {selectedListing.soldOutAt
                        ? ` • Sold Out: ${formatLocalDateTime(selectedListing.soldOutAt)}`
                        : ""}
                    </p>
                  </div>
                )}

                <div className="space-y-3 rounded-lg border border-border bg-zinc-900/60 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-white">Include Mention Roles</p>
                      <p className="text-[11px] text-muted-foreground">
                        Applies to new dispatches only. In-place embed edits never re-ping roles.
                      </p>
                    </div>
                    <Switch
                      checked={includeRoleMentions}
                      onCheckedChange={setIncludeRoleMentions}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                    <div>
                      <p className="text-xs font-semibold text-white">Allow Re-send if Already Sent</p>
                      <p className="text-[11px] text-muted-foreground">
                        When disabled, servers that already received this listing are skipped on new publishes.
                      </p>
                    </div>
                    <Switch checked={forceResend} onCheckedChange={setForceResend} />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Step 2: Destination Selection & Per-Server In-Place Edit */}
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
                <CardTitle>2. Destination Servers &amp; Deployed Embeds</CardTitle>
                <div className="flex items-center gap-2 text-xs">
                  {configuredGuilds.length > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setSelectedGuildIds(configuredGuilds.map((g) => g.id))}
                        className="text-zinc-300 underline decoration-zinc-600 hover:text-white cursor-pointer"
                      >
                        Select All
                      </button>
                      <span className="text-zinc-600">/</span>
                      <button
                        type="button"
                        onClick={() => setSelectedGuildIds([])}
                        className="text-muted-foreground hover:text-white cursor-pointer"
                      >
                        Clear
                      </button>
                    </>
                  )}
                  <Badge variant="outline" className="tabular-nums">
                    {selectedGuildIds.length} selected
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {configuredGuilds.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No servers currently have a configured notification channel.
                  </p>
                ) : (
                  <div className="thin-scrollbar max-h-72 space-y-2 overflow-y-auto pr-1">
                    {configuredGuilds.map((guild) => {
                      const sentMeta = selectedListing
                        ? guild.sentMessages?.[selectedListing.id]
                        : undefined;
                      const alreadySent = Boolean(
                        selectedListing && guild.sentListingIds[selectedListing.id]
                      );
                      const checked = selectedGuildIds.includes(guild.id);
                      const needsSoldOutSync =
                        Boolean(selectedListing && !selectedListing.isAvailable) &&
                        Boolean(sentMeta?.messageId) &&
                        !sentMeta?.isSoldOutRendered;
                      const isRowEditing =
                        editingGuildId === guild.id && editEmbedMutation.isPending;

                      return (
                        <div
                          key={guild.id}
                          onClick={() => toggleGuild(guild.id)}
                          className="flex cursor-pointer flex-col gap-2 rounded-lg border border-border bg-zinc-950 px-3.5 py-2.5 text-xs transition hover:bg-secondary/40 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() => toggleGuild(guild.id)}
                                aria-label={`Select ${guild.name}`}
                              />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-white">{guild.name}</p>
                              <p
                                className="select-text font-mono text-[11px] text-muted-foreground"
                                onClick={(e) => e.stopPropagation()}
                              >
                                Ch #{sentMeta?.channelId || guild.channelId}
                                {sentMeta?.messageId ? ` • Msg ${sentMeta.messageId.slice(-6)}` : ""}
                              </p>
                            </div>
                          </div>
                          <div
                            className="flex flex-wrap shrink-0 items-center gap-1.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Badge variant={guild.environment === "test" ? "warning" : "secondary"}>
                              {guild.environment}
                            </Badge>
                            {alreadySent && (
                              <Badge variant={sentMeta?.isSoldOutRendered ? "outline" : "info"}>
                                {sentMeta?.isSoldOutRendered ? "Rendered: Sold Out" : "Deployed"}
                              </Badge>
                            )}
                            {needsSoldOutSync && (
                              <Badge variant="warning">Needs Sold-Out Edit</Badge>
                            )}
                            {selectedListing && (sentMeta?.messageId || alreadySent) ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    variant={needsSoldOutSync ? "default" : "outline"}
                                    size="sm"
                                    disabled={isRowEditing || editEmbedMutation.isPending}
                                    onClick={() => {
                                      setEditingGuildId(guild.id);
                                      editEmbedMutation.mutate({
                                        listingId: selectedListing.id,
                                        guildIds: [guild.id],
                                      });
                                    }}
                                    className="h-7 px-2 text-[11px]"
                                  >
                                    {isRowEditing ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Edit3 className="h-3 w-3" />
                                    )}
                                    Update Embed
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  Edit this server&apos;s deployed Discord embed in-place with current stock &amp; R2 images
                                </TooltipContent>
                              </Tooltip>
                            ) : selectedListing ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  openRecoverDialog({
                                    guildId: guild.id,
                                    channelId: guild.channelId,
                                    listingId: selectedListing.id,
                                  })
                                }
                                className="h-7 px-2 text-[11px] text-zinc-300 hover:text-white"
                              >
                                <Link2 className="h-3 w-3" />
                                Recover Embed
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {duplicateCount > 0 && !forceResend && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-500/35 bg-amber-950/40 p-3 text-xs text-amber-200">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                    <span>
                      {duplicateCount} selected server(s) already received this vehicle. Use{" "}
                      <strong>Update Selected Embeds</strong> to edit existing Discord messages in-place, or toggle &ldquo;Allow Re-send&rdquo;.
                    </span>
                  </div>
                )}

                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    disabled={
                      !selectedListing ||
                      selectedGuildIds.length === 0 ||
                      dispatchMutation.isPending
                    }
                    onClick={() => setConfirmMode("publish")}
                  >
                    <Send className="h-4 w-4" />
                    Publish New ({selectedGuildIds.length})
                  </Button>

                  <Button
                    variant="secondary"
                    disabled={
                      !selectedListing ||
                      selectedGuildIds.length === 0 ||
                      editableSelectedCount === 0 ||
                      editEmbedMutation.isPending
                    }
                    onClick={() => setConfirmMode("edit")}
                  >
                    <Edit3 className="h-4 w-4" />
                    Update Deployed Embeds ({editableSelectedCount})
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Deployed Server Status Widgets (/widget) */}
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <LayoutPanelTop className="h-4 w-4 text-zinc-300" />
                  Deployed Server Status Widgets ({deployedWidgets.length})
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Deployed strictly by server administrators running <code className="text-zinc-200">/widget</code> in Discord. Automatically synced after every store check.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={deployedWidgets.length === 0 || refreshWidgetsMutation.isPending}
                onClick={() => refreshWidgetsMutation.mutate()}
              >
                {refreshWidgetsMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Refresh All Widgets
              </Button>
            </CardHeader>
            <CardContent>
              {deployedWidgets.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No server administrators have deployed a <code className="text-zinc-200">/widget</code> embed yet.
                </p>
              ) : (
                <>
                  {/* Mobile Cards */}
                  <div className="space-y-3 md:hidden">
                    {deployedWidgets.map((guild) => {
                      const w = guild.widget!;
                      const isRemoving =
                        removingWidgetGuildId === guild.id && removeWidgetMutation.isPending;
                      return (
                        <div
                          key={`m-widget-${guild.id}`}
                          className="space-y-2 rounded-lg border border-border bg-zinc-950 p-3.5 text-xs"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-semibold text-white">{guild.name}</p>
                            <Badge variant={w.lastSyncStatus === "error" ? "destructive" : "success"}>
                              {w.lastSyncStatus === "error" ? "Sync Error" : "Live Synced"}
                            </Badge>
                          </div>
                          <p className="select-text break-all font-mono text-[11px] text-muted-foreground">
                            #{w.channelId} &bull; Msg {w.messageId}
                          </p>
                          <div className="flex items-center justify-between pt-1">
                            <span className="text-[11px] text-muted-foreground tabular-nums">
                              {w.lastSyncedAt
                                ? formatLocalTime(w.lastSyncedAt)
                                : formatLocalTime(w.deployedAt)}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={isRemoving}
                              onClick={() => {
                                setRemovingWidgetGuildId(guild.id);
                                removeWidgetMutation.mutate(guild.id);
                              }}
                              className="h-7 px-2 text-xs text-red-400 hover:bg-red-950/40 hover:text-red-300"
                            >
                              {isRemoving ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                              Remove
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop Table */}
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Server</TableHead>
                          <TableHead>Channel &amp; Message ID</TableHead>
                          <TableHead>Sync Status</TableHead>
                          <TableHead>Last Synced</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {deployedWidgets.map((guild) => {
                          const w = guild.widget!;
                          const isRemoving =
                            removingWidgetGuildId === guild.id && removeWidgetMutation.isPending;
                          return (
                            <TableRow key={`widget-${guild.id}`}>
                              <TableCell className="font-medium text-white">{guild.name}</TableCell>
                              <TableCell className="select-text font-mono text-xs text-muted-foreground">
                                #{w.channelId} &bull; Msg {w.messageId}
                              </TableCell>
                              <TableCell>
                                <Badge variant={w.lastSyncStatus === "error" ? "destructive" : "success"}>
                                  {w.lastSyncStatus === "error" ? "Sync Error" : "Live Synced"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground tabular-nums">
                                {w.lastSyncedAt
                                  ? formatLocalTime(w.lastSyncedAt)
                                  : formatLocalTime(w.deployedAt)}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={isRemoving}
                                  onClick={() => {
                                    setRemovingWidgetGuildId(guild.id);
                                    removeWidgetMutation.mutate(guild.id);
                                  }}
                                  className="h-7 px-2 text-xs text-red-400 hover:bg-red-950/40 hover:text-red-300"
                                >
                                  {isRemoving ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-3.5 w-3.5" />
                                  )}
                                  Remove
                                </Button>
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

          {/* Delivery Audit Log (max 10 rows visible + vertical scroll, 40 per page, clickable inspection) */}
          <Card>
            <CardHeader>
              <CardTitle>Dispatch History</CardTitle>
              <p className="text-xs text-muted-foreground">
                Click any delivery row to inspect Message ID, Channel ID, HTTP status, or trigger an individual embed edit. Up to 40 results per page.
              </p>
            </CardHeader>
            <CardContent>
              {deliveryLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No deliveries recorded yet.</p>
              ) : (
                <>
                  {/* Mobile Card List */}
                  <div className="space-y-2.5 md:hidden">
                    {pagedDeliveryLogs.map((log) => (
                      <button
                        key={`m-log-${log.id}`}
                        type="button"
                        onClick={() => setInspectDelivery(log)}
                        className="w-full space-y-2 rounded-lg border border-border bg-zinc-950 p-3.5 text-left text-xs transition hover:border-zinc-700 cursor-pointer"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-semibold text-white">{log.listingName}</span>
                          {log.status === "delivered" ? (
                            <Badge variant="success">Delivered</Badge>
                          ) : log.status === "updated" ? (
                            <Badge variant="info">Updated</Badge>
                          ) : (
                            <Badge variant="destructive">Failed</Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Badge variant={log.environment === "test" ? "warning" : "secondary"}>
                            {log.environment}
                          </Badge>
                          <Badge variant="outline" className="capitalize">
                            {log.method}
                          </Badge>
                          <span className="font-mono">
                            {log.guildId}
                            {log.messageId ? ` • #${log.messageId.slice(-6)}` : ""}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground tabular-nums">
                          {formatLocalDateTime(log.timestamp)}
                        </p>
                      </button>
                    ))}
                  </div>

                  {/* Desktop Table */}
                  <div className="hidden rounded-lg border border-border bg-zinc-950/40 md:block">
                    <Table containerClassName="thin-scrollbar max-h-[470px] overflow-y-auto overflow-x-auto">
                      <TableHeader className="sticky top-0 z-10 bg-zinc-950/95 backdrop-blur">
                        <TableRow>
                          <TableHead>Vehicle</TableHead>
                          <TableHead>Guild / Message ID</TableHead>
                          <TableHead>Method</TableHead>
                          <TableHead>Environment</TableHead>
                          <TableHead>Result</TableHead>
                          <TableHead>Time</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pagedDeliveryLogs.map((log) => (
                          <TableRow
                            key={log.id}
                            onClick={() => handleRowClick(() => setInspectDelivery(log))}
                            className="cursor-pointer hover:bg-zinc-900/75"
                          >
                            <TableCell className="font-medium text-white py-2.5">
                              {log.listingName}
                            </TableCell>
                            <TableCell className="select-text font-mono text-xs text-muted-foreground py-2.5">
                              {log.guildId}
                              {log.messageId ? ` • #${log.messageId.slice(-6)}` : ""}
                            </TableCell>
                            <TableCell className="capitalize text-xs text-zinc-300 py-2.5">
                              {log.method}
                            </TableCell>
                            <TableCell className="py-2.5">
                              <Badge variant={log.environment === "test" ? "warning" : "secondary"}>
                                {log.environment}
                              </Badge>
                            </TableCell>
                            <TableCell className="py-2.5">
                              {log.status === "delivered" ? (
                                <span className="inline-flex items-center gap-1 text-xs text-emerald-300">
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  Delivered
                                </span>
                              ) : log.status === "updated" ? (
                                <span className="inline-flex items-center gap-1 text-xs text-sky-300">
                                  <Edit3 className="h-3.5 w-3.5" />
                                  Embed Updated
                                </span>
                              ) : (
                                <span className="text-xs text-red-400">
                                  {log.error || "Failed"}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="select-text text-xs text-muted-foreground tabular-nums py-2.5">
                              {formatLocalDateTime(log.timestamp)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}

              {/* Delivery Logs Pagination (40 per page) */}
              {deliveryLogs.length > logPageSize && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-xs text-muted-foreground">
                  <span className="tabular-nums">
                    Showing {(safeLogPage - 1) * logPageSize + 1}–
                    {Math.min(safeLogPage * logPageSize, deliveryLogs.length)} of{" "}
                    {deliveryLogs.length} deliveries
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={safeLogPage <= 1}
                      onClick={() => setLogPage((p) => Math.max(1, p - 1))}
                      className="h-8 gap-1 px-2.5"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      Previous
                    </Button>
                    <span className="font-mono text-zinc-300">
                      Page {safeLogPage} of {totalLogPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={safeLogPage >= totalLogPages}
                      onClick={() => setLogPage((p) => Math.min(totalLogPages, p + 1))}
                      className="h-8 gap-1 px-2.5"
                    >
                      Next
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Publish / Edit Confirmation Dialog */}
      <Dialog open={confirmMode !== null} onOpenChange={(open) => !open && setConfirmMode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmMode === "edit" ? "Confirm In-Place Embed Update" : "Confirm Discord Broadcast"}
            </DialogTitle>
            <DialogDescription>
              {confirmMode === "edit" ? (
                <>
                  Update already-deployed Discord messages for{" "}
                  <strong className="text-white">{selectedListing?.name}</strong> across{" "}
                  <strong className="text-white">{editableSelectedCount}</strong> server(s) with current{" "}
                  <strong className="text-white">
                    {selectedListing?.isAvailable ? "In Stock" : "Sold Out"}
                  </strong>{" "}
                  status and R2 images. No role mentions will be pinged.
                </>
              ) : (
                <>
                  You are about to publish{" "}
                  <strong className="text-white">{selectedListing?.name}</strong> to{" "}
                  <strong className="text-white">{selectedGuildIds.length}</strong> selected server(s).
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-border bg-zinc-950 p-3 text-xs text-zinc-300 space-y-1">
            <p>
              Action:{" "}
              <strong>{confirmMode === "edit" ? "PATCH existing Discord embed" : "POST new drop alert"}</strong>
            </p>
            <p>
              Mention Roles:{" "}
              <strong>
                {confirmMode === "edit" ? "Suppressed (Edit Mode)" : includeRoleMentions ? "Enabled" : "Disabled"}
              </strong>
            </p>
            {confirmMode === "publish" && (
              <p>
                Duplicate Bypass: <strong>{forceResend ? "Resend Allowed" : "Protected"}</strong>
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmMode(null)}>
              Cancel
            </Button>
            {confirmMode === "edit" ? (
              <Button
                disabled={editEmbedMutation.isPending || !selectedListing}
                onClick={() => {
                  if (!selectedListing) return;
                  editEmbedMutation.mutate({
                    listingId: selectedListing.id,
                    guildIds: selectedGuildIds,
                  });
                }}
              >
                {editEmbedMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Updating Embeds...
                  </>
                ) : (
                  "Confirm Update"
                )}
              </Button>
            ) : (
              <Button onClick={() => dispatchMutation.mutate()} disabled={dispatchMutation.isPending}>
                {dispatchMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Publishing...
                  </>
                ) : (
                  "Confirm Publish"
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Inspect Delivery Record Dialog */}
      <Dialog
        open={Boolean(inspectDelivery)}
        onOpenChange={(open) => !open && setInspectDelivery(null)}
      >
        {inspectDelivery && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{inspectDelivery.listingName}</DialogTitle>
              <DialogDescription className="font-mono text-xs">
                {formatLocalDateTime(inspectDelivery.timestamp)} &bull; {inspectDelivery.method}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-zinc-950 p-3.5 tabular-nums">
                <div>
                  <span className="text-muted-foreground">Status</span>
                  <p className="mt-0.5 font-semibold capitalize text-white">{inspectDelivery.status}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">HTTP Response</span>
                  <p className="mt-0.5 select-text font-mono text-white">
                    {inspectDelivery.httpStatus ?? "—"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Guild ID</span>
                  <p className="mt-0.5 select-text font-mono text-zinc-200">{inspectDelivery.guildId}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Channel ID</span>
                  <p className="mt-0.5 select-text font-mono text-zinc-200">{inspectDelivery.channelId}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Discord Message ID</span>
                  <p className="mt-0.5 select-text font-mono text-zinc-200">
                    {inspectDelivery.messageId || "Not captured"}
                  </p>
                </div>
              </div>
              {inspectDelivery.error && (
                <div className="rounded-lg border border-red-500/35 bg-red-950/30 p-3 text-red-200">
                  <p className="font-semibold">Error Output</p>
                  <p className="mt-1 select-text font-mono text-[11px]">{inspectDelivery.error}</p>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void copyDeliveryLog(inspectDelivery)}
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy JSON
                </Button>
                  {listings.some((l) => l.id === inspectDelivery.listingId) &&
                  inspectDelivery.messageId &&
                  inspectDelivery.method !== "test" && (
                    <Button
                      size="sm"
                      disabled={editEmbedMutation.isPending}
                      onClick={() =>
                        editEmbedMutation.mutate({
                          listingId: inspectDelivery.listingId,
                          guildIds: [inspectDelivery.guildId],
                          overrideMessageId: inspectDelivery.messageId,
                          overrideChannelId: inspectDelivery.channelId,
                        })
                      }
                    >
                      {editEmbedMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Edit3 className="h-3.5 w-3.5" />
                      )}
                      Update This Embed
                    </Button>
                  )}
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>

      {/* Recover Existing Embed Dialog */}
      <Dialog open={recoverOpen} onOpenChange={setRecoverOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-4 w-4 text-zinc-300" />
              Recover Existing Discord Embed
            </DialogTitle>
            <DialogDescription>
              Re-link an older bot message by Discord Message Link or Message ID so future stock edits update that exact message in place—with zero reposts and zero role pings.
            </DialogDescription>
          </DialogHeader>

          <div className="thin-scrollbar max-h-[70vh] space-y-4 overflow-y-auto pr-1 text-xs">
            <div className="space-y-1.5">
              <Label htmlFor="recover-msg-ref">Discord Message Link or Message ID</Label>
              <Input
                id="recover-msg-ref"
                value={recoverMessageRef}
                onChange={(e) => handleRecoverInputChange(e.target.value)}
                placeholder="https://discord.com/channels/guildId/channelId/messageId  or  13581..."
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Pasting a full Discord message URL automatically prefills the server &amp; channel fields below.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Destination Server</Label>
                <Select
                  value={recoverGuildId}
                  onValueChange={(gid) => {
                    setRecoverGuildId(gid);
                    const g = connectedGuilds.find((item) => item.id === gid);
                    if (g?.channelId) setRecoverChannelId(g.channelId);
                    setRecoverPreview(null);
                    setRecoverError(null);
                  }}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Choose Discord server" />
                  </SelectTrigger>
                  <SelectContent>
                    {connectedGuilds.map((g) => (
                      <SelectItem key={`rec-g-${g.id}`} value={g.id}>
                        {g.name} ({g.environment})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="recover-channel-id">Channel ID</Label>
                <Input
                  id="recover-channel-id"
                  value={recoverChannelId}
                  onChange={(e) => {
                    setRecoverChannelId(e.target.value);
                    setRecoverPreview(null);
                    setRecoverError(null);
                  }}
                  placeholder="123456789012345678"
                  className="h-9 font-mono text-xs"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Associated Vehicle Listing</Label>
              <Select
                value={recoverListingId}
                onValueChange={(lid) => {
                  setRecoverListingId(lid);
                  setRecoverPreview(null);
                  setRecoverError(null);
                }}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Choose vehicle listing" />
                </SelectTrigger>
                <SelectContent>
                  {listings.map((item) => (
                    <SelectItem key={`rec-l-${item.id}`} value={item.id}>
                      {item.name} (#{item.id}) — {item.isAvailable ? "In Stock" : "Sold Out"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={
                  !recoverMessageRef.trim() ||
                  !recoverGuildId ||
                  !recoverListingId ||
                  recoverPreviewMutation.isPending
                }
                onClick={() => recoverPreviewMutation.mutate()}
              >
                {recoverPreviewMutation.isPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Inspecting Discord Message...
                  </>
                ) : (
                  <>
                    <Search className="h-3.5 w-3.5" />
                    Fetch &amp; Preview Message
                  </>
                )}
              </Button>
            </div>

            {recoverError && (
              <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-950/35 p-3 text-red-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                <div className="space-y-0.5">
                  <p className="font-semibold">Unable to Recover Message</p>
                  <p className="text-[11px] leading-relaxed">{recoverError}</p>
                </div>
              </div>
            )}

            {recoverPreview && (
              <div className="space-y-3 rounded-xl border border-border bg-zinc-950 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-300">
                    <ShieldCheck className="h-4 w-4" />
                    Verified Bot Message (#{recoverPreview.preview.messageId.slice(-6)})
                  </span>
                  {safeExternalUrl(recoverPreview.preview.jumpUrl) && (
                    <a
                      href={safeExternalUrl(recoverPreview.preview.jumpUrl)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-zinc-200 underline decoration-zinc-600 hover:text-white"
                    >
                      Open in Discord
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>

                <div className="grid gap-2 rounded-lg border border-border/80 bg-zinc-900/50 p-3 sm:grid-cols-2">
                  <div>
                    <span className="text-muted-foreground">Author</span>
                    <p className="mt-0.5 font-medium text-white">
                      {recoverPreview.preview.authorUsername || "Everfall Bot"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Original Post Date</span>
                    <p className="mt-0.5 font-medium text-white tabular-nums">
                      {formatLocalDateTime(recoverPreview.preview.createdAtMs)}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Target Channel</span>
                    <p className="mt-0.5 select-text font-mono text-zinc-200">
                      #{recoverPreview.preview.channelId}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Target Vehicle State</span>
                    <p className="mt-0.5 font-medium text-white">
                      {recoverPreview.listingName} (
                      {recoverPreview.listingIsAvailable ? "In Stock" : "Sold Out"})
                    </p>
                  </div>
                </div>

                <div className="space-y-2 rounded-lg border border-border bg-card p-3">
                  <p className="font-semibold text-white">
                    {recoverPreview.preview.title || "Original Discord Embed"}
                  </p>
                  {recoverPreview.preview.description && (
                    <p className="line-clamp-4 whitespace-pre-line text-[11px] leading-relaxed text-zinc-300">
                      {recoverPreview.preview.description}
                    </p>
                  )}
                  {recoverPreview.preview.imageUrl &&
                    safeExternalUrl(recoverPreview.preview.imageUrl) && (
                      <img
                        src={safeExternalUrl(recoverPreview.preview.imageUrl)!}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="max-h-36 w-full rounded border border-border object-cover"
                      />
                    )}
                </div>

                {(recoverPreview.conflicts.alreadyLinkedListingId ||
                  recoverPreview.conflicts.guildAlreadyTracksDifferentMessage) && (
                  <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-950/35 p-3 text-amber-200">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                      <div className="space-y-1 text-[11px]">
                        <p className="font-semibold text-amber-100">
                          Existing Tracking Conflict Detected
                        </p>
                        {recoverPreview.conflicts.alreadyLinkedListingId && (
                          <p>
                            This Discord message is already linked to listing{" "}
                            <code className="text-white">
                              #{recoverPreview.conflicts.alreadyLinkedListingId}
                            </code>
                            .
                          </p>
                        )}
                        {recoverPreview.conflicts.guildAlreadyTracksDifferentMessage && (
                          <p>
                            This server already tracks message{" "}
                            <code className="text-white">
                              #
                              {
                                recoverPreview.conflicts.guildAlreadyTracksDifferentMessage
                                  .messageId
                              }
                            </code>{" "}
                            for this listing.
                          </p>
                        )}
                      </div>
                    </div>
                    <label className="flex cursor-pointer items-center gap-2 rounded border border-amber-500/30 bg-zinc-950/70 px-2.5 py-2 text-[11px] text-amber-100">
                      <input
                        type="checkbox"
                        checked={recoverAllowOverwrite}
                        onChange={(e) => setRecoverAllowOverwrite(e.target.checked)}
                        className="h-3.5 w-3.5 accent-white"
                      />
                      <span>Overwrite existing message tracking record for this pairing</span>
                    </label>
                  </div>
                )}

                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-zinc-900/50 px-3 py-2.5 text-zinc-200">
                  <input
                    type="checkbox"
                    checked={recoverApplyTemplate}
                    onChange={(e) => setRecoverApplyTemplate(e.target.checked)}
                    className="h-4 w-4 accent-white"
                  />
                  <span>
                    Apply current{" "}
                    <strong className="text-white">
                      {recoverPreview.listingIsAvailable ? "In Stock" : "Sold Out"}
                    </strong>{" "}
                    template immediately (edits this message in-place; never reposts or pings roles)
                  </span>
                </label>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRecoverOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                !recoverPreview ||
                recoverExecuteMutation.isPending ||
                ((Boolean(recoverPreview.conflicts.alreadyLinkedListingId) ||
                  Boolean(recoverPreview.conflicts.guildAlreadyTracksDifferentMessage)) &&
                  !recoverAllowOverwrite)
              }
              onClick={() => recoverExecuteMutation.mutate()}
            >
              {recoverExecuteMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Recovering Embed...
                </>
              ) : (
                "Recover Tracking"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
