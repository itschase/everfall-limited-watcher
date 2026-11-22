import { AlertCircle, Inbox, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function QueryState({
  error,
  onRetry,
  title = "Unable to load this information",
  loading = false,
  children,
}: {
  error?: unknown;
  onRetry?: () => void;
  title?: string;
  loading?: boolean;
  children?: ReactNode;
}) {
  if (loading && !error)
    return (
      <div
        role="status"
        className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-5 text-sm text-muted-foreground"
      >
        <Loader2
          aria-hidden="true"
          className="h-4 w-4 animate-spin motion-reduce:animate-none"
        />
        Loading the latest information…
      </div>
    );
  return (
    <Card
      className="flex flex-col items-start gap-3 p-4 sm:p-5"
      role={error ? "alert" : "status"}
    >
      <div className="flex items-start gap-3">
        {error ? (
          <AlertCircle
            className="mt-0.5 h-4 w-4 shrink-0 text-amber-400"
            aria-hidden="true"
          />
        ) : (
          <Inbox
            className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {children ||
              "Your saved settings have not changed. Try loading this information again."}
          </div>
        </div>
      </div>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          Try again
        </Button>
      )}
    </Card>
  );
}
