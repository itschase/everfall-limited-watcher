import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  FileText,
  History,
  LayoutDashboard,
  LogOut,
  Shield,
} from "lucide-react";
import { toast } from "sonner";
import { SessionUser } from "@/lib/api";
import { cn } from "@/lib/utils";
import { BotCreatorBadge } from "./BotCreatorBadge";
import {
  DiscordNameplateChip,
  DiscordPrimaryGuildTag,
  DiscordProfileAvatar,
} from "./DiscordProfileVisuals";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserAccountMenu({
  user,
  onLogout,
}: {
  user: SessionUser;
  onLogout: () => Promise<void> | void;
}) {
  const navigate = useNavigate();
  const [copiedId, setCopiedId] = useState(false);
  const displayName = user.profile?.globalName || user.username;
  const discordProfileUrl = `https://discord.com/users/${user.id}`;

  const copyDiscordId = async () => {
    try {
      await navigator.clipboard.writeText(user.id);
      setCopiedId(true);
      toast.success("Copied Discord user ID");
      window.setTimeout(() => setCopiedId(false), 1800);
    } catch {
      toast.error("Unable to copy ID");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-2 py-1.5 text-sm font-medium text-white transition hover:bg-secondary sm:px-2.5"
        >
          <DiscordProfileAvatar
            avatarUrl={user.avatarUrl}
            decorationUrl={user.profile?.avatarDecorationUrl}
            alt={displayName}
            className="h-7 w-7"
          />
          <span className="max-w-[96px] truncate text-xs font-semibold sm:max-w-[120px]">
            {displayName}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[min(20rem,calc(100vw-1.5rem))] max-h-[calc(100dvh-1.5rem)] overflow-y-auto overscroll-contain"
      >
        <div className="relative -mx-1.5 -mt-1.5 mb-1 overflow-hidden rounded-t-lg">
          <div
            className={cn(
              "relative h-20 overflow-hidden",
              user.profile?.accentColor
                ? "bg-zinc-900"
                : "bg-gradient-to-br from-zinc-700/70 via-zinc-900 to-zinc-950"
            )}
            style={
              user.profile?.accentColor
                ? { backgroundColor: user.profile.accentColor }
                : undefined
            }
          >
            {user.profile?.bannerUrl && (
              <img
                src={user.profile.bannerUrl}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/90 via-zinc-950/15 to-transparent" />
          </div>
          <div className="relative -mt-8 flex items-end gap-3 px-3 pb-2">
            <DiscordProfileAvatar
              avatarUrl={user.avatarUrl}
              decorationUrl={user.profile?.avatarDecorationUrl}
              alt={displayName}
              className="h-16 w-16 rounded-full bg-popover"
            />
            <div className="mb-1 min-w-0">
              <p className="truncate text-sm font-semibold text-white">{displayName}</p>
              <p className="truncate font-mono text-[11px] text-zinc-400">@{user.username}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 px-3 pb-2">
            {user.isAdmin ? (
              <BotCreatorBadge />
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] font-semibold text-zinc-300">
                <Shield className="h-3 w-3" />
                Server Manager
              </span>
            )}
            <DiscordNameplateChip nameplate={user.profile?.nameplate} />
            <DiscordPrimaryGuildTag primaryGuild={user.profile?.primaryGuild} />
          </div>
        </div>
        <DropdownMenuLabel className="flex flex-col pb-2">
          <span className="font-mono text-[11px] font-normal text-muted-foreground">
            Discord ID: <span className="select-text cursor-text text-zinc-300">{user.id}</span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <a href={discordProfileUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
            View Discord Profile
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void copyDiscordId()}>
          {copiedId ? (
            <Check className="h-4 w-4 text-emerald-400" />
          ) : (
            <Copy className="h-4 w-4 text-muted-foreground" />
          )}
          Copy Discord ID
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void navigate({ to: "/changelog" })}>
          <FileText className="h-4 w-4" />
          Changelog
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void navigate({ to: "/dashboard" })}>
          <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
          Server Dashboard
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void navigate({ to: "/history" })}>
          <History className="h-4 w-4 text-muted-foreground" />
          Limited Drop History
        </DropdownMenuItem>
        {user.isAdmin && (
          <DropdownMenuItem onSelect={() => void navigate({ to: "/admin" })}>
            <Shield className="h-4 w-4 text-amber-400" />
            Admin Overview
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => void onLogout()}
          className="text-red-400 focus:text-red-300"
        >
          <LogOut className="h-4 w-4" />
          Log Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
