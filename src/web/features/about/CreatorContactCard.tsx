import type { CreatorProfile } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { BotCreatorBadge } from "@/components/layout/BotCreatorBadge";
import {
  DiscordPrimaryGuildTag,
  DiscordProfileAvatar,
} from "@/components/layout/DiscordProfileVisuals";

function DiscordMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M20.32 4.37a19.8 19.8 0 0 0-4.89-1.52.08.08 0 0 0-.08.04c-.21.37-.44.87-.61 1.25a18.3 18.3 0 0 0-5.49 0c-.16-.38-.4-.88-.61-1.25a.08.08 0 0 0-.08-.04 19.7 19.7 0 0 0-4.89 1.52.07.07 0 0 0-.03.03C.53 9.37-.32 14 .1 18.58c0 .02.01.04.03.06a19.9 19.9 0 0 0 6 3.03.08.08 0 0 0 .09-.03c.46-.63.87-1.3 1.23-1.99a.08.08 0 0 0-.04-.11 13 13 0 0 1-1.87-.89.08.08 0 0 1-.01-.13l.37-.29a.07.07 0 0 1 .08-.01c3.93 1.79 8.18 1.79 12.06 0a.07.07 0 0 1 .08.01l.37.29a.08.08 0 0 1-.01.13c-.6.35-1.22.65-1.87.89a.08.08 0 0 0-.04.11c.36.7.77 1.36 1.23 1.99a.08.08 0 0 0 .08.03 19.9 19.9 0 0 0 6.01-3.03.08.08 0 0 0 .03-.06c.5-5.28-.84-9.88-3.55-13.95a.06.06 0 0 0-.03-.03ZM8.02 15.33c-1.18 0-2.16-1.09-2.16-2.42s.96-2.42 2.16-2.42c1.21 0 2.18 1.1 2.16 2.42 0 1.33-.95 2.42-2.16 2.42Zm7.97 0c-1.18 0-2.16-1.09-2.16-2.42s.96-2.42 2.16-2.42c1.21 0 2.18 1.1 2.16 2.42 0 1.33-.95 2.42-2.16 2.42Z" />
    </svg>
  );
}

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
      <Card className="relative isolate overflow-hidden border-zinc-800 bg-zinc-950 p-0">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          <div className="absolute inset-0" style={{ backgroundColor: accentColor }} />
          {creator.profile?.bannerUrl && (
            <img
              src={creator.profile.bannerUrl}
              alt=""
              className="absolute inset-0 h-full w-full scale-105 object-cover object-center blur-[8px] brightness-[0.38] saturate-75"
            />
          )}
          <div className="absolute inset-0 bg-zinc-950/25" />
          <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/15 via-zinc-950/35 to-zinc-950/65" />
        </div>

        <div className="relative z-10">
          <div className="relative h-40 overflow-hidden px-5 pt-4">
            <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
              <div className="absolute inset-0" style={{ backgroundColor: accentColor }} />
              {creator.profile?.bannerUrl && (
                <img
                  src={creator.profile.bannerUrl}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover object-center brightness-[0.86] saturate-90"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/20 via-transparent to-zinc-950/55" />
            </div>
          </div>

          <div className="relative px-5">
            <DiscordProfileAvatar
              avatarUrl={creator.avatarUrl}
              decorationUrl={creator.profile?.avatarDecorationUrl}
              alt={displayName}
              className="-mt-12 h-20 w-20 rounded-full bg-zinc-950 sm:h-24 sm:w-24"
              borderless
            />
          </div>

          <div className="px-5 pb-5 pt-2">
            <div className="flex flex-col gap-0.5 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-x-3">
              <h3 className="min-w-0 truncate text-lg font-bold tracking-tight text-white">
                {displayName}
              </h3>
              <span className="font-mono text-xs text-zinc-400">@{creator.username}</span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <BotCreatorBadge />
              <DiscordPrimaryGuildTag primaryGuild={creator.profile?.primaryGuild} />
            </div>

            <div className="my-4 border-t border-white/10" />

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {discordUrl && (
                <a
                  href={discordUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-w-28 items-center justify-center gap-2 rounded-lg bg-zinc-950/65 px-4 py-2.5 text-sm font-semibold text-zinc-100 transition hover:bg-zinc-950/90"
                >
                  <DiscordMark />
                  Discord
                </a>
              )}
              <a
                href="https://github.com/itschase/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-w-28 items-center justify-center gap-2 rounded-lg bg-zinc-950/65 px-4 py-2.5 text-sm font-semibold text-zinc-100 transition hover:bg-zinc-950/90"
              >
                <GitHubMark />
                GitHub
              </a>
            </div>
          </div>
        </div>
      </Card>
    </section>
  );
}
