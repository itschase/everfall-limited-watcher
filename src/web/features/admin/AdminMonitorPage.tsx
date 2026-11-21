import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  Images,
  Loader2,
  Radio,
  RefreshCw,
  Search,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import {
  AdminMonitorUpdatesResponse,
  AdminOverviewResponse,
  apiFetch,
  ListingItem,
  MonitorLogEntry,
  MonitorLogSource,
} from "@/lib/api";
import {
  CHECK_INTERVAL_LABEL,
  CHECK_INTERVAL_SHORT,
  STORE_MONITOR_INTERVAL_MINUTES,
} from "../../../shared/appConfig";
import { formatLocalDateTime, formatLocalTime, safeExternalUrl } from "@/lib/utils";
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
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function formatSourceLabel(source?: MonitorLogSource): string {
  switch (source) {
    case "scrapling":
      return "Scrapling";
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

function formatBytes(bytes: number | null | undefined): string {
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
  const [logSearch, setLogSearch] = useState("");
  const [logPage, setLogPage] = useState(1);
  const logPageSize = 40;
  const [lastScanSummary, setLastScanSummary] = useState<{
    usedVerifiedStoreResponse: boolean;
    newDiscoveries: number;
    notice: string | null;
    scannedAt: number;
  } | null>(null);

  // Lightweight 30s delta polling (1 KV read when idle) to live-update logs & listings without full overview reloads
  const currentCheckedAt = data?.monitorStatus?.checkedAt ?? 0;
  const currentCatalogVersion = data?.catalogVersion ?? data?.monitorStatus?.catalogVersion ?? 0;

  const { data: deltaData, isFetching: isDeltaFetching } = useQuery({
    queryKey: ["admin-monitor-updates", currentCheckedAt, currentCatalogVersion],
    queryFn: () =>
      apiFetch<AdminMonitorUpdatesResponse>(
        `/api/admin/monitor/updates?checkedAt=${currentCheckedAt}&catalogVersion=${currentCatalogVersion}`
      ),
    enabled: Boolean(data),
    staleTime: 25_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!deltaData?.changed) return;
    queryClient.setQueryData<AdminOverviewResponse>(ADMIN_OVERVIEW_KEY, (old) => {
      if (!old) return old;
      const nextListings = deltaData.listings ?? old.listings;
      return {
        ...old,
        botStatus: deltaData.botStatus ?? old.botStatus,
        catalogVersion: deltaData.catalogVersion ?? old.catalogVersion,
        monitorStatus: deltaData.monitorStatus ?? old.monitorStatus,
        monitorLogs: deltaData.monitorLogs ?? old.monitorLogs,
        listings: nextListings,
        stats: deltaData.listings
          ? {
              ...old.stats,
              totalListings: nextListings.length,
              availableListings: nextListings.filter((l) => l.isAvailable).length,
              soldOutListings: nextListings.filter((l) => !l.isAvailable).length,
            }
          : old.stats,
      };
    });
    if (deltaData.listings) {
      void queryClient.invalidateQueries({ queryKey: ["public-listings"] });
      void queryClient.invalidateQueries({ queryKey: ["public-status"] });
    }
  }, [deltaData, queryClient]);

  const scanMutation = useMutation({
    mutationFn: () =>
      apiFetch<{
        ok: boolean;
        usedVerifiedStoreResponse: boolean;
        newDiscoveries: number;
        notice: string | null;
        catalogVersion?: number;
        monitorStatus?: AdminOverviewResponse["monitorStatus"];
        monitorLogs?: MonitorLogEntry[];
        listings?: ListingItem[];
        scannedAt: number;
      }>("/api/admin/monitor/scan", { method: "POST" }),
    onSuccess: (res) => {
      setLastScanSummary(res);
      queryClient.setQueryData<AdminOverviewResponse>(ADMIN_OVERVIEW_KEY, (old) => {
        if (!old) return old;
        const nextListings = res.listings ?? old.listings;
        return {
          ...old,
          catalogVersion: res.catalogVersion ?? old.catalogVersion,
          monitorStatus: res.monitorStatus ?? old.monitorStatus,
          monitorLogs: res.monitorLogs ?? old.monitorLogs,
          listings: nextListings,
          stats: res.listings
            ? {
                ...old.stats,
                totalListings: nextListings.length,
                availableListings: nextListings.filter((l) => l.isAvailable).length,
                soldOutListings: nextListings.filter((l) => !l.isAvailable).length,
              }
            : old.stats,
        };
      });
      void queryClient.invalidateQueries({ queryKey: ["public-listings"] });
      void queryClient.invalidateQueries({ queryKey: ["public-status"] });
      if (res.usedVerifiedStoreResponse) {
        toast.success(
          `Read-only store scan complete (${res.newDiscoveries} new discovery/discoveries). Live widgets refreshed.`
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

  const filteredLogs = useMemo(() => {
    const q = logSearch.trim().toLowerCase();
    return monitorLogs.filter((entry) => {
      if (logFilter === "success" && entry.status !== "success") return false;
      if (logFilter === "failures" && entry.status === "success") return false;
      if (!q) return true;
      const haystacks = [
        entry.message,
        entry.targetUrl,
        entry.runner || "",
        entry.source,
        entry.httpStatus ? String(entry.httpStatus) : "",
        ...(entry.detectedListingIds || []),
        ...(entry.detectedListingNames || []),
        ...(entry.soldOutListingIds || []),
      ]
        .join(" ")
        .toLowerCase();
      return haystacks.includes(q);
    });
  }, [logFilter, logSearch, monitorLogs]);

  const totalLogPages = Math.max(1, Math.ceil(filteredLogs.length / logPageSize));
  const safeLogPage = Math.min(logPage, totalLogPages);
  const pagedLogs = filteredLogs.slice((safeLogPage - 1) * logPageSize, safeLogPage * logPageSize);

  const latestScraplingSuccess = monitorLogs.find(
    (entry) => entry.source === "scrapling" && entry.status === "success"
  );
  const latestBlockedCheck = monitorLogs.find(
    (entry) =>
      (entry.source === "scheduled" || entry.source === "cron-fetch") &&
      entry.cloudflareChallenge
  );
  const hasRecentScheduledBlock =
    Boolean(latestBlockedCheck) &&
    (!latestScraplingSuccess || latestBlockedCheck!.timestamp > latestScraplingSuccess.timestamp);

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
        runner: entry.runner,
        workflowRunUrl: entry.workflowRunUrl,
        outcome: entry.status,
        httpStatus: entry.httpStatus,
        cloudflareChallenge: entry.cloudflareChallenge,
        authoritative: entry.authoritative,
        responseLength: entry.responseLength,
        durationMs: entry.durationMs,
        targetUrl: entry.targetUrl,
        listingCount: entry.listingCount,
        newDiscoveries: entry.newDiscoveries,
        detectedListingIds: entry.detectedListingIds,
        detectedListingNames: entry.detectedListingNames,
        soldOutListingIds: entry.soldOutListingIds,
        dispatchedDrops: entry.dispatchedDrops,
        preservedHistoryCount: entry.preservedHistoryCount,
        message: entry.message,
        attempts: entry.attempts,
      },
      null,
      2
    );
    try {
      await navigator.clipboard.writeText(payload);
      toast.success("Copied complete diagnostic telemetry JSON");
    } catch {
      toast.info("Select text inside the inspection dialog to copy.");
    }
  };

  const handleRowClick = (fn: () => void) => {
    const sel = typeof window !== "undefined" ? window.getSelection()?.toString() : "";
    if (sel && sel.trim().length > 0) return;
    fn();
  };

  return (
    <AppShell
      requireAdmin
      title="Store Monitoring"
      description="Inspect 7-day storefront verification telemetry, live auto-sync logs, and run read-only scans without triggering new drop alerts."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1.5 font-mono text-[11px] tabular-nums">
            <Radio className={`h-3 w-3 ${isDeltaFetching ? "animate-pulse text-emerald-400" : "text-emerald-400"}`} />
            Auto-Sync 30s
          </Badge>
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
        </div>
      }
    >
      <div className="space-y-6">
        {/* Monitor Diagnostics Summary Cards */}
        {isLoading ? (
          <div className="grid gap-4 @xl/main:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 @xl/main:grid-cols-3">
            <Card className="p-5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Verification Status</span>
                <Activity className="h-4 w-4 text-zinc-400" />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <p className="text-lg font-bold text-white">
                  {monitor?.authoritative === false ? "Blocked / Preserved" : "Authoritative"}
                </p>
                <Badge variant="secondary">{CHECK_INTERVAL_SHORT}</Badge>
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
        )}

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
            <div className="flex flex-col gap-3 @2xl/main:flex-row @2xl/main:items-center @2xl/main:justify-between">
              <div className="space-y-1 text-xs">
                <p className="font-semibold text-amber-200">
                  Cloudflare Scheduled Challenge Active — Scrapling Sync Recommended
                </p>
                <p className="text-zinc-300">
                  Tebex&apos;s Cloudflare protection blocks raw HTTP checks (<code className="text-white">403</code>). Ensure <code className="text-white">CRON_SECRET</code> matches in both GitHub Secrets and Cloudflare Secrets so <strong className="text-white">Scheduled Store Monitor (Scrapling)</strong> automatically verifies the storefront {CHECK_INTERVAL_LABEL.toLowerCase()} on <code className="text-white">master</code>.
                </p>
                <p className="text-[11px] text-amber-300/90">
                  {monitor?.lastFetchCronSuccessAt
                    ? `Latest automated Scrapling sync: ${formatLocalDateTime(monitor.lastFetchCronSuccessAt)}`
                    : `No automated Scrapling sync recorded yet — waiting for the next ${STORE_MONITOR_INTERVAL_MINUTES}-minute Scrapling run.`}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => void copyCronEndpoint()} className="shrink-0">
                <Copy className="h-3.5 w-3.5" />
                Copy /cron URL
              </Button>
            </div>
          </Card>
        )}

        {/* 7-Day Store Monitor Log Table (10 visible rows max with scroll, up to 40 per page) */}
        <Card>
          <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Store Verification Log (7-Day Retention)</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Click any row to inspect runner telemetry, detected vehicles, HTTP attempt traces, and raw JSON. Showing up to 40 logs per page.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative w-full sm:w-56">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={logSearch}
                  onChange={(e) => {
                    setLogSearch(e.target.value);
                    setLogPage(1);
                  }}
                  placeholder="Search IDs, runner, URL..."
                  className="h-9 pl-8 text-xs"
                />
              </div>
              <Tabs
                value={logFilter}
                onValueChange={(v) => {
                  setLogFilter(v as typeof logFilter);
                  setLogPage(1);
                }}
              >
                <TabsList>
                  <TabsTrigger value="all">All ({monitorLogs.length})</TabsTrigger>
                  <TabsTrigger value="success">Success ({successCount})</TabsTrigger>
                  <TabsTrigger value="failures">Failures ({failureCount})</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2 py-2">
                {Array.from({ length: 5 }).map((_, idx) => (
                  <Skeleton key={idx} className="h-10 w-full" />
                ))}
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="rounded-lg border border-border bg-zinc-950/60 py-8 text-center text-xs text-muted-foreground">
                No store check records match this filter yet.
              </div>
            ) : (
              <>
                {/* Mobile Log Cards */}
                <div className="space-y-2.5 @3xl/main:hidden">
                  {pagedLogs.map((entry) => (
                    <div
                      key={`m-mon-${entry.id}`}
                      onClick={() => handleRowClick(() => setInspectLog(entry))}
                      className="cursor-pointer space-y-2 rounded-lg border border-border bg-zinc-950 p-3.5 text-xs transition hover:border-zinc-700"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Badge variant="secondary">{formatSourceLabel(entry.source)}</Badge>
                          <p className="mt-1 select-text text-[11px] text-muted-foreground tabular-nums">
                            {formatLocalDateTime(entry.timestamp)}
                          </p>
                        </div>
                        {entry.status === "success" ? (
                          <Badge variant="success">Success</Badge>
                        ) : entry.status === "blocked" ? (
                          <Badge variant="warning">CF Challenge</Badge>
                        ) : (
                          <Badge variant="destructive">Failed</Badge>
                        )}
                      </div>
                      <p className="select-text break-words text-xs text-zinc-200">{entry.message}</p>
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-2">
                        <span className="font-mono text-[11px] text-zinc-300 tabular-nums">
                          {entry.httpStatus ? `HTTP ${entry.httpStatus}` : "Err"} &bull;{" "}
                          {formatBytes(entry.responseLength)} &bull; {entry.durationMs}ms
                        </span>
                        <div
                          className="flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label="Copy log telemetry"
                            onClick={() => void copyMonitorLog(entry)}
                            className="h-7 px-2"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setInspectLog(entry)}
                            className="h-7 px-2.5 text-xs"
                          >
                            Inspect
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop Table */}
                <div className="hidden rounded-lg border border-border bg-zinc-950/40 @3xl/main:block">
                  <Table containerClassName="thin-scrollbar max-h-[470px] overflow-y-auto overflow-x-auto">
                    <TableHeader className="sticky top-0 z-10 bg-zinc-950/95 backdrop-blur">
                      <TableRow>
                        <TableHead>Timestamp</TableHead>
                        <TableHead>Trigger / Runner</TableHead>
                        <TableHead>Outcome</TableHead>
                        <TableHead>Response</TableHead>
                        <TableHead>Activity</TableHead>
                        <TableHead>Result</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagedLogs.map((entry) => (
                        <TableRow
                          key={entry.id}
                          onClick={() => handleRowClick(() => setInspectLog(entry))}
                          className="cursor-pointer hover:bg-zinc-900/75"
                        >
                          <TableCell className="select-text whitespace-nowrap text-xs text-zinc-200 tabular-nums py-2.5">
                            {formatLocalDateTime(entry.timestamp)}
                          </TableCell>
                          <TableCell className="py-2.5">
                            <div className="flex flex-col gap-0.5">
                              <Badge variant="secondary" className="w-fit">
                                {formatSourceLabel(entry.source)}
                              </Badge>
                              {entry.runner && (
                                <span className="select-text text-[10px] text-muted-foreground truncate max-w-[140px]">
                                  {entry.runner}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="py-2.5">
                            {entry.status === "success" ? (
                              <Badge variant="success">Success</Badge>
                            ) : entry.status === "blocked" ? (
                              <Badge variant="warning">CF Challenge</Badge>
                            ) : (
                              <Badge variant="destructive">Failed</Badge>
                            )}
                          </TableCell>
                          <TableCell className="select-text whitespace-nowrap font-mono text-xs text-zinc-300 tabular-nums py-2.5">
                            {entry.httpStatus ? `HTTP ${entry.httpStatus}` : "Err"} &bull;{" "}
                            {formatBytes(entry.responseLength)} &bull; {entry.durationMs}ms
                          </TableCell>
                          <TableCell className="py-2.5">
                            <div className="flex flex-wrap items-center gap-1 text-[11px] tabular-nums">
                              <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                                {entry.listingCount} active
                              </Badge>
                              {entry.newDiscoveries > 0 && (
                                <Badge variant="success" className="px-1.5 py-0 text-[10px]">
                                  +{entry.newDiscoveries} new
                                </Badge>
                              )}
                              {(entry.soldOutListingIds?.length || 0) > 0 && (
                                <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">
                                  {entry.soldOutListingIds?.length} sold out
                                </Badge>
                              )}
                              {(entry.dispatchedDrops || 0) > 0 && (
                                <Badge variant="info" className="px-1.5 py-0 text-[10px]">
                                  {entry.dispatchedDrops} sent
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="select-text max-w-[230px] truncate text-xs text-muted-foreground py-2.5">
                            {entry.message}
                          </TableCell>
                          <TableCell className="text-right py-2.5" onClick={(e) => e.stopPropagation()}>
                            <div className="inline-flex items-center gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    aria-label="Copy log telemetry"
                                    onClick={() => void copyMonitorLog(entry)}
                                    className="h-7 px-2"
                                  >
                                    <Copy className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Copy log telemetry JSON</TooltipContent>
                              </Tooltip>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setInspectLog(entry)}
                                className="h-7 px-2.5 text-xs"
                              >
                                Inspect
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}

            {/* Pagination Controls (up to 40 results per page) */}
            {filteredLogs.length > logPageSize && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-xs text-muted-foreground">
                <span className="tabular-nums">
                  Showing {(safeLogPage - 1) * logPageSize + 1}–
                  {Math.min(safeLogPage * logPageSize, filteredLogs.length)} of {filteredLogs.length} logs (scroll inside table for &gt;10 rows)
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

        {/* Listing Verification Table */}
        <Card>
          <CardHeader className="flex flex-col gap-3 @2xl/main:flex-row @2xl/main:items-center @2xl/main:justify-between">
            <CardTitle>Tracked Listings &amp; Verification State</CardTitle>
            <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
              <Button variant="outline" size="sm" asChild>
                <Link to="/admin/images">
                  <Images className="h-3.5 w-3.5" />
                  Image Manager
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to="/admin/dispatch">Open Manual Dispatch</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2 py-2">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <Skeleton key={idx} className="h-11 w-full" />
                ))}
              </div>
            ) : (
              <>
                {/* Mobile Tracked Listings Cards */}
                <div className="space-y-2.5 @3xl/main:hidden">
                  {listings.map((item) => (
                    <div
                      key={`m-item-${item.id}`}
                      onClick={() => handleRowClick(() => setInspectItem(item))}
                      className="cursor-pointer space-y-2 rounded-lg border border-border bg-zinc-950 p-3.5 text-xs transition hover:border-zinc-700"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-white">{item.name}</p>
                          <p className="select-text font-mono text-[11px] text-muted-foreground">
                            #{item.id}
                          </p>
                        </div>
                        <Badge variant={item.isAvailable ? "success" : "destructive"}>
                          {item.isAvailable ? "In Stock" : "Sold Out"}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant={item.readiness === "ready" ? "success" : "warning"}>
                          {item.readiness === "ready" ? "Ready" : "Incomplete"}
                        </Badge>
                        <span className="font-mono text-[11px] text-zinc-300">
                          {item.lastHttpStatus ? `HTTP ${item.lastHttpStatus}` : "Unknown"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 border-t border-border/70 pt-2">
                        <span className="text-[11px] text-muted-foreground tabular-nums">
                          {formatLocalDateTime(item.lastVerifiedAt)}
                        </span>
                        <div
                          className="flex items-center gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button variant="outline" size="sm" asChild className="h-7 px-2 text-xs">
                            <a href={`/admin/images?listingId=${encodeURIComponent(item.id)}`}>
                              <Images className="h-3 w-3" />
                              Images
                            </a>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setInspectItem(item)}
                            className="h-7 px-2 text-xs"
                          >
                            Inspect
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop Table */}
                <div className="hidden @3xl/main:block">
                  <Table containerClassName="thin-scrollbar max-h-[470px] overflow-y-auto overflow-x-auto">
                    <TableHeader className="sticky top-0 z-10 bg-zinc-950/95 backdrop-blur">
                      <TableRow>
                        <TableHead>Vehicle</TableHead>
                        <TableHead>Stock</TableHead>
                        <TableHead>Metadata Readiness</TableHead>
                        <TableHead>HTTP Status</TableHead>
                        <TableHead>Last Verified</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {listings.map((item) => (
                        <TableRow
                          key={item.id}
                          onClick={() => handleRowClick(() => setInspectItem(item))}
                          className="cursor-pointer hover:bg-zinc-900/75"
                        >
                          <TableCell className="py-2.5">
                            <p className="font-semibold text-white">{item.name}</p>
                            <p className="font-mono text-[11px] text-muted-foreground">
                              #<span className="select-text cursor-text">{item.id}</span>
                            </p>
                          </TableCell>
                          <TableCell className="py-2.5">
                            <Badge variant={item.isAvailable ? "success" : "destructive"}>
                              {item.isAvailable ? "In Stock" : "Sold Out"}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-2.5">
                            <Badge variant={item.readiness === "ready" ? "success" : "warning"}>
                              {item.readiness === "ready" ? "Ready to Publish" : "Incomplete"}
                            </Badge>
                          </TableCell>
                          <TableCell className="select-text font-mono text-xs text-zinc-300 py-2.5">
                            {item.lastHttpStatus ? `HTTP ${item.lastHttpStatus}` : "Unknown"}
                          </TableCell>
                          <TableCell className="select-text text-xs text-muted-foreground tabular-nums py-2.5">
                            {formatLocalDateTime(item.lastVerifiedAt)}
                          </TableCell>
                          <TableCell className="text-right py-2.5" onClick={(e) => e.stopPropagation()}>
                            <div className="inline-flex items-center gap-1.5">
                              <Button variant="outline" size="sm" asChild className="h-7 px-2 text-xs">
                                <a href={`/admin/images?listingId=${encodeURIComponent(item.id)}`}>
                                  <Images className="h-3 w-3" />
                                  Edit Images
                                </a>
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setInspectItem(item)}
                                className="h-7 px-2 text-xs"
                              >
                                Inspect
                              </Button>
                            </div>
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

      {/* Inspect Listing Dialog */}
      <Dialog open={Boolean(inspectItem)} onOpenChange={(open) => !open && setInspectItem(null)}>
        {inspectItem && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{inspectItem.name}</DialogTitle>
              <DialogDescription className="font-mono text-xs">
                ID #<span className="select-text text-zinc-200">{inspectItem.id}</span> &bull;{" "}
                <span className="select-text">{inspectItem.url}</span>
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-zinc-950 p-3 tabular-nums">
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
                <div>
                  <span className="text-muted-foreground">Last Verified</span>
                  <p className="mt-0.5 text-white">{formatLocalDateTime(inspectItem.lastVerifiedAt)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Archived Images</span>
                  <p className="mt-0.5 text-white">{inspectItem.images.length} slot(s)</p>
                </div>
              </div>
              <p className="select-text text-sm text-zinc-300">{inspectItem.description}</p>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" size="sm" asChild>
                  <a href={`/admin/images?listingId=${encodeURIComponent(inspectItem.id)}`}>
                    <Images className="h-3.5 w-3.5" />
                    Edit Image Set
                  </a>
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>

      {/* Enriched Inspect Monitor Log Entry Dialog */}
      <Dialog open={Boolean(inspectLog)} onOpenChange={(open) => !open && setInspectLog(null)}>
        {inspectLog && (
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <div className="flex flex-wrap items-center justify-between gap-2 pr-8">
                <DialogTitle>Store Check Record</DialogTitle>
                {inspectLog.status === "success" ? (
                  <Badge variant="success">Verified Success</Badge>
                ) : inspectLog.status === "blocked" ? (
                  <Badge variant="warning">CF Challenge</Badge>
                ) : (
                  <Badge variant="destructive">Failed</Badge>
                )}
              </div>
              <DialogDescription className="font-mono text-xs">
                {formatLocalDateTime(inspectLog.timestamp)} &bull; {formatSourceLabel(inspectLog.source)}
                {inspectLog.runner ? ` • ${inspectLog.runner}` : ""}
              </DialogDescription>
            </DialogHeader>
            <div className="thin-scrollbar max-h-[75vh] space-y-3 overflow-y-auto pr-1 text-xs">
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-zinc-950 p-3.5 sm:grid-cols-3 tabular-nums">
                <div>
                  <span className="text-muted-foreground">HTTP Status</span>
                  <p className="mt-0.5 select-text font-mono text-white">
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
                  <p className="mt-0.5 select-text font-mono text-white">
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
                <div>
                  <span className="text-muted-foreground">Dispatched Drops</span>
                  <p className="mt-0.5 text-white">{inspectLog.dispatchedDrops ?? 0}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Preserved History</span>
                  <p className="mt-0.5 text-white">
                    {inspectLog.preservedHistoryCount ?? "—"} total record(s)
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Runner</span>
                  <p className="mt-0.5 select-text text-white">{inspectLog.runner || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Log ID</span>
                  <p className="mt-0.5 select-text truncate font-mono text-zinc-300">{inspectLog.id}</p>
                </div>
              </div>

              {(inspectLog.detectedListingIds?.length || inspectLog.soldOutListingIds?.length) ? (
                <div className="grid gap-3 @xl/main:grid-cols-2">
                  <div className="rounded-lg border border-border bg-zinc-950 p-3">
                    <span className="text-muted-foreground">Detected Active Vehicles</span>
                    {inspectLog.detectedListingIds?.length ? (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {inspectLog.detectedListingIds.map((id, i) => (
                          <Badge key={id} variant="success" className="select-text font-mono text-[11px]">
                            {inspectLog.detectedListingNames?.[i]
                              ? `${inspectLog.detectedListingNames[i]} (#${id})`
                              : `#${id}`}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1 text-muted-foreground">None active</p>
                    )}
                  </div>

                  <div className="rounded-lg border border-border bg-zinc-950 p-3">
                    <span className="text-muted-foreground">Confirmed Newly Sold Out</span>
                    {inspectLog.soldOutListingIds?.length ? (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {inspectLog.soldOutListingIds.map((id) => (
                          <Badge key={id} variant="destructive" className="select-text font-mono text-[11px]">
                            #{id}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1 text-muted-foreground">No new sell-outs</p>
                    )}
                  </div>
                </div>
              ) : null}

              {inspectLog.attempts && inspectLog.attempts.length > 0 && (
                <div className="rounded-lg border border-border bg-zinc-950 p-3">
                  <span className="mb-2 block text-muted-foreground">
                    Endpoint Verification Trace ({inspectLog.attempts.length} attempt
                    {inspectLog.attempts.length === 1 ? "" : "s"})
                  </span>
                  <div className="space-y-1.5">
                    {inspectLog.attempts.map((attempt, idx) => (
                      <div
                        key={idx}
                        className="flex flex-wrap items-center justify-between gap-2 rounded border border-border/70 bg-zinc-900/60 px-2.5 py-1.5 font-mono text-[11px]"
                      >
                        <span className="select-text truncate max-w-[260px] text-zinc-200">
                          {attempt.url}
                        </span>
                        <span className="select-text text-muted-foreground tabular-nums">
                          {attempt.httpStatus ? `HTTP ${attempt.httpStatus}` : "Err"} &bull;{" "}
                          {formatBytes(attempt.responseLength)} &bull; {attempt.durationMs}ms
                          {attempt.note ? ` • ${attempt.note}` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-border bg-zinc-950 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Target URL</span>
                  {safeExternalUrl(inspectLog.workflowRunUrl) && (
                    <a
                      href={safeExternalUrl(inspectLog.workflowRunUrl)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-300 hover:text-sky-200 hover:underline"
                    >
                      View Workflow Run
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                <p className="mt-1 select-text cursor-text break-all font-mono text-[11px] text-zinc-200">
                  {inspectLog.targetUrl}
                </p>
              </div>

              <div className="rounded-lg border border-border bg-zinc-950 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Diagnostic Summary</span>
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
