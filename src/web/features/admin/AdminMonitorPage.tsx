import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Activity, AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, ListingItem } from "@/lib/api";
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

export function AdminMonitorPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useAdminOverview();
  const [inspectItem, setInspectItem] = useState<ListingItem | null>(null);
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
        scannedAt: number;
      }>("/api/admin/monitor/scan", { method: "POST" }),
    onSuccess: (res) => {
      setLastScanSummary(res);
      void queryClient.invalidateQueries({ queryKey: ADMIN_OVERVIEW_KEY });
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

  return (
    <AppShell
      requireAdmin
      title="Store Monitoring"
      description="Inspect live Everfall storefront verification status and run read-only manual scans without triggering Discord broadcasts."
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
        {/* Monitor Diagnostics */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="p-5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Verification Status</span>
              <Activity className="h-4 w-4 text-zinc-400" />
            </div>
            <p className="mt-2 text-lg font-bold text-white">
              {monitor?.authoritative === false ? "Degraded / Challenged" : "Authoritative"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Manual scans never publish Discord notifications automatically.
            </p>
          </Card>

          <Card className="p-5">
            <span className="text-xs text-muted-foreground">Last Store Check</span>
            <p className="mt-2 text-sm font-semibold text-white tabular-nums">
              {monitor?.checkedAt ? formatLocalDateTime(monitor.checkedAt) : "Not yet recorded"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground tabular-nums">
              Last Verified:{" "}
              {monitor?.lastSuccessAt ? formatLocalDateTime(monitor.lastSuccessAt) : "Pending"}
            </p>
          </Card>

          <Card className="p-5">
            <span className="text-xs text-muted-foreground">Preserved Product Records</span>
            <p className="mt-2 text-2xl font-bold text-white tabular-nums">{listings.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {listings.filter((l) => l.isAvailable).length} In Stock &bull;{" "}
              {listings.filter((l) => !l.isAvailable).length} Sold Out
            </p>
          </Card>
        </div>

        {/* Last Manual Scan Outcome Banner */}
        {(lastScanSummary || monitor?.notice) && (
          <Card className="border-border bg-zinc-900/70 p-4">
            <div className="flex items-start gap-3 text-xs">
              {lastScanSummary?.usedVerifiedStoreResponse ? (
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

        {/* Listing Verification Table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Tracked Listings &amp; Verification State</CardTitle>
            <Button variant="outline" size="sm" asChild>
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
                        <p className="font-mono text-[11px] text-muted-foreground">#{item.id}</p>
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
    </AppShell>
  );
}
