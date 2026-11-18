import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Copy, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { AdminConnectedGuild, AdminOverviewResponse, apiFetch } from "@/lib/api";
import { formatLocalDateTime } from "@/lib/utils";
import { ADMIN_OVERVIEW_KEY, useAdminOverview } from "./useAdminOverview";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function AdminServersPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isFetching } = useAdminOverview();
  const [search, setSearch] = useState("");
  const [selectedGuild, setSelectedGuild] = useState<AdminConnectedGuild | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyId = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(value);
      toast.success(`Copied ${label}: ${value}`);
      window.setTimeout(() => {
        setCopiedId((curr) => (curr === value ? null : curr));
      }, 1500);
    } catch {
      toast.info(`${label}: ${value}`);
    }
  };

  const guilds = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.connectedGuilds || []).filter(
      (g) => !q || g.name.toLowerCase().includes(q) || g.id.includes(q)
    );
  }, [data?.connectedGuilds, search]);

  const guildLogs = useMemo(() => {
    if (!selectedGuild || !data?.deliveryLogs) return [];
    return data.deliveryLogs.filter((entry) => entry.guildId === selectedGuild.id);
  }, [data?.deliveryLogs, selectedGuild]);

  const forceRefresh = async () => {
    try {
      const fresh = await apiFetch<AdminOverviewResponse>("/api/admin/overview?refresh=1");
      queryClient.setQueryData(ADMIN_OVERVIEW_KEY, fresh);
      toast.success("Refreshed connected Discord servers");
    } catch (err: any) {
      toast.error(err?.message || "Failed to refresh servers.");
    }
  };

  return (
    <AppShell
      requireAdmin
      title="Connected Discord Servers"
      description="Inspect bot installations, alert channel readiness, role counts, and notification delivery logs."
      actions={
        <Button variant="secondary" size="sm" onClick={() => void forceRefresh()} disabled={isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Sync Guilds
        </Button>
      }
    >
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search server name or ID..."
            className="pl-9"
          />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {guilds.length} connected server(s)
        </span>
      </div>

      <Card>
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading servers...</div>
        ) : guilds.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No connected Discord servers found.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Server</TableHead>
                <TableHead>Environment</TableHead>
                <TableHead>Configuration</TableHead>
                <TableHead>Mention Roles</TableHead>
                <TableHead className="text-right">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {guilds.map((guild) => (
                <TableRow key={guild.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {guild.iconUrl ? (
                        <img src={guild.iconUrl} alt="" className="h-8 w-8 rounded-lg" />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-xs font-bold text-white">
                          {guild.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-white">{guild.name}</p>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <span className="select-text font-mono text-[11px] text-muted-foreground">
                            {guild.id}
                          </span>
                          <button
                            type="button"
                            onClick={() => void copyId(guild.id, "Server ID")}
                            aria-label={`Copy server ID ${guild.id}`}
                            title="Copy Server ID"
                            className="inline-flex h-5 w-5 items-center justify-center rounded border border-transparent text-muted-foreground transition hover:border-border hover:bg-secondary hover:text-white cursor-pointer"
                          >
                            {copiedId === guild.id ? (
                              <Check className="h-3 w-3 text-emerald-400" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={guild.environment === "test" ? "warning" : "secondary"}>
                      {guild.environment === "test" ? "Test Server" : "Production"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {guild.configured ? (
                      <div className="inline-flex items-center gap-1.5">
                        <Badge variant="success" className="select-text font-mono">
                          #{guild.channelId}
                        </Badge>
                        <button
                          type="button"
                          onClick={() => void copyId(guild.channelId, "Channel ID")}
                          aria-label={`Copy channel ID ${guild.channelId}`}
                          title="Copy Channel ID"
                          className="inline-flex h-5 w-5 items-center justify-center rounded border border-transparent text-muted-foreground transition hover:border-border hover:bg-secondary hover:text-white cursor-pointer"
                        >
                          {copiedId === guild.channelId ? (
                            <Check className="h-3 w-3 text-emerald-400" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    ) : (
                      <Badge variant="secondary">Channel Not Set</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-zinc-300 tabular-nums">
                    {guild.roleIds.length > 0 ? `${guild.roleIds.length} role(s)` : "None"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => setSelectedGuild(guild)}>
                      Inspect Logs
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={Boolean(selectedGuild)} onOpenChange={(open) => !open && setSelectedGuild(null)}>
        {selectedGuild && (
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{selectedGuild.name}</DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-2 font-mono text-xs">
                <span>
                  Guild ID <span className="select-text text-zinc-200">{selectedGuild.id}</span>
                </span>
                <button
                  type="button"
                  onClick={() => void copyId(selectedGuild.id, "Guild ID")}
                  aria-label="Copy Guild ID"
                  className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-white cursor-pointer"
                >
                  {copiedId === selectedGuild.id ? (
                    <Check className="h-3 w-3 text-emerald-400" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </button>
                <span>&bull; Mode: {selectedGuild.environment}</span>
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="grid gap-3 rounded-lg border border-border bg-zinc-950 p-4 text-xs sm:grid-cols-2">
                <div>
                  <span className="text-muted-foreground">Alert Channel ID</span>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <p className="select-text font-mono text-white">
                      {selectedGuild.channelId || "Not configured"}
                    </p>
                    {selectedGuild.channelId && (
                      <button
                        type="button"
                        onClick={() => void copyId(selectedGuild.channelId, "Channel ID")}
                        aria-label="Copy Alert Channel ID"
                        className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-white cursor-pointer"
                      >
                        {copiedId === selectedGuild.channelId ? (
                          <Check className="h-3 w-3 text-emerald-400" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Mention Roles Configured</span>
                  <p className="mt-0.5 text-white">{selectedGuild.roleIds.length}</p>
                </div>
              </div>

              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Recent Delivery Logs
                </h4>
                {guildLogs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No recorded dispatches for this server yet.
                  </p>
                ) : (
                  <div className="thin-scrollbar max-h-64 space-y-2 overflow-y-auto">
                    {guildLogs.map((log) => (
                      <div
                        key={log.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-border bg-zinc-900/70 px-3 py-2 text-xs"
                      >
                        <div>
                          <p className="font-medium text-white">
                            {log.listingName} ({log.method})
                          </p>
                          {log.error && <p className="text-red-400">{log.error}</p>}
                        </div>
                        <div className="text-right tabular-nums">
                          <Badge variant={log.status === "delivered" ? "success" : "destructive"}>
                            {log.status}
                          </Badge>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {formatLocalDateTime(log.timestamp)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </AppShell>
  );
}
