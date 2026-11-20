import { Link } from "@tanstack/react-router";
import {
  Activity,
  Bot,
  FlaskConical,
  Images,
  LayoutPanelTop,
  Palette,
  RefreshCw,
  Send,
  Server,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { useAdminOverview } from "./useAdminOverview";
import { formatLocalDateTime, formatLocalTime } from "@/lib/utils";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function AdminOverviewPage() {
  const { data, isLoading, isFetching, refetch } = useAdminOverview();

  const stats = data?.stats;
  const recentDeliveries = data?.deliveryLogs?.slice(0, 8) || [];
  const monitor = data?.monitorStatus;

  return (
    <AppShell
      requireAdmin
      title="Administrator Overview"
      description="Monitor operational status, server readiness, and recent notification dispatches across Everfall Limited Watcher."
      actions={
        <Button variant="secondary" size="sm" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      }
    >
      {isLoading || !data ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary Stats */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Monitored Listings</span>
                <Activity className="h-4 w-4 text-zinc-400" />
              </div>
              <p className="mt-2 text-2xl font-bold text-white tabular-nums">
                {stats?.totalListings ?? 0}
              </p>
              <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                {stats?.availableListings ?? 0} In Stock &bull; {stats?.soldOutListings ?? 0} Sold Out
              </p>
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Connected Servers</span>
                <Server className="h-4 w-4 text-zinc-400" />
              </div>
              <p className="mt-2 text-2xl font-bold text-white tabular-nums">
                {stats?.connectedServers ?? 0}
              </p>
              <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                {stats?.configuredServers ?? 0} Configured &bull; {stats?.deployedWidgets ?? 0} Widgets &bull; {stats?.testServers ?? 0} Test
              </p>
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Discord Bot Status</span>
                <span className="relative flex h-2.5 w-2.5">
                  <span
                    className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${
                      data.botStatus === "online" ? "bg-emerald-400" : "bg-red-400"
                    }`}
                  />
                  <span
                    className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                      data.botStatus === "online"
                        ? "bg-emerald-500 shadow-[0_0_8px_rgba(52,211,153,1)]"
                        : "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,1)]"
                    }`}
                  />
                </span>
              </div>
              <p className="mt-2 text-lg font-bold text-white">
                {data.botStatus === "online" ? "Bot Online" : "Bot Offline"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                Last check: {monitor?.checkedAt ? formatLocalTime(monitor.checkedAt) : "Not yet run"}
              </p>
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Recent Dispatch Errors</span>
                <Send className="h-4 w-4 text-zinc-400" />
              </div>
              <p className="mt-2 text-2xl font-bold text-white tabular-nums">
                {stats?.recentFailures ?? 0}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Out of {data.deliveryLogs.length} logged deliveries
              </p>
            </Card>
          </div>

          {/* Quick Operational Shortcuts */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Link
              to="/admin/bot"
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition hover:border-white/20"
            >
              <Bot className="h-5 w-5 shrink-0 text-white" />
              <div>
                <p className="text-sm font-semibold text-white">Bot Control</p>
                <p className="text-xs text-muted-foreground">Refresh bot &amp; load slash commands</p>
              </div>
            </Link>
            <Link
              to="/admin/monitor"
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition hover:border-white/20"
            >
              <Activity className="h-5 w-5 shrink-0 text-white" />
              <div>
                <p className="text-sm font-semibold text-white">Store Monitoring</p>
                <p className="text-xs text-muted-foreground">Live telemetry &amp; scans</p>
              </div>
            </Link>
            <Link
              to="/admin/dispatch"
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition hover:border-white/20"
            >
              <Send className="h-5 w-5 shrink-0 text-white" />
              <div>
                <p className="text-sm font-semibold text-white">Dispatch &amp; Edits</p>
                <p className="text-xs text-muted-foreground">Publish or update embeds</p>
              </div>
            </Link>
            <Link
              to="/admin/widgets"
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition hover:border-white/20"
            >
              <LayoutPanelTop className="h-5 w-5 shrink-0 text-white" />
              <div>
                <p className="text-sm font-semibold text-white">Status Widgets</p>
                <p className="text-xs text-muted-foreground">Manage deployed live Discord widgets</p>
              </div>
            </Link>
            <Link
              to="/admin/metadata"
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition hover:border-white/20"
            >
              <SlidersHorizontal className="h-5 w-5 shrink-0 text-white" />
              <div>
                <p className="text-sm font-semibold text-white">Vehicle Metadata</p>
                <p className="text-xs text-muted-foreground">Edit titles, chips &amp; summaries</p>
              </div>
            </Link>
            <Link
              to="/admin/pages"
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition hover:border-white/20"
            >
              <Sparkles className="h-5 w-5 shrink-0 text-white" />
              <div>
                <p className="text-sm font-semibold text-white">Pages &amp; Hero</p>
                <p className="text-xs text-muted-foreground">Edit Home, Features, About &amp; Legal pages</p>
              </div>
            </Link>
            <Link
              to="/admin/images"
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition hover:border-white/20"
            >
              <Images className="h-5 w-5 shrink-0 text-white" />
              <div>
                <p className="text-sm font-semibold text-white">Image Manager</p>
                <p className="text-xs text-muted-foreground">Manage R2 assets &amp; slots</p>
              </div>
            </Link>
            <Link
              to="/admin/embeds"
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition hover:border-white/20"
            >
              <Palette className="h-5 w-5 shrink-0 text-white" />
              <div>
                <p className="text-sm font-semibold text-white">Embed Manager</p>
                <p className="text-xs text-muted-foreground">Edit Discord message layout</p>
              </div>
            </Link>
            <Link
              to="/admin/testing"
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition hover:border-white/20"
            >
              <FlaskConical className="h-5 w-5 shrink-0 text-white" />
              <div>
                <p className="text-sm font-semibold text-white">Test Environment</p>
                <p className="text-xs text-muted-foreground">Isolated test server alerts</p>
              </div>
            </Link>
          </div>

          {/* Recent Delivery Activity */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Recent Delivery Log</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/admin/dispatch">View All</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {recentDeliveries.length === 0 ? (
                <p className="text-sm text-muted-foreground">No notification deliveries logged yet.</p>
              ) : (
                <>
                  {/* Mobile Recent Delivery Cards */}
                  <div className="space-y-2.5 md:hidden">
                    {recentDeliveries.map((entry) => (
                      <div
                        key={entry.id}
                        className="space-y-1.5 rounded-lg border border-border bg-zinc-950/75 p-3 text-xs"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium text-white">{entry.listingName}</span>
                          <Badge
                            variant={
                              entry.status === "delivered" || entry.status === "updated"
                                ? "success"
                                : "destructive"
                            }
                            className="shrink-0"
                          >
                            {entry.status}
                          </Badge>
                        </div>
                        <p className="break-all select-text font-mono text-[11px] text-muted-foreground">
                          Guild {entry.guildId}
                        </p>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <span className="capitalize text-zinc-300">{entry.method}</span>
                            <Badge variant={entry.environment === "test" ? "warning" : "secondary"}>
                              {entry.environment}
                            </Badge>
                          </div>
                          <span className="tabular-nums">{formatLocalDateTime(entry.timestamp)}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop Recent Delivery Table */}
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Vehicle</TableHead>
                          <TableHead>Guild ID</TableHead>
                          <TableHead>Method</TableHead>
                          <TableHead>Environment</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Timestamp</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recentDeliveries.map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell className="font-medium text-white">{entry.listingName}</TableCell>
                            <TableCell className="select-text font-mono text-xs text-muted-foreground">
                              {entry.guildId}
                            </TableCell>
                            <TableCell className="capitalize text-xs text-zinc-300">{entry.method}</TableCell>
                            <TableCell>
                              <Badge variant={entry.environment === "test" ? "warning" : "secondary"}>
                                {entry.environment}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  entry.status === "delivered" || entry.status === "updated"
                                    ? "success"
                                    : "destructive"
                                }
                              >
                                {entry.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground tabular-nums">
                              {formatLocalDateTime(entry.timestamp)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
