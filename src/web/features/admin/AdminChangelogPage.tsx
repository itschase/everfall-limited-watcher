import { useEffect, useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import {
  PublicReleaseNote,
  RELEASE_GROUPS,
  ReleaseGroup,
} from "../../../shared/releaseNotes";
import { AppShell } from "@/components/layout/AppShell";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ReleaseNoteCard } from "@/features/changelog/ReleaseNoteCard";
const fresh = (): PublicReleaseNote => ({
  version: "",
  title: "",
  summary: "",
  date: new Date().toLocaleDateString("en-CA"),
  published: false,
  highlights: [],
  additions: [],
  improvements: [],
  fixes: [],
});
export function AdminChangelogPage() {
  const client = useQueryClient();
  const notes = useQuery<{ entries: PublicReleaseNote[] }>({
    queryKey: ["admin-release-notes"],
    queryFn: () => apiFetch("/api/admin/changelog"),
    refetchOnWindowFocus: false,
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<PublicReleaseNote>(fresh);
  const [baseline, setBaseline] = useState<PublicReleaseNote>(draft);
  const [initialized, setInitialized] = useState(false);
  const choose = (note: PublicReleaseNote | null) => {
    const next = note || fresh();
    setSelected(note?.version || null);
    setDraft(next);
    setBaseline(next);
  };
  useEffect(() => {
    if (!initialized && notes.data) {
      choose(notes.data.entries[0] || null);
      setInitialized(true);
    }
  }, [initialized, notes.data]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  const save = useMutation({
    mutationFn: () =>
      apiFetch<{ entry: PublicReleaseNote }>("/api/admin/changelog", {
        method: selected ? "PUT" : "POST",
        body: JSON.stringify(draft),
      }),
    onSuccess: (result) => {
      choose(result.entry);
      toast.success(
        result.entry.published ? "Release notes published." : "Draft saved.",
      );
      void client.invalidateQueries({ queryKey: ["admin-release-notes"] });
      void client.invalidateQueries({ queryKey: ["release-notes"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const blocker = useBlocker({
    shouldBlockFn: () => dirty || save.isPending,
    enableBeforeUnload: dirty || save.isPending,
    withResolver: true,
  });
  return (
    <AppShell
      requireAdmin
      title="Manage Release Notes"
      description="Publish versioned updates for signed-in members. Explain useful features and improvements in everyday language; leave out internal tools and infrastructure details."
    >
      <Dialog
        open={blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open) blocker.reset?.();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave this release note?</DialogTitle>
            <DialogDescription>
              You have unsaved changes or a save in progress. Stay to finish
              your work, or leave and discard unsaved edits.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => blocker.reset?.()}>
              Stay and edit
            </Button>
            <Button variant="destructive" onClick={() => blocker.proceed?.()}>
              Leave page
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="grid gap-5 @4xl/main:grid-cols-[minmax(180px,240px)_minmax(0,1fr)]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Versions</CardTitle>
            <Button
              size="sm"
              variant="secondary"
              disabled={save.isPending || dirty}
              onClick={() => choose(null)}
            >
              Add Version
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {notes.error && (
              <p role="alert" className="text-sm text-red-300">
                {notes.error.message}
              </p>
            )}
            {notes.data?.entries.map((note) => (
              <Button
                key={note.version}
                variant={selected === note.version ? "secondary" : "ghost"}
                className="h-auto w-full justify-start whitespace-normal text-left"
                disabled={save.isPending || dirty}
                onClick={() => choose(note)}
              >
                Version {note.version}
                {!note.published && " · Draft"}
              </Button>
            ))}
            {dirty && (
              <p className="text-xs text-muted-foreground">
                Save or cancel this version before switching.
              </p>
            )}
          </CardContent>
        </Card>
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>
                {selected ? `Edit version ${selected}` : "New version"}
              </CardTitle>
              <CardDescription>
                Keep release notes descriptive and helpful. Published versions
                appear on the member Changelog; unpublished versions remain
                private drafts.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <fieldset disabled={save.isPending} className="space-y-4">
                <div className="grid gap-3 @xl/card:grid-cols-2">
                  <label className="space-y-1 text-sm">
                    Version
                    <Input
                      value={draft.version}
                      disabled={Boolean(selected)}
                      placeholder="2026.11.22 or v0.3.0"
                      maxLength={40}
                      onChange={(e) =>
                        setDraft({ ...draft, version: e.target.value })
                      }
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    Release date
                    <Input
                      type="date"
                      value={draft.date}
                      onChange={(e) =>
                        setDraft({ ...draft, date: e.target.value })
                      }
                    />
                  </label>
                </div>
                <label className="block space-y-1 text-sm">
                  Release title
                  <Input
                    value={draft.title}
                    maxLength={160}
                    onChange={(e) =>
                      setDraft({ ...draft, title: e.target.value })
                    }
                  />
                </label>
                <label className="block space-y-1 text-sm">
                  Introduction
                  <textarea
                    rows={4}
                    maxLength={2400}
                    className="w-full rounded-md border border-input bg-background p-3 text-sm"
                    value={draft.summary}
                    onChange={(e) =>
                      setDraft({ ...draft, summary: e.target.value })
                    }
                  />
                </label>
                {(Object.keys(RELEASE_GROUPS) as ReleaseGroup[]).map((key) => (
                  <label key={key} className="block space-y-1 text-sm">
                    {RELEASE_GROUPS[key]}
                    <span className="block text-xs text-muted-foreground">
                      Separate each entry with a blank line. Explain what
                      changed and why members will find it useful.
                    </span>
                    <textarea
                      rows={5}
                      className="w-full rounded-md border border-input bg-background p-3 text-sm"
                      value={draft[key].join("\n\n")}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          [key]: e.target.value.split(/\n\s*\n/),
                        })
                      }
                    />
                  </label>
                ))}
                <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
                  Publish for signed-in members
                  <Switch
                    checked={draft.published}
                    onCheckedChange={(published) =>
                      setDraft({ ...draft, published })
                    }
                  />
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    disabled={!dirty || save.isPending}
                    onClick={() => save.mutate()}
                  >
                    {save.isPending
                      ? "Saving…"
                      : save.isError
                        ? "Retry Save"
                        : draft.published
                          ? "Save & Publish"
                          : "Save Draft"}
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={!dirty || save.isPending}
                    onClick={() => { setDraft(baseline); save.reset(); }}
                  >
                    Cancel
                  </Button>
                  <span role="status" className="text-xs text-muted-foreground">
                    {save.isPending
                      ? "Saving"
                      : save.isError
                        ? "Failed — retry available"
                        : dirty
                          ? "Unsaved"
                          : "Saved"}
                  </span>
                </div>
              </fieldset>
            </CardContent>
          </Card>
          <div className="space-y-2">
            <h2 className="text-sm font-semibold">Member preview</h2>
            <ReleaseNoteCard note={draft} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
