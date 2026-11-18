import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, DeliveryLogEntry } from "@/lib/api";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function AdminDispatchPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useAdminOverview();
  const [selectedListingId, setSelectedListingId] = useState<string>("");
  // Explicitly unchecked by default per Issue #6
  const [selectedGuildIds, setSelectedGuildIds] = useState<string[]>([]);
  const [forceResend, setForceResend] = useState(false);
  const [includeRoleMentions, setIncludeRoleMentions] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const listings = data?.listings || [];
  const configuredGuilds = (data?.connectedGuilds || []).filter((g) => g.configured);
  const selectedListing = listings.find((l) => l.id === selectedListingId) || listings[0];

  useEffect(() => {
    if (listings.length > 0 && !selectedListingId) {
      setSelectedListingId(listings[0].id);
    }
  }, [listings, selectedListingId]);

  const duplicateCount = selectedGuildIds.filter(
    (gid) => configuredGuilds.find((g) => g.id === gid)?.sentListingIds[selectedListing?.id || ""]
  ).length;

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
      setConfirmOpen(false);
      setSelectedGuildIds([]);
      void queryClient.invalidateQueries({ queryKey: ADMIN_OVERVIEW_KEY });
      toast.success(
        `Dispatch finished: ${res.deliveredCount} delivered, ${res.skippedCount} skipped (already sent), ${res.failedCount} failed.`
      );
    },
    onError: (err: Error) => {
      setConfirmOpen(false);
      toast.error(err.message || "Dispatch failed.");
    },
  });

  const toggleGuild = (guildId: string) => {
    setSelectedGuildIds((prev) =>
      prev.includes(guildId) ? prev.filter((id) => id !== guildId) : [...prev, guildId]
    );
  };

  return (
    <AppShell
      requireAdmin
      title="Dispatch & Deliveries"
      description="Explicitly review and confirm manual Discord publishing to chosen servers with built-in duplicate prevention."
    >
      {isLoading ? (
        <div className="h-96 animate-pulse rounded-xl border border-border bg-card" />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Step 1: Select Listing */}
            <Card>
              <CardHeader>
                <CardTitle>1. Select Vehicle Listing</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <select
                  value={selectedListing?.id || ""}
                  onChange={(e) => {
                    setSelectedListingId(e.target.value);
                    setSelectedGuildIds([]);
                  }}
                  className="h-10 w-full rounded-lg border border-border bg-zinc-950 px-3 text-sm text-white"
                >
                  {listings.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} (#{item.id}) — {item.isAvailable ? "In Stock" : "Sold Out"}
                    </option>
                  ))}
                </select>

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
                    </p>
                  </div>
                )}

                <div className="space-y-3 rounded-lg border border-border bg-zinc-900/60 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-white">Include Mention Roles</p>
                      <p className="text-[11px] text-muted-foreground">
                        Ping each selected server&apos;s configured notification roles.
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
                        When disabled, servers that already received this listing are safely skipped.
                      </p>
                    </div>
                    <Switch checked={forceResend} onCheckedChange={setForceResend} />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Step 2: Destination Selection (Unchecked by default) */}
            <Card>
              <CardHeader className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>2. Select Destination Servers</CardTitle>
                <span className="text-xs text-muted-foreground">
                  {selectedGuildIds.length} selected
                </span>
              </CardHeader>
              <CardContent className="space-y-4">
                {configuredGuilds.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No servers currently have a configured notification channel.
                  </p>
                ) : (
                  <div className="thin-scrollbar max-h-72 space-y-2 overflow-y-auto">
                    {configuredGuilds.map((guild) => {
                      const alreadySent = Boolean(
                        selectedListing && guild.sentListingIds[selectedListing.id]
                      );
                      const checked = selectedGuildIds.includes(guild.id);
                      return (
                        <label
                          key={guild.id}
                          className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border bg-zinc-950 px-3.5 py-2.5 text-xs hover:bg-secondary/50"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleGuild(guild.id)}
                              className="h-4 w-4 accent-zinc-200"
                            />
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-white">{guild.name}</p>
                              <p className="select-text font-mono text-[11px] text-muted-foreground">
                                Channel #{guild.channelId}
                              </p>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <Badge variant={guild.environment === "test" ? "warning" : "secondary"}>
                              {guild.environment}
                            </Badge>
                            {alreadySent && (
                              <Badge variant="info">Already Sent</Badge>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}

                {duplicateCount > 0 && !forceResend && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-500/35 bg-amber-950/40 p-3 text-xs text-amber-200">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                    <span>
                      {duplicateCount} selected server(s) already received this vehicle and will be
                      skipped unless &ldquo;Allow Re-send&rdquo; is enabled.
                    </span>
                  </div>
                )}

                <Button
                  className="w-full"
                  disabled={!selectedListing || selectedGuildIds.length === 0 || dispatchMutation.isPending}
                  onClick={() => setConfirmOpen(true)}
                >
                  <Send className="h-4 w-4" />
                  Review &amp; Publish ({selectedGuildIds.length} Server
                  {selectedGuildIds.length === 1 ? "" : "s"})
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Delivery Audit Log */}
          <Card>
            <CardHeader>
              <CardTitle>Dispatch History</CardTitle>
            </CardHeader>
            <CardContent>
              {data?.deliveryLogs?.length === 0 ? (
                <p className="text-sm text-muted-foreground">No deliveries recorded yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vehicle</TableHead>
                      <TableHead>Guild ID</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Environment</TableHead>
                      <TableHead>Result</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.deliveryLogs || []).slice(0, 20).map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="font-medium text-white">{log.listingName}</TableCell>
                        <TableCell className="select-text font-mono text-xs text-muted-foreground">
                          {log.guildId}
                        </TableCell>
                        <TableCell className="capitalize text-xs text-zinc-300">{log.method}</TableCell>
                        <TableCell>
                          <Badge variant={log.environment === "test" ? "warning" : "secondary"}>
                            {log.environment}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {log.status === "delivered" ? (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-300">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Delivered
                            </span>
                          ) : (
                            <span className="text-xs text-red-400">
                              {log.error || "Failed"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground tabular-nums">
                          {formatLocalDateTime(log.timestamp)}
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

      {/* Mandatory Confirmation Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Discord Broadcast</DialogTitle>
            <DialogDescription>
              You are about to publish{" "}
              <strong className="text-white">{selectedListing?.name}</strong> to{" "}
              <strong className="text-white">{selectedGuildIds.length}</strong> selected server(s).
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-border bg-zinc-950 p-3 text-xs text-zinc-300 space-y-1">
            <p>
              Mention Roles: <strong>{includeRoleMentions ? "Enabled" : "Disabled"}</strong>
            </p>
            <p>
              Duplicate Bypass: <strong>{forceResend ? "Resend Allowed" : "Protected"}</strong>
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
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
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
