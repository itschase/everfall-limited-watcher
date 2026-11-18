import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Hash,
  Loader2,
  RefreshCw,
  Search,
  Send,
  Shield,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  apiFetch,
  DashboardServersResponse,
  ManagedServer,
  ServerStatus,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuthActions } from "@/features/auth/useAuthActions";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

function ServerConfigPanel({
  server,
  onSaved,
}: {
  server: ManagedServer;
  onSaved: () => void;
}) {
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
      toast.error(err.message || "Failed to save server configuration.");
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
      toast.error(err.message || "Could not send test notification.");
    },
  });

  const toggleRole = (id: string) => {
    setRoleIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  return (
    <div className="border-t border-border bg-zinc-900/50 p-5 space-y-6">
      {server.controlsError && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/35 bg-amber-950/40 p-3 text-xs text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div>
            Could not load channels or roles from Discord ({server.controlsError}). Ensure the bot has
            permissions in this server.
          </div>
        </div>
      )}

      {server.config.channelMissing && (
        <div className="flex items-start gap-2.5 rounded-lg border border-red-500/35 bg-red-950/40 p-3 text-xs text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <div>
            The previously saved notification channel is missing or the bot cannot send messages there.
            Please update bot permissions or choose another channel below.
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
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
                return (
                  <button
                    key={channel.id}
                    type="button"
                    onClick={() => setChannelId(channel.id)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs transition cursor-pointer",
                      selected
                        ? "bg-zinc-800/90 font-semibold text-white border border-zinc-600"
                        : "text-zinc-300 hover:bg-secondary border border-transparent"
                    )}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <Hash className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{channel.name}</span>
                    </span>
                    {selected && <span className="text-[11px] text-zinc-300">Selected</span>}
                  </button>
                );
              })
            )}
          </div>
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
                    className={cn(
                      "flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-xs transition",
                      checked ? "bg-zinc-800/80 text-white" : "text-zinc-300 hover:bg-secondary"
                    )}
                  >
                    <span className="truncate">@{role.name}</span>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleRole(role.id)}
                      className="h-4 w-4 accent-zinc-200"
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
            disabled={!channelId || !isDirty || saveMutation.isPending}
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
          {isDirty && (
            <span className="text-xs font-medium text-amber-300">Unsaved changes</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={!server.config.channelId || isDirty || testMutation.isPending}
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
    </div>
  );
}

export function DashboardPage() {
  const queryClient = useQueryClient();
  const { startLogin, isLoggingIn } = useAuthActions();
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
      {/* Compact Overview Strip */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
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
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
            <div key={s} className="h-24 animate-pulse rounded-xl border border-border bg-card" />
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
                <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
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
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h3 className="truncate text-base font-semibold text-white">{server.name}</h3>
                        <ServerStatusIndicator status={server.status} />
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
        Discord server, you can also run{" "}
        <code className="select-all cursor-text rounded border border-border bg-zinc-950 px-1.5 py-0.5 font-mono text-zinc-200">
          /setup #your-channel
        </code>{" "}
        inside Discord to set the notification channel.
      </div>
    </AppShell>
  );
}
