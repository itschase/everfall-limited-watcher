import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Copy,
  Database,
  HardDrive,
  Loader2,
  RefreshCw,
  Server,
  Shield,
  Terminal,
} from "lucide-react";
import { toast } from "sonner";
import {
  AdminBotStateResponse,
  apiFetch,
  BotCommandComparison,
  BotRefreshResponse,
} from "@/lib/api";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export const ADMIN_BOT_KEY = ["admin-bot-state"] as const;

const OPTION_TYPE_LABELS: Record<number, string> = {
  3: "String",
  4: "Integer",
  5: "Boolean",
  6: "User",
  7: "Channel",
  8: "Role",
  9: "Mentionable",
  10: "Number",
};

export function AdminBotPage() {
  const queryClient = useQueryClient();

  const [syncCommands, setSyncCommands] = useState(true);
  const [refreshGuilds, setRefreshGuilds] = useState(true);
  const [refreshWidgets, setRefreshWidgets] = useState(true);
  const [purgeCaches, setPurgeCaches] = useState(true);
  const [lastRefreshSummary, setLastRefreshSummary] = useState<BotRefreshResponse | null>(null);
  const [selectedCommand, setSelectedCommand] = useState<BotCommandComparison | null>(null);

  const { data, isLoading, isFetching, refetch } = useQuery<AdminBotStateResponse>({
    queryKey: ADMIN_BOT_KEY,
    queryFn: () => apiFetch<AdminBotStateResponse>("/api/admin/bot"),
  });

  const refreshBotMutation = useMutation({
    mutationFn: (opts?: {
      syncCommands?: boolean;
      refreshGuilds?: boolean;
      refreshWidgets?: boolean;
      purgeCaches?: boolean;
    }) =>
      apiFetch<BotRefreshResponse>("/api/admin/bot/refresh", {
        method: "POST",
        body: JSON.stringify(
          opts ?? {
            syncCommands,
            refreshGuilds,
            refreshWidgets,
            purgeCaches,
          }
        ),
      }),
    onSuccess: (res) => {
      setLastRefreshSummary(res);
      if (res.botState) {
        queryClient.setQueryData(ADMIN_BOT_KEY, res.botState);
      }
      void queryClient.invalidateQueries({ queryKey: ADMIN_OVERVIEW_KEY });
      const parts: string[] = [];
      if (res.steps.commands.ran) parts.push(`${res.steps.commands.count} slash commands loaded`);
      if (res.steps.guilds.ran) parts.push(`${res.steps.guilds.count} connected servers refreshed`);
      if (res.steps.widgets.ran) parts.push(`${res.steps.widgets.refreshed} widgets updated`);
      toast.success(parts.length > 0 ? `Bot refreshed: ${parts.join(" • ")}` : "Bot refreshed.");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to refresh bot.");
    },
  });

  const registerOnlyMutation = useMutation({
    mutationFn: () =>
      apiFetch<{
        ok: boolean;
        registeredCount: number;
        botState?: AdminBotStateResponse;
      }>("/api/admin/bot/register-commands", {
        method: "POST",
        body: JSON.stringify({ scope: "global" }),
      }),
    onSuccess: (res) => {
      if (res.botState) {
        queryClient.setQueryData(ADMIN_BOT_KEY, res.botState);
      } else {
        void queryClient.invalidateQueries({ queryKey: ADMIN_BOT_KEY });
      }
      toast.success(
        `Registered ${res.registeredCount} global slash command${res.registeredCount === 1 ? "" : "s"} with Discord.`
      );
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to register slash commands.");
    },
  });

  const copyText = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied to clipboard.`);
    } catch {
      toast.error("Unable to copy to clipboard.");
    }
  };

  const anyMutating = refreshBotMutation.isPending || registerOnlyMutation.isPending;

  return (
    <AppShell
      requireAdmin
      title="Bot Control"
      description="Inspect live Discord bot identity, verify environment readiness, reload connected server caches, and register slash commands directly with Discord."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void refetch()}
            disabled={isFetching || anyMutating}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Check Live State
          </Button>
          <Button
            size="sm"
            onClick={() =>
              refreshBotMutation.mutate({
                syncCommands: true,
                refreshGuilds: true,
                refreshWidgets: true,
                purgeCaches: true,
              })
            }
            disabled={anyMutating || isLoading}
          >
            {refreshBotMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Bot className="h-3.5 w-3.5" />
            )}
            Refresh Bot &amp; Load Commands
          </Button>
        </div>
      }
    >
      {isLoading || !data ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((idx) => (
              <Skeleton key={idx} className="h-28 w-full rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-56 w-full rounded-xl" />
          <Skeleton className="h-80 w-full rounded-xl" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Status Summary Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Slash Command Sync</span>
                <Terminal className="h-4 w-4 text-zinc-400" />
              </div>
              <div className="mt-2 flex items-center gap-2">
                <p className="text-2xl font-bold text-white tabular-nums">
                  {data.syncedCount} / {data.totalLocalCommands}
                </p>
                <Badge variant={data.allInSync ? "success" : "warning"}>
                  {data.allInSync ? "In Sync" : "Needs Refresh"}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {data.missingCount > 0
                  ? `${data.missingCount} missing on Discord`
                  : data.outdatedCount > 0
                    ? `${data.outdatedCount} updated in code`
                    : `${data.totalRemoteCommands} live commands registered`}
              </p>
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Discord Bot Connection</span>
                <span className="relative flex h-2.5 w-2.5">
                  <span
                    className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${
                      data.identity.ok ? "bg-emerald-400" : "bg-red-400"
                    }`}
                  />
                  <span
                    className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                      data.identity.ok ? "bg-emerald-500" : "bg-red-500"
                    }`}
                  />
                </span>
              </div>
              <p className="mt-2 truncate text-lg font-bold text-white">
                {data.identity.botUser?.username ||
                  data.identity.application?.name ||
                  (data.botStatus === "online" ? "Bot Configured" : "Bot Offline")}
              </p>
              <p className="mt-1 select-text truncate font-mono text-xs text-muted-foreground">
                App ID: {data.identity.appId}
              </p>
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Servers &amp; Live Widgets</span>
                <Server className="h-4 w-4 text-zinc-400" />
              </div>
              <p className="mt-2 text-2xl font-bold text-white tabular-nums">
                {data.counts.connectedServers} Servers
              </p>
              <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                {data.counts.deployedWidgets} active /widget message
                {data.counts.deployedWidgets === 1 ? "" : "s"}
              </p>
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Last Command Refresh</span>
                <Shield className="h-4 w-4 text-zinc-400" />
              </div>
              <p className="mt-2 text-lg font-bold text-white">
                {data.syncMeta?.syncedAt ? formatLocalTime(data.syncMeta.syncedAt) : "Not synced yet"}
              </p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {data.syncMeta?.syncedAt
                  ? `By ${data.syncMeta.syncedBy} (${data.syncMeta.scope})`
                  : "Click Refresh Bot to register"}
              </p>
            </Card>
          </div>

          {/* Pending Sync Notice */}
          {!data.allInSync && (
            <div className="flex flex-col items-start justify-between gap-3 rounded-xl border border-amber-500/35 bg-amber-500/10 p-4 sm:flex-row sm:items-center">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
                <div>
                  <p className="text-sm font-semibold text-amber-100">
                    Discord slash commands are out of sync with the application
                  </p>
                  <p className="mt-0.5 text-xs text-amber-200/80">
                    {data.liveCommandsError
                      ? `Could not read live commands: ${data.liveCommandsError}`
                      : "New or updated commands (such as /widget) will not appear in Discord until you refresh the bot."}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => registerOnlyMutation.mutate()}
                disabled={anyMutating}
                className="shrink-0"
              >
                {registerOnlyMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Terminal className="h-3.5 w-3.5" />
                )}
                Load Commands Now
              </Button>
            </div>
          )}

          {/* Main Control Grid */}
          <div className="grid gap-6 lg:grid-cols-12">
            {/* Refresh Actions */}
            <Card className="lg:col-span-7">
              <CardHeader>
                <CardTitle>Refresh Bot &amp; Load Slash Commands</CardTitle>
                <CardDescription>
                  Push updated global slash commands to Discord, clear cached server lists, synchronize
                  deployed <code>/widget</code> embeds, and purge public API edge caches.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-zinc-950 p-3.5 transition hover:border-zinc-700">
                    <Checkbox
                      checked={syncCommands}
                      onCheckedChange={(v) => setSyncCommands(Boolean(v))}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="text-sm font-medium text-white">Sync Slash Commands</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Registers all {data.totalLocalCommands} commands globally with Discord.
                      </p>
                    </div>
                  </label>

                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-zinc-950 p-3.5 transition hover:border-zinc-700">
                    <Checkbox
                      checked={refreshGuilds}
                      onCheckedChange={(v) => setRefreshGuilds(Boolean(v))}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="text-sm font-medium text-white">Reload Server List Cache</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Clears <code>discord:bot_guilds</code> cache and pulls fresh guilds.
                      </p>
                    </div>
                  </label>

                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-zinc-950 p-3.5 transition hover:border-zinc-700">
                    <Checkbox
                      checked={refreshWidgets}
                      onCheckedChange={(v) => setRefreshWidgets(Boolean(v))}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="text-sm font-medium text-white">Refresh Live Widgets</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Re-syncs all {data.counts.deployedWidgets} deployed status widget embed
                        {data.counts.deployedWidgets === 1 ? "" : "s"}.
                      </p>
                    </div>
                  </label>

                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-zinc-950 p-3.5 transition hover:border-zinc-700">
                    <Checkbox
                      checked={purgeCaches}
                      onCheckedChange={(v) => setPurgeCaches(Boolean(v))}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="text-sm font-medium text-white">Purge Public Edge Cache</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Clears cached status &amp; listing responses across Cloudflare edge.
                      </p>
                    </div>
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  <Button
                    onClick={() =>
                      refreshBotMutation.mutate({
                        syncCommands,
                        refreshGuilds,
                        refreshWidgets,
                        purgeCaches,
                      })
                    }
                    disabled={
                      anyMutating ||
                      (!syncCommands && !refreshGuilds && !refreshWidgets && !purgeCaches)
                    }
                  >
                    {refreshBotMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    Run Selected Refresh
                  </Button>

                  <Button
                    variant="secondary"
                    onClick={() => registerOnlyMutation.mutate()}
                    disabled={anyMutating}
                  >
                    {registerOnlyMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Terminal className="h-4 w-4" />
                    )}
                    Sync Slash Commands Only
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() =>
                      refreshBotMutation.mutate({
                        syncCommands: false,
                        refreshGuilds: true,
                        refreshWidgets: false,
                        purgeCaches: false,
                      })
                    }
                    disabled={anyMutating}
                  >
                    <Server className="h-4 w-4" />
                    Reload Guild Cache Only
                  </Button>
                </div>

                {lastRefreshSummary && (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
                    <div className="flex items-center gap-2 font-semibold text-emerald-100">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                      Refresh completed at {formatLocalDateTime(lastRefreshSummary.refreshedAt)}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-emerald-200/90">
                      {lastRefreshSummary.steps.commands.ran && (
                        <span>
                          Commands: {lastRefreshSummary.steps.commands.count} loaded globally
                        </span>
                      )}
                      {lastRefreshSummary.steps.guilds.ran && (
                        <span>Servers: {lastRefreshSummary.steps.guilds.count} active guilds</span>
                      )}
                      {lastRefreshSummary.steps.widgets.ran && (
                        <span>
                          Widgets: {lastRefreshSummary.steps.widgets.refreshed} updated
                          {lastRefreshSummary.steps.widgets.failed > 0
                            ? ` (${lastRefreshSummary.steps.widgets.failed} failed)`
                            : ""}
                        </span>
                      )}
                      {lastRefreshSummary.steps.caches.ran && <span>Edge cache purged</span>}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Bot Runtime Identity & Environment Bindings */}
            <Card className="lg:col-span-5">
              <CardHeader>
                <CardTitle>Bot Identity &amp; Bindings</CardTitle>
                <CardDescription>
                  Live Discord application metadata and Cloudflare Worker bindings.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3.5 rounded-lg border border-border bg-zinc-950 p-3.5">
                  {data.identity.botUser?.avatarUrl ? (
                    <img
                      src={data.identity.botUser.avatarUrl}
                      alt={data.identity.botUser.username}
                      className="h-11 w-11 rounded-full border border-border object-cover"
                    />
                  ) : (
                    <div className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-zinc-900 text-zinc-400">
                      <Bot className="h-5 w-5" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-white">
                        {data.identity.botUser?.globalName ||
                          data.identity.botUser?.username ||
                          "Everfall Limited Watcher"}
                      </p>
                      <Badge variant={data.identity.ok ? "success" : "destructive"}>
                        {data.identity.ok ? "Authenticated" : "Unverified"}
                      </Badge>
                    </div>
                    <p className="mt-0.5 select-text truncate font-mono text-xs text-muted-foreground">
                      ID: {data.identity.appId}
                    </p>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void copyText("Application ID", data.identity.appId)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Copy Application ID</TooltipContent>
                  </Tooltip>
                </div>

                {data.identity.error && (
                  <div className="rounded-lg border border-red-500/35 bg-red-500/10 p-3 text-xs text-red-200">
                    {data.identity.error}
                  </div>
                )}

                <div className="space-y-2 rounded-lg border border-border bg-zinc-950 p-3.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Interactions Endpoint</span>
                    <button
                      type="button"
                      onClick={() =>
                        void copyText(
                          "Interactions Endpoint URL",
                          data.identity.application?.interactionsEndpointUrl ||
                            data.environment.interactionsUrl
                        )
                      }
                      className="inline-flex items-center gap-1 font-mono text-zinc-200 hover:text-white cursor-pointer"
                    >
                      <span className="max-w-[200px] truncate">
                        {data.identity.application?.interactionsEndpointUrl ||
                          data.environment.interactionsUrl}
                      </span>
                      <Copy className="h-3 w-3 shrink-0 text-muted-foreground" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Shield className="h-3.5 w-3.5" />
                      Bot Token / Public Key
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant={data.environment.botTokenConfigured ? "success" : "destructive"}
                      >
                        {data.environment.botTokenConfigured ? "Token Ready" : "Missing Token"}
                      </Badge>
                      <Badge
                        variant={data.environment.publicKeyConfigured ? "success" : "warning"}
                      >
                        {data.environment.publicKeyConfigured ? "Key Set" : "No Key"}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Database className="h-3.5 w-3.5" />
                      Workers KV Binding
                    </span>
                    <Badge variant={data.environment.kvBound ? "success" : "destructive"}>
                      {data.environment.kvBound ? "DISCORD_BOT Bound" : "Unbound"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <HardDrive className="h-3.5 w-3.5" />
                      R2 Media Storage
                    </span>
                    <Badge variant={data.environment.r2Bound ? "success" : "warning"}>
                      {data.environment.r2Bound ? "everfall-media Bound" : "KV Fallback"}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Registered Slash Commands Table */}
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Slash Command Definitions ({data.comparisons.length})</CardTitle>
                <CardDescription>
                  Compares codebase definitions against Discord&apos;s live global command registry.
                  Click any command row to inspect its JSON schema.
                </CardDescription>
              </div>
              <Badge variant={data.allInSync ? "success" : "warning"} className="self-start sm:self-auto">
                {data.allInSync ? "All Commands Synced" : "Sync Recommended"}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Command</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Access</TableHead>
                    <TableHead>Options</TableHead>
                    <TableHead>Live Discord ID</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.comparisons.map((cmd) => (
                    <TableRow
                      key={cmd.name}
                      onClick={() => {
                        if (window.getSelection()?.toString().trim()) return;
                        setSelectedCommand(cmd);
                      }}
                      className="cursor-pointer transition-colors hover:bg-zinc-900/70"
                    >
                      <TableCell className="select-text font-mono text-sm font-semibold text-white">
                        /{cmd.name}
                      </TableCell>
                      <TableCell className="max-w-sm text-xs text-zinc-300">
                        <p className="line-clamp-2">{cmd.description}</p>
                        {cmd.diffReason && (
                          <p className="mt-1 text-[11px] text-amber-300">Diff: {cmd.diffReason}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={cmd.defaultMemberPermissions ? "secondary" : "outline"}>
                          {cmd.defaultMemberPermissions ? "Manage Server" : "Everyone"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {cmd.options.length === 0 ? (
                          <span>None</span>
                        ) : (
                          cmd.options.map((o) => (
                            <span
                              key={o.name}
                              className="mr-1.5 inline-block rounded border border-border bg-zinc-950 px-1.5 py-0.5 font-mono text-[11px] text-zinc-300"
                            >
                              {o.name}:{OPTION_TYPE_LABELS[o.type] || `#${o.type}`}
                            </span>
                          ))
                        )}
                      </TableCell>
                      <TableCell className="select-text font-mono text-xs text-muted-foreground">
                        {cmd.liveId || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            cmd.syncState === "synced"
                              ? "success"
                              : cmd.syncState === "outdated"
                                ? "warning"
                                : "destructive"
                          }
                        >
                          {cmd.syncState === "synced"
                            ? "Synced"
                            : cmd.syncState === "outdated"
                              ? "Outdated"
                              : "Missing"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {data.extraRemoteCommands.length > 0 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                  <p className="font-semibold text-amber-100">
                    Extra commands currently registered on Discord ({data.extraRemoteCommands.length}):
                  </p>
                  <p className="mt-1 text-amber-200/80">
                    {data.extraRemoteCommands.map((c) => `/${c.name}`).join(", ")} — running{" "}
                    <strong>Sync Slash Commands</strong> will replace these with the active list above.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Command Schema Inspection Dialog */}
          <Dialog
            open={Boolean(selectedCommand)}
            onOpenChange={(open) => {
              if (!open) setSelectedCommand(null);
            }}
          >
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle className="font-mono">
                  /{selectedCommand?.name} — Discord Command Schema
                </DialogTitle>
                <DialogDescription>
                  Payload registered with Discord&apos;s Global Application Commands endpoint.
                </DialogDescription>
              </DialogHeader>
              {selectedCommand && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge
                      variant={
                        selectedCommand.syncState === "synced"
                          ? "success"
                          : selectedCommand.syncState === "outdated"
                            ? "warning"
                            : "destructive"
                      }
                    >
                      {selectedCommand.syncState === "synced"
                        ? "In Sync"
                        : selectedCommand.syncState === "outdated"
                          ? "Differs From Live"
                          : "Not Registered Yet"}
                    </Badge>
                    {selectedCommand.liveId && (
                      <span className="select-text font-mono text-muted-foreground">
                        Command ID: {selectedCommand.liveId}
                      </span>
                    )}
                  </div>
                  <pre className="max-h-72 overflow-auto rounded-lg border border-border bg-zinc-950 p-3.5 font-mono text-xs text-zinc-200 select-text">
                    {JSON.stringify(
                      {
                        name: selectedCommand.name,
                        description: selectedCommand.description,
                        ...(selectedCommand.defaultMemberPermissions
                          ? { default_member_permissions: selectedCommand.defaultMemberPermissions }
                          : {}),
                        ...(selectedCommand.options.length > 0
                          ? { options: selectedCommand.options }
                          : {}),
                      },
                      null,
                      2
                    )}
                  </pre>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        void copyText(
                          `/${selectedCommand.name} schema`,
                          JSON.stringify(selectedCommand, null, 2)
                        )
                      }
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Copy JSON
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        setSelectedCommand(null);
                        registerOnlyMutation.mutate();
                      }}
                      disabled={anyMutating}
                    >
                      <Terminal className="h-3.5 w-3.5" />
                      Sync Commands
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      )}
    </AppShell>
  );
}
