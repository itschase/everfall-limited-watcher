import { Sparkles } from "lucide-react";
import type {
  DiscordNameplateAppearance,
  DiscordPrimaryGuildAppearance,
} from "../../../shared/discordProfile";
import { cn } from "@/lib/utils";

const NAMEPLATE_PALETTE_CLASSES: Record<string, string> = {
  crimson: "border-rose-900/70 bg-rose-950/70 text-rose-200",
  orange: "border-orange-900/70 bg-orange-950/70 text-orange-200",
  yellow: "border-amber-900/70 bg-amber-950/70 text-amber-200",
  green: "border-emerald-900/70 bg-emerald-950/70 text-emerald-200",
  blue: "border-sky-900/70 bg-sky-950/70 text-sky-200",
  purple: "border-violet-900/70 bg-violet-950/70 text-violet-200",
  rose: "border-pink-900/70 bg-pink-950/70 text-pink-200",
};

export function DiscordProfileAvatar({
  avatarUrl,
  decorationUrl,
  alt,
  className,
}: {
  avatarUrl: string;
  decorationUrl?: string | null;
  alt: string;
  className?: string;
}) {
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <img
        src={avatarUrl || undefined}
        alt={alt}
        className="absolute inset-[8%] h-[84%] w-[84%] rounded-full border border-white/10 bg-zinc-900 object-cover"
      />
      {decorationUrl && (
        <img
          src={decorationUrl}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full object-contain"
        />
      )}
    </span>
  );
}

export function DiscordNameplateChip({
  nameplate,
  className,
}: {
  nameplate?: DiscordNameplateAppearance | null;
  className?: string;
}) {
  if (!nameplate || (!nameplate.label && !nameplate.palette)) return null;
  const paletteClass =
    (nameplate.palette && NAMEPLATE_PALETTE_CLASSES[nameplate.palette.toLowerCase()]) ||
    "border-zinc-700 bg-zinc-900 text-zinc-200";

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium",
        paletteClass,
        className
      )}
    >
      <Sparkles className="h-3 w-3 shrink-0" />
      <span className="truncate">{nameplate.label || "Discord Nameplate"}</span>
    </span>
  );
}

export function DiscordPrimaryGuildTag({
  primaryGuild,
  className,
}: {
  primaryGuild?: DiscordPrimaryGuildAppearance | null;
  className?: string;
}) {
  if (!primaryGuild?.tag) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900/90 px-2 py-0.5 text-[10px] font-semibold text-zinc-200",
        className
      )}
    >
      {primaryGuild.badgeUrl && (
        <img src={primaryGuild.badgeUrl} alt="" className="h-3.5 w-3.5 object-contain" />
      )}
      {primaryGuild.tag}
    </span>
  );
}
