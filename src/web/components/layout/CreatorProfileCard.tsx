import { useEffect, useRef, useState } from "react";
import { Check, Code2, Copy, ExternalLink } from "lucide-react";
import { CreatorProfile } from "@/lib/api";
import { cn } from "@/lib/utils";
import { BotCreatorBadge } from "./BotCreatorBadge";
import {
  DiscordNameplateChip,
  DiscordPrimaryGuildTag,
  DiscordProfileAvatar,
} from "./DiscordProfileVisuals";

export function CreatorProfileCard({
  creator,
  className,
}: {
  creator: CreatorProfile;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const handleMouseEnter = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 200);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleCopyId = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (creator.id) {
      navigator.clipboard.writeText(creator.id).catch(() => {});
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  const profileUrl =
    creator.profileUrl || (creator.id ? `https://discord.com/users/${creator.id}` : undefined);
  const displayName = creator.profile?.globalName || creator.username;

  return (
    <div
      ref={containerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn("relative inline-block", className)}
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Managed by</span>
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="group inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-semibold text-white transition hover:border-zinc-600 hover:bg-zinc-900"
        >
          <DiscordProfileAvatar
            avatarUrl={creator.avatarUrl}
            decorationUrl={creator.profile?.avatarDecorationUrl}
            alt={displayName}
            className="h-5 w-5 transition group-hover:scale-110"
          />
          <span className="group-hover:text-zinc-100">{displayName}</span>
        </button>
      </div>

      {isOpen && (
        <div
          role="dialog"
          aria-label={`${displayName}'s Discord Profile`}
          className="absolute bottom-full right-0 z-50 mb-4 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-zinc-700/90 bg-zinc-950 text-left shadow-[0_16px_48px_rgba(0,0,0,0.9)] animate-in fade-in-0 zoom-in-95 duration-150"
        >
          <div
            className={cn(
              "relative h-32 w-full overflow-hidden",
              creator.profile?.accentColor
                ? "bg-zinc-900"
                : "bg-gradient-to-br from-zinc-700/70 via-zinc-900 to-zinc-950"
            )}
            style={
              creator.profile?.accentColor
                ? { backgroundColor: creator.profile.accentColor }
                : undefined
            }
          >
            {creator.profile?.bannerUrl && (
              <img
                src={creator.profile.bannerUrl}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-zinc-950/10" />
            <span className="absolute right-4 top-4 rounded-full border border-white/10 bg-black/45 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-zinc-200 backdrop-blur">
              Discord Profile
            </span>
          </div>

          <div className="relative px-5">
            <DiscordProfileAvatar
              avatarUrl={creator.avatarUrl}
              decorationUrl={creator.profile?.avatarDecorationUrl}
              alt={displayName}
              className="-mt-12 h-24 w-24 rounded-full bg-zinc-950"
            />
          </div>

          <div className="px-5 pb-5 pt-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h4 className="min-w-0 truncate text-lg font-bold tracking-tight text-white">
                {displayName}
              </h4>
              <span className="font-mono text-xs text-zinc-400">@{creator.username}</span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <BotCreatorBadge />
              <DiscordNameplateChip nameplate={creator.profile?.nameplate} />
              <DiscordPrimaryGuildTag primaryGuild={creator.profile?.primaryGuild} />
            </div>

            <div className="my-4 border-t border-zinc-800" />

            <div className="space-y-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">About</span>
                <p className="mt-0.5 text-xs leading-relaxed text-zinc-300">
                  Creator of Everfall Limited Watcher and its platform.
                </p>
              </div>

              <a
                href="https://github.com/itschase/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open itschase's GitHub profile"
                className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 py-2.5 transition hover:border-zinc-700 hover:bg-zinc-900"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-950 text-zinc-200">
                  <Code2 className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    GitHub
                  </span>
                  <span className="block truncate text-xs font-medium text-zinc-100">itschase</span>
                </span>
                <ExternalLink className="h-3.5 w-3.5 text-zinc-500" />
              </a>

              {creator.id && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="text-[10px] uppercase tracking-wider text-zinc-400">User ID</span>
                  <button
                    type="button"
                    onClick={handleCopyId}
                    title="Click to copy Discord ID"
                    className="inline-flex items-center gap-1 rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[11px] text-zinc-300 hover:border-zinc-700 hover:text-white cursor-pointer"
                  >
                    {copiedId ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-400" />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3 text-zinc-500" />
                        <span>{creator.id}</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {profileUrl && (
              <a
                href={profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 flex w-full items-center justify-center gap-2 border-t border-zinc-800 pt-4"
              >
                <span className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-xs font-semibold text-zinc-100 shadow-sm transition hover:border-zinc-600 hover:bg-zinc-800">
                  <span>Open Discord Profile</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </span>
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
