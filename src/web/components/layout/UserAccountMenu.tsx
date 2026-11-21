import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Check,
  ChevronDown,
  Copy,
  FileText,
  History,
  LayoutDashboard,
  LogOut,
  Shield,
} from "lucide-react";
import { toast } from "sonner";
import { SessionUser } from "@/lib/api";
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
          className="flex items-center gap-2 rounded-lg border border-border bg-card px-2 py-1.5 text-sm font-medium text-white transition hover:bg-secondary cursor-pointer sm:px-2.5"
        >
          <img src={user.avatarUrl || undefined} alt={user.username} className="h-6 w-6 shrink-0 rounded-full" />
          <span className="max-w-[96px] truncate text-xs font-semibold sm:max-w-[120px]">
            {user.username}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col">
          <span className="text-sm text-white">{user.username}</span>
          <span className="font-mono text-[11px] font-normal text-muted-foreground">
            ID:{" "}
            <span className="select-text cursor-text text-zinc-300">{user.id}</span>
          </span>
        </DropdownMenuLabel>
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
