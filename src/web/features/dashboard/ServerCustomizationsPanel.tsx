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
    "Requires Pin Messages (or Manage Messages on older Discord permission layouts).",
  ],
  [
    "autoCreateEvent",
    "Create an active listings event",
    "Requires Create Events and Manage Events. Updates one tracked event while listings remain active.",
  ],
  [
    "autoEndEvent",
    "End the event when sold out",
    "Completes the tracked event when no verified active listings remain.",
  ],
  [
    "pinWidget",
    "Pin the live widget",
    "Pins deployed widgets during the next successful monitoring cycle.",
  ],
  [
    "stickyWidget",
    "Keep widgets near recent messages",
    "Checks during successful monitoring. Moves only when newer messages exist, with a 15-minute cooldown.",
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
  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <p className="text-sm text-muted-foreground">
        Settings apply only to {server.name}. Saving does not send messages or
        create events.
      </p>
      {server.config.automationStatus?.error && (
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
            disabled={mutation.isPending}
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
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={!dirty || mutation.isPending}
          onClick={() => mutation.mutate(draft)}
        >
          {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {mutation.isError ? "Retry Save" : "Save Customizations"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!dirty || mutation.isPending}
          onClick={() => setDraft(saved)}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
