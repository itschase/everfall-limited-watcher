import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/features/auth/useAuthActions";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PublicReleaseNote } from "../../../shared/releaseNotes";
import { ReleaseNoteCard } from "./ReleaseNoteCard";
export function ChangelogPage() {
  const { data: session } = useSession();
  const notes = useQuery<{ entries: PublicReleaseNote[] }>({
    queryKey: ["release-notes"],
    queryFn: () => apiFetch("/api/changelog"),
    enabled: Boolean(session?.user),
    staleTime: 60_000,
  });
  return (
    <AppShell
      title="Changelog"
      description="See what is new in Everfall Limited Watcher, with clear release notes about features, additions, and everyday improvements."
      actions={
        session?.user?.isAdmin && (
          <Button size="sm" variant="outline" asChild>
            <Link to="/admin/changelog">Manage Release Notes</Link>
          </Button>
        )
      }
    >
      {notes.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : notes.isError ? (
        <div role="alert" className="space-y-3 text-sm">
          <p>{notes.error.message}</p>
          <Button variant="outline" onClick={() => void notes.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <div className="mx-auto max-w-4xl space-y-6">
          {notes.data?.entries.length ? (
            notes.data.entries.map((note) => (
              <ReleaseNoteCard key={note.version} note={note} />
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              New release notes will appear here when an update is published.
            </p>
          )}
        </div>
      )}
    </AppShell>
  );
}
