import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import {
  AdminOverviewResponse,
  apiFetch,
  ListingItem,
  MonitorLogEntry,
  MonitorLogSource,
} from "@/lib/api";
import { formatLocalDateTime } from "@/lib/utils";
import { ADMIN_OVERVIEW_KEY, useAdminOverview } from "./useAdminOverview";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

function formatSourceLabel(source?: MonitorLogSource): string {
  switch (source) {
    case "cron-fetch":
      return "HTTP Cron";
    case "manual":
      return "Manual Scan";
    case "scheduled":
      return "CF Scheduled";
    default:
      return "Monitor";
  }
}

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function AdminMonitorPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useAdminOverview();
  const [inspectItem, setInspectItem] = useState<ListingItem | null>(null);
  const [inspectLog, setInspectLog] = useState<MonitorLogEntry | null>(null);
  const [logFilter, setLogFilter] = useState<"all" | "success" | "failures">("all");
  const [lastScanSummary, setLastScanSummary] = useState<{
    usedVerifiedStoreResponse: boolean;
    newDiscoveries: number;
    notice: string | null;
    scannedAt: number;
  } | null>(null);

  const scanMutation = useMutation({
    mutationFn: () =>
      apiFetch<{
        ok: boolean;
        usedVerifiedStoreResponse: boolean;
        newDiscoveries: number;
        notice: string | null;
        monitorStatus?: AdminOverviewResponse["monitorStatus"];
        monitorLogs?: MonitorLogEntry[];
        listings?: ListingItem[];
        scannedAt: number;
      }>("/api/admin/monitor/scan", { method: "POST" }),
    onSuccess: (res) => {
      setLastScanSummary(res);
      queryClient.setQueryData<AdminOverviewResponse>(ADMIN_OVERVIEW_KEY, (old) =>
        old
          ? {
              ...old,
              monitorStatus: res.monitorStatus ?? old.monitorStatus,
              monitorLogs: res.monitorLogs ?? old.monitorLogs,
              listings: res.listings ?? old.listings,
            }
          : old
      );
      void queryClient.invalidateQueries({ queryKey: ["public-listings"] });
      if (res.usedVerifiedStoreResponse) {
        toast.success(
          `Read-only store scan complete (${res.newDiscoveries} new discovery/discoveries). Zero Discord messages sent.`
        );
      } else {
        toast.warning(res.notice || "Storefront returned non-authoritative verification response.");
      }
    },
    onError: (err: Error) => {
      toast.error(err.message || "Manual store scan failed.");
    },
  });

  const monitor = data?.monitorStatus;
  const listings = data?.listings || [];
  const monitorLogs = data?.monitorLogs || [];

  const successCount = monitorLogs.filter((entry) => entry.status === "success").length;
  const failureCount = monitorLogs.filter((entry) => entry.status !== "success").length;
  const reliabilityPct =
    monitorLogs.length > 0 ? Math.round((successCount / monitorLogs.length) * 100) : null;

  const filteredLogs = monitorLogs.filter((entry) => {
    if (logFilter === "success") return entry.status === "success";
    if (logFilter === "failures") return entry.status !== "success";
    return true;
  });

  const hasRecentScheduledBlock = monitorLogs
    .slice(0, 10)
    .some((entry) => entry.source === "scheduled" && entry.cloudflareChallenge);

  const cronEndpointUrl =
    typeof window !== "undefined" ? `${window.location.origin}/cron` : "/cron";

  const copyCronEndpoint = async () => {
    try {
      await navigator.clipboard.writeText(cronEndpointUrl);
      toast.success("Copied HTTP Cron endpoint URL");
    } catch {
      toast.info(cronEndpointUrl);
    }
  };

  const copyMonitorLog = async (entry: MonitorLogEntry) => {
    const payload = JSON.stringify(
      {
        id: entry.id,
        timestamp: new Date(entry.timestamp).toISOString(),
        source: entry.source,
        outcome: entry.status,
        httpStatus: entry.httpStatus,
        cloudflareChallenge: entry.cloudflareChallenge,
        authoritative: entry.authoritative,
        responseLength: entry.responseLength,
        durationMs: entry.durationMs,
        targetUrl: entry.targetUrl,
        listingCount: entry.listingCount,
        newDiscoveries: entry.newDiscoveries,
        message: entry.message,
      },
      null,
      2
    );
    try {
      await navigator.clipboard.writeText(payload);
      toast.success("Copied error diagnostic log");
    } catch {
      toast.info("Select the log text below to copy.");
    }
  };

  return (
    <AppShell
      requireAdmin
      title="Store Monitoring"
      description="Inspect 7-day storefront verification telemetry, automated check logs, and run read-only scans without triggering Discord broadcasts."
      actions={
        <Button onClick={() => scanMutation.mutate()} disabled={scanMutation.isPending}>
          {scanMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Scanning Storefront...
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4" />
              Scan Store (Read-Only)
            </>
          )}
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Monitor Diagnostics Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="p-5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Verification Status</span>
              <Activity className="h-4 w-4 text-zinc-400" />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <p className="text-lg font-bold text-white">
                {monitor?.authoritative === false ? "Blocked / Preserved" : "Authoritative"}
              </p>
              <Badge variant="secondary">Every 18m</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Latest check source: {formatSourceLabel(monitor?.lastSource)}
            </p>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Last Store Check</span>
              <Clock className="h-4 w-4 text-zinc-400" />
            </div>
            <p className="mt-2 text-sm font-semibold text-white tabular-nums">
              {monitor?.checkedAt ? formatLocalDateTime(monitor.checkedAt) : "Not yet recorded"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground tabular-nums">
              Last Verified:{" "}
              {monitor?.lastSuccessAt ? formatLocalDateTime(monitor.lastSuccessAt) : "Pending"}
            </p>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>7-Day Check Reliability</span>
              <ShieldAlert className="h-4 w-4 text-zinc-400" />
            </div>
            <p className="mt-2 text-2xl font-bold text-white tabular-nums">
              {reliabilityPct !== null ? `${reliabilityPct}%` : "No Logs"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground tabular-nums">
              {successCount} passed &bull; {failureCount} failed ({monitorLogs.length} checks)
            </p>
          </Card>
        </div>

        {/* Last Manual Scan / Active Notice Banner */}
        {(lastScanSummary || monitor?.notice) && (
          <Card className="border-border bg-zinc-900/70 p-4">
            <div className="flex items-start gap-3 text-xs">
              {lastScanSummary?.usedVerifiedStoreResponse || monitor?.authoritative ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              )}
              <div className="space-y-1">
                <p className="font-semibold text-white">
                  {lastScanSummary
                    ? `Manual Read-Only Scan (${formatLocalDateTime(lastScanSummary.scannedAt)})`
                    : "Latest Monitor Notice"}
                </p>
                <p className="text-muted-foreground">
                  {lastScanSummary?.notice ||
                    monitor?.notice ||
                    `Storefront verified cleanly. ${lastScanSummary?.newDiscoveries ?? 0} new product(s) staged.`}
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Automated Fetch Cron Guidance when Cloudflare Challenge Appears on Native Scheduled Events */}
        {hasRecentScheduledBlock && (
          <Card className="border-amber-500/30 bg-amber-950/20 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1 text-xs">
                <p className="font-semibold text-amber-200">
                  Cloudflare Scheduled Runner Challenge Detected
                </p>
                <p className="text-zinc-300">
                  Tebex&apos;s Cloudflare protection challenges Worker <code className="text-white">scheduled</code> cron triggers (<code className="text-white">403</code>) while permitting <code className="text-white">fetch</code> requests (<code className="text-white">200 OK</code>). Configure <code className="text-white">CRON_SECRET</code> in both Cloudflare Worker Secrets and GitHub Repository Secrets so <code className="text-white">.github/workflows/store-monitor.yml</code> invokes <code className="text-white">POST /cron</code> every 18 minutes via HTTP fetch.
                </p>
                <p className="text-[11px] text-amber-300/90">
                  {monitor?.lastFetchCronSuccessAt
                    ? `Latest HTTP Cron (/cron) success: ${formatLocalDateTime(monitor.lastFetchCronSuccessAt)}`
                    : "No HTTP Cron (/cron) execution recorded yet — configure CRON_SECRET to activate automated fetch-context checks."}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => void copyCronEndpoint()} className="shrink-0">
                <Copy className="h-3.5 w-3.5" />
                Copy /cron URL
              </Button>
            </div>
          </Card>
        )}

        {/* 7-Day Store Monitor Log Table */}
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Store Verification Log (7-Day Retention)</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Every store check attempt and outcome retained cleanly for 7 days.
              </p>
            </div>
            <Tabs value={logFilter} onValueChange={(v) => setLogFilter(v as typeof logFilter)}>
              <TabsList>
                <TabsTrigger value="all">All ({monitorLogs.length})</TabsTrigger>
                <TabsTrigger value="success">Success ({successCount})</TabsTrigger>
                <TabsTrigger value="failures">Failures ({failureCount})</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Loading monitor logs...</div>
            ) : filteredLogs.length === 0 ? (
              <div className="rounded-lg border border-border bg-zinc-950/60 py-8 text-center text-xs text-muted-foreground">
                No store check records match this filter yet.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Trigger</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead>Response</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead className="text-right">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.slice(0, 60).map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="whitespace-nowrap text-xs text-zinc-200 tabular-nums">
                        {formatLocalDateTime(entry.timestamp)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{formatSourceLabel(entry.source)}</Badge>
                      </TableCell>
                      <TableCell>
                        {entry.status === "success" ? (
                          <Badge variant="success">Success</Badge>
                        ) : entry.status === "blocked" ? (
                          <Badge variant="warning">CF Challenge</Badge>
                        ) : (
                          <Badge variant="destructive">Failed</Badge>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs text-zinc-300 tabular-nums">
                        {entry.httpStatus ? `HTTP ${entry.httpStatus}` : "Err"} &bull;{" "}
                        {formatBytes(entry.responseLength)} &bull; {entry.durationMs}ms
                      </TableCell>
                      <TableCell className="max-w-[260px] truncate text-xs text-muted-foreground">
                        {entry.message}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-1">
                          {entry.status !== "success" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label="Copy error log"
                              title="Copy error diagnostic JSON"
                              onClick={() => void copyMonitorLog(entry)}
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => setInspectLog(entry)}>
                            Inspect
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Listing Verification Table */}
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Tracked Listings &amp; Verification State</CardTitle>
            <Button variant="outline" size="sm" asChild className="self-start sm:self-auto">
              <Link to="/admin/dispatch">Open Manual Dispatch</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Loading listings...</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead>Metadata Readiness</TableHead>
                    <TableHead>HTTP Status</TableHead>
                    <TableHead>Last Verified</TableHead>
                    <TableHead className="text-right">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listings.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <p className="font-semibold text-white">{item.name}</p>
                        <p className="font-mono text-[11px] text-muted-foreground">
                          #<span className="select-text cursor-text">{item.id}</span>
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge variant={item.isAvailable ? "success" : "destructive"}>
                          {item.isAvailable ? "In Stock" : "Sold Out"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={item.readiness === "ready" ? "success" : "warning"}>
                          {item.readiness === "ready" ? "Ready to Publish" : "Incomplete"}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-zinc-300">
                        {item.lastHttpStatus ? `HTTP ${item.lastHttpStatus}` : "Unknown"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground tabular-nums">
                        {formatLocalDateTime(item.lastVerifiedAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => setInspectItem(item)}>
                          Inspect
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Inspect Listing Dialog */}
      <Dialog open={Boolean(inspectItem)} onOpenChange={(open) => !open && setInspectItem(null)}>
        {inspectItem && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{inspectItem.name}</DialogTitle>
              <DialogDescription className="font-mono text-xs">
                ID #{inspectItem.id} &bull; {inspectItem.url}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-zinc-950 p-3">
                <div>
                  <span className="text-muted-foreground">First Detected</span>
                  <p className="mt-0.5 text-white">{formatLocalDateTime(inspectItem.detectedAt)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Sold Out Timestamp</span>
                  <p className="mt-0.5 text-white">
                    {inspectItem.soldOutAt ? formatLocalDateTime(inspectItem.soldOutAt) : "N/A"}
                  </p>
                </div>
              </div>
              <p className="text-sm text-zinc-300">{inspectItem.description}</p>
            </div>
          </DialogContent>
        )}
      </Dialog>

      {/* Inspect Monitor Log Entry Dialog */}
      <Dialog open={Boolean(inspectLog)} onOpenChange={(open) => !open && setInspectLog(null)}>
        {inspectLog && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Store Check Record</DialogTitle>
              <DialogDescription className="font-mono text-xs">
                {formatLocalDateTime(inspectLog.timestamp)} &bull; {formatSourceLabel(inspectLog.source)}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-zinc-950 p-3 tabular-nums">
                <div>
                  <span className="text-muted-foreground">Outcome</span>
                  <p className="mt-0.5 font-semibold text-white capitalize">{inspectLog.status}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">HTTP Status</span>
                  <p className="mt-0.5 font-mono text-white">
                    {inspectLog.httpStatus ?? "Network Error"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Cloudflare Challenge</span>
                  <p className="mt-0.5 text-white">
                    {inspectLog.cloudflareChallenge ? "Yes (Blocked)" : "No"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Payload / Duration</span>
                  <p className="mt-0.5 font-mono text-white">
                    {formatBytes(inspectLog.responseLength)} &bull; {inspectLog.durationMs}ms
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Active Listings Found</span>
                  <p className="mt-0.5 text-white">{inspectLog.listingCount}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">New Discoveries</span>
                  <p className="mt-0.5 text-white">{inspectLog.newDiscoveries}</p>
                </div>
              </div>
              <div className="rounded-lg border border-border bg-zinc-950 p-3">
                <span className="text-muted-foreground">Target URL</span>
                <p className="mt-0.5 select-text cursor-text break-all font-mono text-[11px] text-zinc-200">
                  {inspectLog.targetUrl}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-zinc-950 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Log Message</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => void copyMonitorLog(inspectLog)}
                  >
                    <Copy className="h-3 w-3" />
                    Copy Log JSON
                  </Button>
                </div>
                <p className="mt-1.5 select-text cursor-text text-sm text-zinc-200">
                  {inspectLog.message}
                </p>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </AppShell>
  );
}
