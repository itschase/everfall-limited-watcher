import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { AdminConnectedGuild, apiFetch } from "@/lib/api";
import type { previewTestEvent, TestEventState } from "../../../testEvents";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Preview = Awaited<ReturnType<typeof previewTestEvent>>;
export function TestEventSimulator({
  guilds,
}: {
  guilds: AdminConnectedGuild[];
}) {
  const testGuilds = guilds.filter((guild) => guild.environment === "test");
  const [guildId, setGuildId] = useState("");
  const [maxListings, setMaxListings] = useState(1);
  const [durationMinutes, setDurationMinutes] = useState(5);
  const [repeatSamples, setRepeatSamples] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!preview) return;
    const timer = window.setTimeout(
      () => {
        setPreview(null);
        setConfirm(false);
      },
      Math.max(0, preview.previewExpiresAt - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [preview]);
  const requestId = useRef(crypto.randomUUID());
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!testGuilds.some((guild) => guild.id === guildId))
      setGuildId(testGuilds[0]?.id || "");
  }, [guildId, testGuilds]);
  useEffect(() => {
    setPreview(null);
    setConfirm(false);
    requestId.current = crypto.randomUUID();
  }, [guildId, maxListings, durationMinutes, repeatSamples]);
  const status = useQuery<{ event: TestEventState | null; active: boolean }>({
    queryKey: ["test-event", guildId],
    queryFn: () =>
      apiFetch(
        `/api/admin/testing/events?guildId=${encodeURIComponent(guildId)}`,
      ),
    enabled: Boolean(guildId),
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    if (!status.data?.active || !status.data.event) return;
    const timer = window.setTimeout(
      () => void status.refetch(),
      Math.max(0, status.data.event.expiresAt - Date.now()) + 1000,
    );
    return () => window.clearTimeout(timer);
  }, [status.data?.active, status.data?.event?.expiresAt, status.refetch]);
  const options = { guildId, maxListings, durationMinutes, repeatSamples };
  const previewMutation = useMutation({
    mutationFn: () =>
      apiFetch<Preview>("/api/admin/testing/events/preview", {
        method: "POST",
        body: JSON.stringify(options),
      }),
    onSuccess: (result) => setPreview(result),
    onError: (error: Error) => {
      setPreview(null);
      toast.error(error.message);
    },
  });
  const refreshStatus = () =>
    queryClient.invalidateQueries({ queryKey: ["test-event", guildId] });
  const deployMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ event: TestEventState; reused: boolean }>(
        "/api/admin/testing/events/deploy",
        {
          method: "POST",
          body: JSON.stringify({
            ...options,
            requestId: requestId.current,
            previewId: preview?.previewId,
          }),
        },
      ),
    onSuccess: (result) => {
      setConfirm(false);
      queryClient.setQueryData(["test-event", guildId], {
        event: result.event,
        active: !result.event.endedAt && result.event.expiresAt > Date.now(),
      });
      toast.success(
        `Test event ${result.reused ? "recovered" : "started"}; ends at ${new Date(result.event.expiresAt).toLocaleTimeString()}.`,
      );
      requestId.current = crypto.randomUUID();
      void refreshStatus();
    },
    onError: (error: Error) => {
      toast.error(error.message);
      void refreshStatus();
    },
  });
  const endMutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/admin/testing/events/end", {
        method: "POST",
        body: JSON.stringify({ guildId }),
      }),
    onSuccess: () => {
      toast.success("Test event ended.");
      void refreshStatus();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const pending =
    previewMutation.isPending ||
    deployMutation.isPending ||
    endMutation.isPending;
  const selectedGuild = testGuilds.find((guild) => guild.id === guildId);
  return (
    <Card className="@3xl/main:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5" />
          Listing Event Simulator
        </CardTitle>
        <CardDescription>
          Generate the same 1/2/3-column cover used by real listing events, then
          manually create a time-limited simulation in a marked Test server.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!testGuilds.length ? (
          <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
            Mark a connected server as Test above to use event simulation. A
            notification channel is not required for external Discord events.
          </p>
        ) : (
          <>
            <div className="grid gap-3 @xl/card:grid-cols-2 @4xl/card:grid-cols-3">
              <label className="space-y-1.5 text-sm">
                Test server
                <Select
                  value={guildId}
                  onValueChange={setGuildId}
                  disabled={pending}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose Test server" />
                  </SelectTrigger>
                  <SelectContent>
                    {testGuilds.map((guild) => (
                      <SelectItem key={guild.id} value={guild.id}>
                        {guild.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1.5 text-sm">
                Maximum vehicles
                <Select
                  value={String(maxListings)}
                  onValueChange={(value) => setMaxListings(Number(value))}
                  disabled={pending}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3].map((count) => (
                      <SelectItem key={count} value={String(count)}>
                        {count} vehicle{count > 1 ? "s" : ""} / {count} column
                        {count > 1 ? "s" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1.5 text-sm">
                Event duration (minutes)
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={durationMinutes}
                  disabled={pending}
                  onChange={(event) =>
                    setDurationMinutes(Number(event.target.value))
                  }
                />
              </label>
            </div>
            <label className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
              <span className="text-sm">
                Repeat archived samples to fill all slots
                <span className="mt-1 block text-xs text-muted-foreground">
                  Useful for a 3-column test when fewer than three distinct
                  vehicles are archived. Repeated samples are labeled in the
                  preview.
                </span>
              </span>
              <Switch
                checked={repeatSamples}
                disabled={pending}
                onCheckedChange={setRepeatSamples}
              />
            </label>
            <p className="text-xs text-muted-foreground">
              Uses current vehicles first, then archived vehicles as simulated
              listings. Does not change stock, sent-message history, real event
              tracking, or server customization settings. No channel message or
              role mention is sent. Discord ends the external event
              automatically at the selected time; you can also end it early.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={
                  !guildId ||
                  pending ||
                  durationMinutes < 1 ||
                  durationMinutes > 60
                }
                onClick={() => previewMutation.mutate()}
              >
                {previewMutation.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                Generate Event Preview
              </Button>
              <Button
                disabled={
                  !preview ||
                  pending ||
                  status.data?.active ||
                  !guildId ||
                  preview.previewExpiresAt <= Date.now()
                }
                onClick={() => setConfirm(true)}
              >
                Deploy Test Event
              </Button>
              <Button
                variant="outline"
                disabled={!guildId || pending || status.isFetching}
                onClick={() => void status.refetch()}
              >
                <RotateCcw className="h-4 w-4" />
                Reload Status
              </Button>
              {status.data?.active && (
                <Button
                  variant="destructive"
                  disabled={pending}
                  onClick={() => endMutation.mutate()}
                >
                  {endMutation.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  End Test Event Now
                </Button>
              )}
            </div>
            <div role="status" className="text-xs text-muted-foreground">
              {pending
                ? "Processing test event…"
                : status.data?.active
                  ? `Test event active until ${new Date(status.data.event!.expiresAt).toLocaleString()}.`
                  : status.data?.event?.eventId
                    ? "Previous test ended or its scheduled lifetime has elapsed."
                    : "No tracked test event."}
              {status.data?.event?.eventId && (
                <a
                  className="ml-2 underline"
                  href={`https://discord.com/events/${guildId}/${status.data.event.eventId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open Discord Event
                </a>
              )}
            </div>
            {(previewMutation.error ||
              deployMutation.error ||
              endMutation.error ||
              status.error) && (
              <p
                role="alert"
                className="rounded-md border border-red-500/30 p-3 text-sm text-red-300"
              >
                {
                  (
                    previewMutation.error ||
                    deployMutation.error ||
                    endMutation.error ||
                    status.error
                  )?.message
                }
              </p>
            )}
            {preview && (
              <div className="grid gap-4 @3xl/card:grid-cols-2">
                <img
                  src={preview.image}
                  alt={`${preview.actualCount}-column generated test event cover`}
                  className="aspect-video w-full rounded-lg border border-border object-cover"
                />
                <div className="space-y-3">
                  <h3 className="font-semibold">{preview.name}</h3>
                  <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                    {preview.description}
                  </p>
                  <p className="text-xs">
                    Preview valid until{" "}
                    {new Date(preview.previewExpiresAt).toLocaleTimeString()}.
                    Deployment uses these exact vehicles and this cover.
                  </p>
                  <p className="text-xs">
                    {preview.actualCount} vehicle slot
                    {preview.actualCount > 1 ? "s" : ""}
                    {preview.repeatedSamples
                      ? " — repeated archived samples"
                      : " — distinct archived vehicles"}
                    .{" "}
                    {preview.actualCount < maxListings
                      ? "Enable repeated samples to fill every requested slot."
                      : ""}
                  </p>
                </div>
              </div>
            )}
            <Dialog
              open={confirm}
              onOpenChange={(open) =>
                !deployMutation.isPending && setConfirm(open)
              }
            >
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Deploy test event?</DialogTitle>
                  <DialogDescription>
                    This creates a real Discord event in {selectedGuild?.name},
                    marked TEST, using {preview?.actualCount} simulated vehicle
                    slot(s). It will run for {durationMinutes} minute(s) and
                    then end automatically. Production event tracking is
                    unchanged.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button
                    variant="outline"
                    disabled={deployMutation.isPending}
                    onClick={() => setConfirm(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    disabled={deployMutation.isPending}
                    onClick={() => deployMutation.mutate()}
                  >
                    {deployMutation.isPending && (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                    {deployMutation.isError
                      ? "Retry Test Event"
                      : "Deploy Test Event"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}
      </CardContent>
    </Card>
  );
}
