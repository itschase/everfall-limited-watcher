import { QueryState } from "@/components/common/QueryState";
import {
  SummaryGrid,
  SummaryMetric,
} from "@/components/common/DashboardSummary";
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
  const { data, error, isLoading, isFetching, refetch } = useAdminOverview();

  const stats = data?.stats;
  const recentDeliveries = data?.deliveryLogs?.slice(0, 8) || [];
  const monitor = data?.monitorStatus;

  if (error && !data)
    return (
      <AppShell requireAdmin title="Administrator Overview">
        <QueryState error={error} onRetry={() => void refetch()} />
      </AppShell>
    );

  return (
    <AppShell
      requireAdmin
      title="Administrator Overview"
      description="Check listing availability, server readiness, and recent deliveries."
      actions={
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void refetch()}
          disabled={isFetching}
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      }
    >
      {isLoading || !data ? (
        <div className="space-y-5">
          <SummaryGrid>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl" />
            ))}
          </SummaryGrid>
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : (
        <div className="space-y-5">
          {error && <QueryState error={error} title="Showing the last available information" onRetry={() => void refetch()}>The latest refresh failed. Existing information is preserved while you retry.</QueryState>}
          <SummaryGrid>
            <SummaryMetric
              label="Monitored listings"
              value={stats?.totalListings ?? 0}
              icon={Activity}
              hint={
                String(stats?.availableListings ?? 0) +
                " in stock · " +
                String(stats?.soldOutListings ?? 0) +
                " sold out"
              }
            />
            <SummaryMetric
              label="Connected servers"
              value={stats?.connectedServers ?? 0}
              icon={Server}
              hint={
                String(stats?.configuredServers ?? 0) +
                " configured · " +
                String(stats?.deployedWidgets ?? 0) +
                " widgets"
              }
            />
            <SummaryMetric
              label="Discord bot"
              value={data.botStatus === "online" ? "Online" : "Offline"}
              icon={Bot}
              tone={data.botStatus === "online" ? "success" : "danger"}
              hint={
                monitor?.checkedAt
                  ? "Checked " + formatLocalTime(monitor.checkedAt)
                  : "Not checked yet"
              }
            />
            <SummaryMetric
              label="Delivery errors"
              value={stats?.recentFailures ?? 0}
              icon={Send}
              tone={stats?.recentFailures ? "danger" : "neutral"}
              hint={"From " + data.deliveryLogs.length + " logged deliveries"}
            />
          </SummaryGrid>

          <details className="rounded-xl border border-border bg-card">
            <summary className="cursor-pointer rounded-xl px-4 py-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Quick links{" "}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                Common management tools
              </span>
            </summary>
            <div className="px-3 pb-3">
              {" "}
              {/* Quick Operational Shortcuts */}
              <div className="grid gap-4 @xl/main:grid-cols-2 @3xl/main:grid-cols-3">
                <Link
                  to="/admin/bot"
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition hover:border-white/20"
                >
                  <Bot className="h-5 w-5 shrink-0 text-white" />
                  <div>
                    <p className="text-sm font-semibold text-white">
                      Bot Control
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Refresh bot &amp; load slash commands
                    </p>
                  </div>
                </Link>
                <Link
                  to="/admin/monitor"
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition hover:border-white/20"
                >
                  <Activity className="h-5 w-5 shrink-0 text-white" />
                  <div>
                    <p className="text-sm font-semibold text-white">
                      Store Monitoring
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Live telemetry &amp; scans
                    </p>
                  </div>
                </Link>
                <Link
                  to="/admin/dispatch"
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition hover:border-white/20"
                >
                  <Send className="h-5 w-5 shrink-0 text-white" />
                  <div>
                    <p className="text-sm font-semibold text-white">
                      Dispatch &amp; Edits
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Publish or update embeds
                    </p>
                  </div>
                </Link>
                <Link
                  to="/admin/widgets"
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition hover:border-white/20"
                >
                  <LayoutPanelTop className="h-5 w-5 shrink-0 text-white" />
                  <div>
                    <p className="text-sm font-semibold text-white">
                      Status Widgets
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Manage deployed live Discord widgets
                    </p>
                  </div>
                </Link>
                <Link
                  to="/admin/metadata"
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition hover:border-white/20"
                >
                  <SlidersHorizontal className="h-5 w-5 shrink-0 text-white" />
                  <div>
                    <p className="text-sm font-semibold text-white">
                      Vehicle Metadata
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Edit titles, chips &amp; summaries
                    </p>
                  </div>
                </Link>
                <Link
                  to="/admin/pages"
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition hover:border-white/20"
                >
                  <Sparkles className="h-5 w-5 shrink-0 text-white" />
                  <div>
                    <p className="text-sm font-semibold text-white">
                      Pages &amp; Hero
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Edit Home, Features, About &amp; Legal pages
                    </p>
                  </div>
                </Link>
                <Link
                  to="/admin/images"
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition hover:border-white/20"
                >
                  <Images className="h-5 w-5 shrink-0 text-white" />
                  <div>
                    <p className="text-sm font-semibold text-white">
                      Image Manager
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Organize vehicle images and gallery order
                    </p>
                  </div>
                </Link>
                <Link
                  to="/admin/embeds"
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition hover:border-white/20"
                >
                  <Palette className="h-5 w-5 shrink-0 text-white" />
                  <div>
                    <p className="text-sm font-semibold text-white">
                      Embed Manager
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Edit Discord message layout
                    </p>
                  </div>
                </Link>
                <Link
                  to="/admin/testing"
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition hover:border-white/20"
                >
                  <FlaskConical className="h-5 w-5 shrink-0 text-white" />
                  <div>
                    <p className="text-sm font-semibold text-white">
                      Test Environment
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Isolated test server alerts
                    </p>
                  </div>
                </Link>
              </div>
            </div>
          </details>

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
                <p className="text-sm text-muted-foreground">
                  No notification deliveries logged yet.
                </p>
              ) : (
                <>
                  {/* Mobile Recent Delivery Cards */}
                  <div className="space-y-2.5 @3xl/main:hidden">
                    {recentDeliveries.map((entry) => (
                      <div
                        key={entry.id}
                        className="space-y-1.5 rounded-lg border border-border bg-zinc-950/75 p-3 text-xs"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium text-white">
                            {entry.listingName}
                          </span>
                          <Badge
                            variant={
                              entry.status === "delivered" ||
                              entry.status === "updated"
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
                            <span className="capitalize text-zinc-300">
                              {entry.method}
                            </span>
                            <Badge
                              variant={
                                entry.environment === "test"
                                  ? "warning"
                                  : "secondary"
                              }
                            >
                              {entry.environment}
                            </Badge>
                          </div>
                          <span className="tabular-nums">
                            {formatLocalDateTime(entry.timestamp)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop Recent Delivery Table */}
                  <div className="hidden @3xl/main:block">
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
                            <TableCell className="font-medium text-white">
                              {entry.listingName}
                            </TableCell>
                            <TableCell className="select-text font-mono text-xs text-muted-foreground">
                              {entry.guildId}
                            </TableCell>
                            <TableCell className="capitalize text-xs text-zinc-300">
                              {entry.method}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  entry.environment === "test"
                                    ? "warning"
                                    : "secondary"
                                }
                              >
                                {entry.environment}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  entry.status === "delivered" ||
                                  entry.status === "updated"
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
