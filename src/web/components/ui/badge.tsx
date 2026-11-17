import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors",
  {
    variants: {
      variant: {
        default: "border-zinc-700 bg-zinc-800/80 text-zinc-100",
        secondary: "border-border bg-secondary text-muted-foreground",
        info: "border-sky-500/35 bg-sky-500/15 text-sky-300",
        success: "border-emerald-500/35 bg-emerald-500/15 text-emerald-300",
        warning: "border-amber-500/40 bg-amber-500/15 text-amber-300",
        destructive: "border-red-500/35 bg-red-500/15 text-red-300",
        outline: "border-border bg-transparent text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
