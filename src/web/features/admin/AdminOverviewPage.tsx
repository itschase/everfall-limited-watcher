import { Link } from "@tanstack/react-router";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  FlaskConical,
  Palette,
  RefreshCw,
  Send,
  Server,
} from "lucide-react";
import { useAdminOverview } from "./useAdminOverview";
import { formatLocalDateTime, formatLocalTime } from "@/lib/utils";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl border border-border bg-card" />
          ))}
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
                {stats?.configuredServers ?? 0} Configured &bull; {stats?.testServers ?? 0} Test Mode
              </p>
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Store Monitor State</span>
                {data.botStatus === "online" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-amber-400" />
                )}
              </div>
              <p className="mt-2 text-lg font-bold text-white capitalize">{data.botStatus}</p>
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Link
              to="/admin/monitor"
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition hover:border-white/20"
            >
              <Activity className="h-5 w-5 text-white" />
              <div>
                <p className="text-sm font-semibold text-white">Store Monitoring</p>
                <p className="text-xs text-muted-foreground">Run read-only storefront scan</p>
              </div>
            </Link>
            <Link
              to="/admin/dispatch"
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition hover:border-white/20"
            >
              <Send className="h-5 w-5 text-white" />
              <div>
                <p className="text-sm font-semibold text-white">Dispatch &amp; Deliveries</p>
                <p className="text-xs text-muted-foreground">Confirmed manual publishing</p>
              </div>
            </Link>
            <Link
              to="/admin/embeds"
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition hover:border-white/20"
            >
              <Palette className="h-5 w-5 text-white" />
              <div>
                <p className="text-sm font-semibold text-white">Embed Manager</p>
                <p className="text-xs text-muted-foreground">Edit Discord message layout</p>
              </div>
            </Link>
            <Link
              to="/admin/testing"
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition hover:border-white/20"
            >
              <FlaskConical className="h-5 w-5 text-white" />
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
                        <TableCell className="font-mono text-xs text-muted-foreground">
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
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
