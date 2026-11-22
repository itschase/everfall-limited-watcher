import { Shield, Terminal } from "lucide-react";
import { DISCORD_SLASH_COMMANDS, DiscordSlashCommandDoc } from "../../../shared/slashCommands";
import { Card } from "@/components/ui/card";

export { DISCORD_SLASH_COMMANDS };
export type { DiscordSlashCommandDoc };

export function SlashCommandsSection({
  variant = "compact",
  title = "Discord Slash Commands",
  description = "Server configuration commands require Manage Server or Administrator permissions inside your Discord server.",
}: {
  variant?: "compact" | "detailed";
  title?: string;
  description?: string;
}) {
  return (
    <Card className="w-full min-w-0 overflow-hidden p-5 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Terminal className="h-5 w-5 text-white" />
          <h2 className="text-xl font-bold text-white">{title}</h2>
        </div>
        {variant === "detailed" && (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-zinc-950 px-2.5 py-1 text-xs font-medium text-zinc-300">
            <Shield className="h-3.5 w-3.5 text-zinc-400" />
            Permission-Scoped Commands
          </span>
        )}
      </div>

      <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {DISCORD_SLASH_COMMANDS.map((item) => (
          <div
            key={item.command}
            className="flex flex-col justify-between rounded-lg border border-border bg-zinc-950/80 p-4 transition-colors hover:border-zinc-700"
          >
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <code className="select-all cursor-text break-words font-mono text-xs font-semibold text-zinc-100">
                  {item.command}
                </code>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {variant === "detailed" ? item.detailedSummary : item.summary}
              </p>
            </div>

            {variant === "detailed" && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2.5 text-[11px] text-zinc-400">
                <span className="font-medium text-zinc-300">{item.permission}</span>
                <span className="text-zinc-500">{item.visibility}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
