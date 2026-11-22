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
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  return (
    <AppShell
      title="Changelog"
      description="See the latest features, improvements, and fixes."
      actions={
        <>
          <Button
            size="sm"
            variant="outline"
            disabled={notes.isFetching}
            onClick={() => void notes.refetch()}
          >
            {notes.isFetching ? "Refreshing…" : "Refresh Changelog"}
          </Button>
          {session?.user?.isAdmin && (
            <Button size="sm" variant="outline" asChild>
              <Link to="/admin/changelog">Manage Release Notes</Link>
            </Button>
          )}
        </>
      }
    >
      {notes.dataUpdatedAt > 0 && (
        <p role="status" className="mb-4 text-xs text-muted-foreground">
          Last refreshed {new Date(notes.dataUpdatedAt).toLocaleTimeString()}.
          Checks for new updates every minute while this page is open.
        </p>
      )}
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
