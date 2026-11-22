import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, ManagedServer } from "@/lib/api";
import {
  normalizeCustomizations,
  ServerCustomizations,
} from "../../../shared/customizations";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

const OPTIONS: Array<[keyof ServerCustomizations, string, string]> = [
  [
    "autoPinListings",
    "Pin new listing messages",
    "Requires Pin Messages in the listing channel.",
  ],
  [
    "autoCreateEvent",
    "Create an Event for Available Vehicles",
    "Requires Create Events or Manage Events. Updates one tracked event while listings remain active.",
  ],
  [
    "autoEndEvent",
    "End the event when sold out",
    "Ends the listing event when all listed vehicles are confirmed sold out.",
  ],
  [
    "pinWidget",
    "Pin the live widget",
    "Pins your widgets after the next successful store check.",
  ],
  [
    "stickyWidget",
    "Keep widgets near recent messages",
    "Moves widgets below newer messages after a successful store check, no more than once every 15 minutes.",
  ],
];

export function ServerCustomizationsPanel({
  server,
  onSaved,
}: {
  server: ManagedServer;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState(() =>
    normalizeCustomizations(server.config.customizations),
  );
  const [saved, setSaved] = useState(draft);
  useEffect(() => {
    const next = normalizeCustomizations(server.config.customizations);
    setDraft(next);
    setSaved(next);
  }, [server.id, server.config.customizations]);
  const mutation = useMutation({
    mutationFn: (payload: ServerCustomizations) =>
      apiFetch<{ customizations: ServerCustomizations }>(
        `/api/dashboard/servers/${server.id}/customizations`,
        { method: "PUT", body: JSON.stringify(payload) },
      ),
    onSuccess: (res) => {
      setSaved(res.customizations);
      toast.success("Customizations saved. Applied during monitoring.");
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const [readiness, setReadiness] = useState<{
    ready: boolean;
    issues: string[];
    widgetCount?: number;
  } | null>(null);
  useEffect(() => setReadiness(null), [draft, server.id]);
  const check = useMutation({
    mutationFn: () =>
      apiFetch<{ ready: boolean; issues: string[]; widgetCount?: number }>(
        `/api/dashboard/servers/${server.id}/automations/check`,
        { method: "POST", body: JSON.stringify(draft) },
      ),
    onSuccess: setReadiness,
    onError: (error: Error) => toast.error(error.message),
  });
  const retry = useMutation({
    mutationFn: (failure: string) =>
      apiFetch(`/api/dashboard/servers/${server.id}/automations/retry`, {
        method: "POST",
        body: JSON.stringify(
          failure === "event"
            ? { task: "event" }
            : { task: "widget", widgetId: failure.slice(7) },
        ),
      }),
    onSuccess: () => {
      toast.success("Selected automation recovered.");
      onSaved();
    },
    onError: (error: Error) => {
      toast.error(error.message);
      onSaved();
    },
  });
  const busy = mutation.isPending || check.isPending || retry.isPending;
  const automation = server.config.automationStatus;
  const date = (value?: number) =>
    value ? new Date(value).toLocaleString() : "Not recorded yet";
  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <p className="text-sm text-muted-foreground">
        Settings apply only to {server.name}. Saving does not send messages or
        create events.
      </p>
      <dl className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
        <div>
          <dt>Last automation check</dt>
          <dd>{date(automation?.checkedAt)}</dd>
        </div>
        <div>
          <dt>Last successful check</dt>
          <dd>{date(automation?.lastSuccessAt)}</dd>
        </div>
        {saved.stickyWidget && (
          <div>
            <dt>Next eligible widget move</dt>
            <dd>
              {automation?.nextStickyAt
                ? automation.nextStickyAt <= Date.now()
                  ? "Eligible on the next successful monitoring check if newer messages exist"
                  : date(automation.nextStickyAt)
                : "Waiting for a deployed widget and monitoring check"}
            </dd>
          </div>
        )}
      </dl>
      {Object.entries(automation?.failures || {}).map(([key, error]) => (
        <div
          key={key}
          className="space-y-2 rounded-lg border border-border p-3 text-sm"
        >
          <p>
            {key === "event" ? "Listing event" : `Widget ${key.slice(7)}`}:{" "}
            {error}
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || dirty}
            onClick={() => retry.mutate(key)}
          >
            Retry {key === "event" ? "event" : "this widget"}
          </Button>
        </div>
      ))}
      {!Object.keys(automation?.failures || {}).length &&
        server.config.automationStatus?.error && (
          <p
            role="alert"
            className="rounded-md border border-red-500/30 p-3 text-sm text-red-300"
          >
            {server.config.automationStatus.error}
          </p>
        )}
      {server.config.automationStatus?.eventId && (
        <p className="text-xs text-muted-foreground">
          Tracked event: {server.config.automationStatus.eventId}
        </p>
      )}
      {OPTIONS.map(([key, label, description]) => (
        <label
          key={key}
          className="flex items-start justify-between gap-4 border-b border-border pb-3"
        >
          <span className="min-w-0">
            <span className="block text-sm font-medium">{label}</span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {description}
            </span>
          </span>
          <Switch
            aria-label={label}
            checked={draft[key]}
            disabled={busy}
            onCheckedChange={(checked) =>
              setDraft((prev) => ({ ...prev, [key]: checked }))
            }
          />
        </label>
      ))}
      <p role="status" className="text-xs text-muted-foreground">
        {mutation.isPending
          ? "Saving…"
          : mutation.isError
            ? "Failed — retry available"
            : dirty
              ? "Unsaved"
              : "Saved"}
      </p>
      {readiness && (
        <div
          role="status"
          className="rounded-lg border border-border p-3 text-sm"
        >
          {readiness.ready ? (
            "Permissions checked. Current deployments are ready for these settings."
          ) : (
            <ul className="list-disc space-y-1 pl-4">
              {readiness.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
          {readiness.widgetCount === 0 &&
            (draft.pinWidget || draft.stickyWidget) && (
              <p className="mt-2">
                No widget is deployed yet. Deploy a widget, then rerun this
                check for its channel.
              </p>
            )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => check.mutate()}
        >
          {check.isPending ? "Checking permissions…" : "Check Permissions"}
        </Button>
        <Button
          size="sm"
          disabled={!dirty || busy}
          onClick={() => mutation.mutate(draft)}
        >
          {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {mutation.isError ? "Retry Save" : "Save Customizations"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!dirty || busy}
          onClick={() => setDraft(saved)}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
