import { Bot } from "lucide-react";
import { cn } from "@/lib/utils";

export function BotCreatorBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "bot-creator-gradient inline-flex items-center gap-1.5 rounded-md border border-amber-500/35 px-2.5 py-1 text-[10px] font-bold tracking-wide text-amber-50 shadow-sm",
        className
      )}
    >
      <Bot className="h-3.5 w-3.5" />
      Bot Creator
    </span>
  );
}
