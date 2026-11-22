import { useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink, X } from "lucide-react";
import { CreatorProfile } from "@/lib/api";
import { cn } from "@/lib/utils";
import { BotCreatorBadge } from "./BotCreatorBadge";
import {
  DiscordPrimaryGuildTag,
  DiscordProfileAvatar,
} from "./DiscordProfileVisuals";

function GitHubMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path d="M12 .9a11.1 11.1 0 0 0-3.51 21.63c.56.1.76-.24.76-.54v-1.9c-3.1.67-3.75-1.32-3.75-1.32-.5-1.28-1.24-1.62-1.24-1.62-1.01-.69.08-.68.08-.68 1.12.08 1.71 1.15 1.71 1.15 1 .1.75 2.48 3.55 1.77.1-.72.39-1.21.7-1.49-2.48-.28-5.08-1.24-5.08-5.53 0-1.22.44-2.22 1.15-3-.12-.28-.5-1.42.11-2.96 0 0 .94-.3 3.05 1.14a10.6 10.6 0 0 1 5.56 0c2.11-1.44 3.05-1.14 3.05-1.14.61 1.54.23 2.68.11 2.96.72.78 1.15 1.78 1.15 3 0 4.3-2.6 5.25-5.09 5.52.4.35.75 1.02.75 2.06v3.04c0 .3.2.65.77.54A11.1 11.1 0 0 0 12 .9Z" />
    </svg>
  );
}

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
    if (!window.matchMedia("(hover: hover)").matches) return;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    if (!window.matchMedia("(hover: hover)").matches) return;
    timeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 200);
  };

  const handleTriggerClick = () => {
    if (window.matchMedia("(hover: hover)").matches) {
      setIsOpen(true);
    } else {
      setIsOpen((prev) => !prev);
    }
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
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          onClick={handleTriggerClick}
          className="group inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-semibold text-white transition hover:border-zinc-600 hover:bg-zinc-900"
        >
          <DiscordProfileAvatar
            avatarUrl={creator.avatarUrl}
            decorationUrl={creator.profile?.avatarDecorationUrl}
            alt={displayName}
            className="h-5 w-5 transition group-hover:scale-110"
          />
          <span className="max-w-[calc(100vw-7rem)] truncate group-hover:text-zinc-100 sm:max-w-none">
            {displayName}
          </span>
        </button>
      </div>

      {isOpen && (
        <div
          role="dialog"
          aria-label={`${displayName}'s Discord Profile`}
          className="fixed inset-x-3 bottom-3 top-auto z-50 mx-auto max-h-[calc(100dvh-1.5rem)] w-auto max-w-sm overflow-y-auto overscroll-contain rounded-2xl border border-zinc-700/90 bg-zinc-950 text-left shadow-[0_16px_48px_rgba(0,0,0,0.9)] animate-in fade-in-0 zoom-in-95 duration-150 sm:absolute sm:inset-x-auto sm:bottom-full sm:right-0 sm:top-auto sm:mb-4 sm:max-h-[calc(100dvh-2rem)] sm:w-[min(24rem,calc(100vw-2rem))]"
        >
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
            {creator.profile?.bannerUrl && (
              <img
                src={creator.profile.bannerUrl}
                alt=""
                className="absolute -inset-[12%] h-[124%] w-[124%] scale-110 object-cover blur-[18px] brightness-[0.32] saturate-75"
              />
            )}
            {!creator.profile?.bannerUrl && (
              <div
                className="absolute inset-0"
                style={{ backgroundColor: creator.profile?.accentColor || "#18181b" }}
              />
            )}
            <div className="absolute inset-0 bg-zinc-950/60" />
            <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/35 via-zinc-950/70 to-zinc-950/90" />
          </div>

          <div className="relative z-10">
            <div className="relative h-24 px-4 pt-4 sm:px-5">
              <button
                type="button"
                aria-label="Close Discord profile"
                onClick={() => setIsOpen(false)}
                className="absolute left-4 top-4 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-black/50 text-zinc-200 backdrop-blur transition hover:bg-black/70 sm:left-5"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <span className="absolute right-4 top-4 rounded-full border border-white/10 bg-black/50 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-zinc-200 backdrop-blur sm:right-5">
                Discord Profile
              </span>
            </div>
            <div className="relative px-4 sm:px-5">
              <DiscordProfileAvatar
                avatarUrl={creator.avatarUrl}
                decorationUrl={creator.profile?.avatarDecorationUrl}
                alt={displayName}
                className="-mt-12 h-20 w-20 rounded-full bg-zinc-950 sm:h-24 sm:w-24"
              />
            </div>

            <div className="px-4 pb-4 pt-2 sm:px-5 sm:pb-5">
              <div className="flex flex-col gap-0.5 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-x-3">
                <h4 className="min-w-0 truncate text-base font-bold tracking-tight text-white sm:text-lg">
                  {displayName}
                </h4>
                <span className="font-mono text-[11px] text-zinc-400 sm:text-xs">
                  @{creator.username}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <BotCreatorBadge />
                <DiscordPrimaryGuildTag primaryGuild={creator.profile?.primaryGuild} />
              </div>

              <div className="my-3 border-t border-white/10 sm:my-4" />

              <div className="space-y-3">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    About
                  </span>
                  <p className="mt-0.5 text-xs leading-relaxed text-zinc-300">
                    Creator of Everfall Limited Watcher and its platform.
                  </p>
                </div>

                <a
                  href="https://github.com/itschase/"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open itschase's GitHub profile"
                  className="flex items-center gap-2 rounded-lg border border-white/10 bg-zinc-950/55 px-2.5 py-1.5 transition hover:border-white/20 hover:bg-zinc-950/75"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-700 bg-zinc-950/90 text-zinc-200">
                    <GitHubMark className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-zinc-100">
                      GitHub <span className="text-zinc-400">· itschase</span>
                    </span>
                  </span>
                  <ExternalLink className="h-3 w-3 text-zinc-500" />
                </a>

                {creator.id && (
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="shrink-0 text-[10px] uppercase tracking-wider text-zinc-400">
                      User ID
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyId}
                      title="Click to copy Discord ID"
                      className="inline-flex min-w-0 items-center gap-1 rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[11px] text-zinc-300 hover:border-zinc-700 hover:text-white cursor-pointer"
                    >
                      {copiedId ? (
                        <>
                          <Check className="h-3 w-3 shrink-0 text-emerald-400" />
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3 shrink-0 text-zinc-500" />
                          <span className="truncate">{creator.id}</span>
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
                  className="mt-3 flex w-full items-center justify-center gap-2 border-t border-white/10 pt-3 sm:mt-4 sm:pt-4"
                >
                  <span className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-600 bg-zinc-900/90 px-3 py-3 text-sm font-semibold text-zinc-100 shadow-sm transition hover:border-zinc-500 hover:bg-zinc-800">
                    <span>Open Discord Profile</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </span>
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
