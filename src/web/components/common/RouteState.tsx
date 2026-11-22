import { SearchX, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RouteState({ missing = false }: { missing?: boolean }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-5">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6">
        <SearchX
          aria-hidden="true"
          className="mb-4 h-6 w-6 text-muted-foreground"
        />
        <p className="text-xs text-muted-foreground">
          Everfall Limited Watcher
        </p>
        <h1 className="mt-2 text-xl font-semibold">
          {missing
            ? "This page could not be found"
            : "This page could not be loaded"}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {missing
            ? "The address may have changed. Return to the homepage to find the right page."
            : "A connection or page update may have interrupted loading. Reload to try again; saved settings are unchanged."}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {!missing && (
            <Button size="sm" onClick={() => window.location.reload()}>
              <RefreshCw className="h-4 w-4" />
              Reload page
            </Button>
          )}
          <Button size="sm" variant="outline" asChild>
            <a href="/">Go to homepage</a>
          </Button>
        </div>
      </div>
    </main>
  );
}
