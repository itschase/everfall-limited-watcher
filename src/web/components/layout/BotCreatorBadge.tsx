import { Bot } from "lucide-react";
import { cn } from "@/lib/utils";

export function BotCreatorBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "bot-creator-gradient inline-flex items-center gap-1.5 rounded-md border border-indigo-400/45 px-2.5 py-1 text-[10px] font-bold tracking-wide text-white shadow-[0_0_16px_rgba(99,102,241,0.42)]",
        className
      )}
    >
      <Bot className="bot-creator-icon h-3.5 w-3.5" />
      Bot Creator
    </span>
  );
}
