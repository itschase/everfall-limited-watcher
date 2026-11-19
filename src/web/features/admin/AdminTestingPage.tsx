import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FlaskConical, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { ADMIN_OVERVIEW_KEY, useAdminOverview } from "./useAdminOverview";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

export function AdminTestingPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useAdminOverview();
  const [selectedTestGuildId, setSelectedTestGuildId] = useState("");
  const [selectedListingId, setSelectedListingId] = useState("");

  const guilds = data?.connectedGuilds || [];
  const testGuilds = guilds.filter((g) => g.environment === "test" && g.configured);
  const listings = data?.listings || [];

  useEffect(() => {
    if (testGuilds.length > 0 && !testGuilds.some((g) => g.id === selectedTestGuildId)) {
      setSelectedTestGuildId(testGuilds[0].id);
    }
    if (listings.length > 0 && !selectedListingId) {
      setSelectedListingId(listings[0].id);
    }
  }, [listings, selectedListingId, selectedTestGuildId, testGuilds]);

  const modeMutation = useMutation({
    mutationFn: (payload: { guildId: string; environment: "production" | "test" }) =>
      apiFetch("/api/admin/testing/server-mode", {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    onSuccess: (_res, vars) => {
      toast.success(`Server marked as ${vars.environment === "test" ? "Test Server" : "Production"}`);
      void queryClient.invalidateQueries({ queryKey: ADMIN_OVERVIEW_KEY });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to update server mode.");
    },
  });

  const testSendMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean; messageId?: string }>("/api/admin/testing/send", {
        method: "POST",
        body: JSON.stringify({
          guildId: selectedTestGuildId,
          listingId: selectedListingId,
        }),
      }),
    onSuccess: (res) => {
      toast.success(
        `Isolated test notification sent (${res.messageId ? `Message ${res.messageId}` : "delivered"}). Zero production servers contacted.`
      );
      void queryClient.invalidateQueries({ queryKey: ADMIN_OVERVIEW_KEY });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to send test notification.");
    },
  });

  return (
    <AppShell
      requireAdmin
      title="Isolated Test Environment"
      description="Designate dedicated test Discord servers and send verified preview notifications without pinging roles or touching production servers."
    >
      {isLoading ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-96 w-full rounded-xl" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Server Environment Designations */}
          <Card>
            <CardHeader>
              <CardTitle>Server Environment Designations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {guilds.length === 0 ? (
                <p className="text-sm text-muted-foreground">No connected Discord servers.</p>
              ) : (
                guilds.map((guild) => {
                  const isTest = guild.environment === "test";
                  return (
                    <div
                      key={guild.id}
                      className="flex flex-col items-start justify-between gap-3 rounded-lg border border-border bg-zinc-950 p-3.5 sm:flex-row sm:items-center"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">{guild.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {guild.configured ? `Channel #${guild.channelId}` : "Channel not configured"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge variant={isTest ? "warning" : "secondary"}>
                          {isTest ? "Test" : "Production"}
                        </Badge>
                        <Button
                          size="sm"
                          variant={isTest ? "outline" : "secondary"}
                          disabled={modeMutation.isPending}
                          onClick={() =>
                            modeMutation.mutate({
                              guildId: guild.id,
                              environment: isTest ? "production" : "test",
                            })
                          }
                        >
                          {isTest ? "Set Production" : "Mark Test"}
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* Send Isolated Test Notification */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FlaskConical className="h-5 w-5 text-amber-400" />
                Send Test Notification
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {testGuilds.length === 0 ? (
                <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/35 bg-amber-950/40 p-4 text-xs text-amber-200">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  <div>
                    No configured Test servers found. Designate at least one configured Discord
                    server as a <strong>Test</strong> server on the left before sending isolated test
                    notifications. Production servers are strictly blocked server-side.
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">
                      Designated Test Server
                    </label>
                    <Select value={selectedTestGuildId} onValueChange={setSelectedTestGuildId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose test server" />
                      </SelectTrigger>
                      <SelectContent>
                        {testGuilds.map((guild) => (
                          <SelectItem key={guild.id} value={guild.id}>
                            {guild.name} (Channel #{guild.channelId})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">
                      Sample Listing Payload
                    </label>
                    <Select value={selectedListingId} onValueChange={setSelectedListingId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose listing payload" />
                      </SelectTrigger>
                      <SelectContent>
                        {listings.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name} (#{item.id}) — {item.isAvailable ? "In Stock" : "Sold Out"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Test dispatches include a <strong>[TEST NOTIFICATION]</strong> header, suppress
                    all role mentions, and never mark listings as sent for production servers.
                  </p>

                  <Button
                    className="w-full"
                    disabled={
                      !selectedTestGuildId || !selectedListingId || testSendMutation.isPending
                    }
                    onClick={() => testSendMutation.mutate()}
                  >
                    {testSendMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Sending Test...
                      </>
                    ) : (
                      "Send Isolated Test Notification"
                    )}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
