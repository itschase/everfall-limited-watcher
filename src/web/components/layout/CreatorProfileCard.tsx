import { useEffect, useRef, useState } from "react";
import { Bot, Check, Copy, ExternalLink, Shield } from "lucide-react";
import { CreatorProfile } from "@/lib/api";
import { cn } from "@/lib/utils";

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

  return (
    <div
      ref={containerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn("relative inline-block", className)}
    >
      {/* Trigger Pill */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Managed by</span>
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="group inline-flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-semibold text-white transition hover:border-zinc-600 hover:bg-zinc-900 cursor-pointer"
        >
          <img
            src={creator.avatarUrl}
            alt={creator.username}
            className="h-4 w-4 rounded-full object-cover transition group-hover:scale-110"
          />
          <span className="group-hover:text-zinc-100">{creator.username}</span>
        </button>
      </div>

      {/* Floating Discord Mini-Profile Card */}
      {isOpen && (
        <div
          role="dialog"
          aria-label={`${creator.username}'s Discord Profile`}
          className="absolute bottom-full right-0 z-50 mb-3 w-72 overflow-hidden rounded-2xl border border-zinc-700/80 bg-zinc-950 text-left shadow-[0_12px_40px_rgba(0,0,0,0.85)] animate-in fade-in-0 zoom-in-95 duration-150"
        >
          {/* Discord Profile Banner */}
          <div className="relative h-20 w-full overflow-hidden bg-gradient-to-r from-indigo-900/60 via-zinc-900 to-zinc-950">
            {/* Subtle decorative mesh accent */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(88,101,242,0.35),transparent_60%)]" />
            <div className="absolute right-3 top-3">
              <span className="inline-flex items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-semibold text-zinc-300 backdrop-blur-md">
                Discord
              </span>
            </div>
          </div>

          {/* Large Overlapping Avatar with Online Beacon */}
          <div className="relative px-4">
            <div className="relative -mt-10 inline-block">
              <img
                src={creator.avatarUrl}
                alt={creator.username}
                className="h-18 w-18 rounded-full border-4 border-zinc-950 bg-zinc-900 object-cover shadow-lg"
              />
              <span
                title="Online"
                className="absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-zinc-950 bg-emerald-500 shadow-sm"
              />
            </div>
          </div>

          {/* User Details */}
          <div className="p-4 pt-2">
            <div className="flex items-baseline justify-between gap-2">
              <h4 className="text-base font-bold tracking-tight text-white">{creator.username}</h4>
              <span className="font-mono text-xs text-zinc-400">@{creator.username.toLowerCase()}</span>
            </div>

            {/* Badges Row */}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                <Shield className="h-3 w-3" />
                Primary Administrator
              </span>
              <span className="inline-flex items-center gap-1 rounded-md border border-indigo-500/40 bg-indigo-500/15 px-2 py-0.5 text-[10px] font-semibold text-indigo-300">
                <Bot className="h-3 w-3" />
                Bot Creator
              </span>
            </div>

            <div className="my-3 border-t border-zinc-800/80" />

            {/* About & Metadata */}
            <div className="space-y-2">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">About</span>
                <p className="mt-0.5 text-xs leading-relaxed text-zinc-300">
                  Primary administrator and creator of Everfall Limited Watcher bot and platform.
                </p>
              </div>

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

            {/* Discord Action Button */}
            {profileUrl && (
              <a
                href={profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-lg bg-[#5865F2] px-3 py-2 text-xs font-semibold text-white shadow-md transition hover:bg-[#4752C4]"
              >
                <span>Open Discord Profile</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
