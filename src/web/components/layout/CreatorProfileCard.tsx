import { useEffect, useRef, useState } from "react";
import { ExternalLink, X } from "lucide-react";
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

function DiscordMark({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M20.32 4.37a19.8 19.8 0 0 0-4.89-1.52.08.08 0 0 0-.08.04c-.21.37-.44.87-.61 1.25a18.3 18.3 0 0 0-5.49 0c-.16-.38-.4-.88-.61-1.25a.08.08 0 0 0-.08-.04 19.7 19.7 0 0 0-4.89 1.52.07.07 0 0 0-.03.03C.53 9.37-.32 14 .1 18.58c0 .02.01.04.03.06a19.9 19.9 0 0 0 6 3.03.08.08 0 0 0 .09-.03c.46-.63.87-1.3 1.23-1.99a.08.08 0 0 0-.04-.11 13 13 0 0 1-1.87-.89.08.08 0 0 1-.01-.13l.37-.29a.07.07 0 0 1 .08-.01c3.93 1.79 8.18 1.79 12.06 0a.07.07 0 0 1 .08.01l.37.29a.08.08 0 0 1-.01.13c-.6.35-1.22.65-1.87.89a.08.08 0 0 0-.04.11c.36.7.77 1.36 1.23 1.99a.08.08 0 0 0 .08.03 19.9 19.9 0 0 0 6.01-3.03.08.08 0 0 0 .03-.06c.5-5.28-.84-9.88-3.55-13.95a.06.06 0 0 0-.03-.03ZM8.02 15.33c-1.18 0-2.16-1.09-2.16-2.42s.96-2.42 2.16-2.42c1.21 0 2.18 1.1 2.16 2.42 0 1.33-.95 2.42-2.16 2.42Zm7.97 0c-1.18 0-2.16-1.09-2.16-2.42s.96-2.42 2.16-2.42c1.21 0 2.18 1.1 2.16 2.42 0 1.33-.95 2.42-2.16 2.42Z" />
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

  useEffect(() => {
    if (!isOpen) return;
    const handleOutsidePointer = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("pointerdown", handleOutsidePointer);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointer);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

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
          className="group inline-flex cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-1 py-1 text-sm font-semibold text-zinc-200 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 sm:text-base"
        >
          <DiscordProfileAvatar
            avatarUrl={creator.avatarUrl}
            decorationUrl={creator.profile?.avatarDecorationUrl}
            alt={displayName}
            className="h-7 w-7 transition group-hover:scale-110"
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
            <div
              className="absolute inset-0"
              style={{ backgroundColor: creator.profile?.accentColor || "#18181b" }}
            />
            {creator.profile?.bannerUrl && (
              <img
                src={creator.profile.bannerUrl}
                alt=""
                className="absolute -inset-[12%] h-[124%] w-[124%] scale-110 object-cover blur-[16px] brightness-[0.42] saturate-75"
              />
            )}
            <div className="absolute inset-0 bg-zinc-950/35" />
            <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/15 via-zinc-950/35 to-zinc-950/65" />
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

                <div className="grid grid-cols-2 gap-2">
                  <a
                    href="https://github.com/itschase/"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open itschase's GitHub profile"
                    className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-lg bg-zinc-950/65 px-2 py-2 text-xs font-semibold text-zinc-100 transition hover:bg-zinc-950/90"
                  >
                    <GitHubMark className="h-4 w-4 shrink-0" />
                    <span className="truncate">GitHub</span>
                    <ExternalLink className="h-3 w-3 shrink-0 text-zinc-400" />
                  </a>
                  {profileUrl && (
                    <a
                      href={profileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Open the creator's Discord profile"
                      className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-lg bg-zinc-950/65 px-2 py-2 text-xs font-semibold text-zinc-100 transition hover:bg-zinc-950/90"
                    >
                      <DiscordMark className="h-4 w-4 shrink-0" />
                      <span className="truncate">Discord</span>
                      <ExternalLink className="h-3 w-3 shrink-0 text-zinc-400" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
