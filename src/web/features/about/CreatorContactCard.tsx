import { ExternalLink, MessageCircle } from "lucide-react";
import type { CreatorProfile } from "@/lib/api";
import { Card } from "@/components/ui/card";
import {
  DiscordPrimaryGuildTag,
  DiscordProfileAvatar,
} from "@/components/layout/DiscordProfileVisuals";

function GitHubMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M12 .9a11.1 11.1 0 0 0-3.51 21.63c.56.1.76-.24.76-.54v-1.9c-3.1.67-3.75-1.32-3.75-1.32-.5-1.28-1.24-1.62-1.24-1.62-1.01-.69.08-.68.08-.68 1.12.08 1.71 1.15 1.71 1.15 1 .1.75 2.48 3.55 1.77.1-.72.39-1.21.7-1.49-2.48-.28-5.08-1.24-5.08-5.53 0-1.22.44-2.22 1.15-3-.12-.28-.5-1.42.11-2.96 0 0 .94-.3 3.05 1.14a10.6 10.6 0 0 1 5.56 0c2.11-1.44 3.05-1.14 3.05-1.14.61 1.54.23 2.68.11 2.96.72.78 1.15 1.78 1.15 3 0 4.3-2.6 5.25-5.09 5.52.4.35.75 1.02.75 2.06v3.04c0 .3.2.65.77.54A11.1 11.1 0 0 0 12 .9Z" />
    </svg>
  );
}

export function CreatorContactCard({ creator }: { creator: CreatorProfile }) {
  const displayName = creator.profile?.globalName || creator.username;
  const discordUrl =
    creator.profileUrl || (creator.id ? `https://discord.com/users/${creator.id}` : undefined);
  const accentColor = creator.profile?.accentColor || "#18181b";

  return (
    <section
      aria-labelledby="about-contact-heading"
      className="mx-auto max-w-5xl px-4 pb-12 pt-6 sm:px-6 lg:px-8"
    >
      <h2
        id="about-contact-heading"
        className="mb-5 text-2xl font-bold tracking-tight text-white"
      >
        Contact Me
      </h2>
      <Card className="overflow-hidden border-zinc-800 bg-zinc-950 p-0">
        <div className="relative h-32 overflow-hidden">
          <div className="absolute inset-0" style={{ backgroundColor: accentColor }} />
          {creator.profile?.bannerUrl && (
            <img
              src={creator.profile.bannerUrl}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full object-cover object-center"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/15 to-zinc-950/70" />
        </div>

        <div className="relative -mt-9 flex flex-wrap items-end justify-between gap-4 px-5">
          <div className="flex min-w-0 items-end gap-3">
            <DiscordProfileAvatar
              avatarUrl={creator.avatarUrl}
              decorationUrl={creator.profile?.avatarDecorationUrl}
              alt={displayName}
              className="h-20 w-20 rounded-full bg-zinc-950"
              borderless
            />
            <div className="min-w-0 pb-1">
              <p className="truncate text-lg font-bold text-white">{displayName}</p>
              <p className="truncate font-mono text-xs text-zinc-400">@{creator.username}</p>
            </div>
          </div>
          <DiscordPrimaryGuildTag primaryGuild={creator.profile?.primaryGuild} />
        </div>

        <div className="grid grid-cols-1 gap-2 px-5 pb-5 pt-4 sm:grid-cols-2">
          {discordUrl && (
            <a
              href={discordUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/80 px-4 py-3 text-sm font-semibold text-zinc-100 transition hover:bg-zinc-800"
            >
              <MessageCircle className="h-4 w-4" />
              Discord Profile
              <ExternalLink className="h-3.5 w-3.5 text-zinc-400" />
            </a>
          )}
          <a
            href="https://github.com/itschase/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/80 px-4 py-3 text-sm font-semibold text-zinc-100 transition hover:bg-zinc-800"
          >
            <GitHubMark />
            GitHub
            <ExternalLink className="h-3.5 w-3.5 text-zinc-400" />
          </a>
        </div>
      </Card>
    </section>
  );
}
