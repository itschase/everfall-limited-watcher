import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function SummaryGrid({
  children,
  columns = 4,
  className,
}: {
  children: ReactNode;
  columns?: 3 | 4;
  className?: string;
}) {
  return (
    <div
      data-columns={columns}
      className={cn(
        "summary-grid grid grid-cols-2 gap-2.5",
        columns === 3 ? "@3xl/main:grid-cols-3" : "@4xl/main:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SummaryMetric({
  label,
  value,
  hint,
  icon: Icon,
  status,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  status?: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  return (
    <Card className="summary-metric p-3 sm:p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium leading-relaxed text-muted-foreground sm:text-xs">
          {label}
        </p>
        {Icon && (
          <Icon
            aria-hidden="true"
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
          />
        )}
      </div>
      <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-2">
        <div
          className={cn(
            "min-w-0 break-words text-xl font-semibold leading-tight tracking-tight tabular-nums sm:text-2xl",
            tone === "success"
              ? "text-emerald-400"
              : tone === "warning"
                ? "text-amber-400"
                : tone === "danger"
                  ? "text-red-400"
                  : "text-foreground",
          )}
        >
          {value}
        </div>
        {status}
      </div>
      {hint && (
        <div className="mt-1.5 break-words text-[11px] leading-relaxed text-muted-foreground">
          {hint}
        </div>
      )}
    </Card>
  );
}
