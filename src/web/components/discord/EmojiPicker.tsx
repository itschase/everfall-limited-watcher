import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Search, Smile, X } from "lucide-react";
import { AdminEmojisResponse, apiFetch, DiscordEmojiRef } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const UNICODE_PRESETS: Array<{ category: string; items: Array<{ emoji: string; label: string }> }> = [
  {
    category: "Stock & Status",
    items: [
      { emoji: "🟢", label: "green in stock" },
      { emoji: "🔴", label: "red sold out" },
      { emoji: "🟡", label: "amber pending" },
      { emoji: "⛔", label: "no entry sold out" },
      { emoji: "✅", label: "verified check" },
      { emoji: "⚠️", label: "warning alert" },
    ],
  },
  {
    category: "Vehicles & Features",
    items: [
      { emoji: "🏎️", label: "race car vehicle" },
      { emoji: "🚗", label: "car automobile" },
      { emoji: "⚡", label: "lightning fast drop" },
      { emoji: "🔊", label: "custom sound audio" },
      { emoji: "🛠️", label: "customization options wrench" },
      { emoji: "✨", label: "sparkles limited edition" },
      { emoji: "🔥", label: "fire hot drop" },
      { emoji: "🏆", label: "trophy exclusive" },
      { emoji: "🛡️", label: "shield trading" },
      { emoji: "⏱️", label: "timer limited time" },
      { emoji: "🏁", label: "checkered flag track" },
      { emoji: "🔔", label: "bell notification alert" },
      { emoji: "🔗", label: "link store url" },
      { emoji: "📦", label: "package store" },
    ],
  },
];

export function EmojiTokenBadge({
  emoji,
  className,
}: {
  emoji?: DiscordEmojiRef | null;
  className?: string;
}) {
  if (!emoji) {
    return <span className={cn("text-xs text-muted-foreground", className)}>None</span>;
  }
  if (emoji.kind === "custom" && emoji.id) {
    const imgUrl =
      emoji.imageUrl ||
      `https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? "gif" : "webp"}?size=48&quality=lossless`;
    return (
      <span className={cn("inline-flex items-center gap-1.5", className)}>
        <img src={imgUrl} alt={emoji.name} className="h-4 w-4 shrink-0 object-contain" />
        <span className="truncate font-mono text-xs text-zinc-200">:{emoji.name}:</span>
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="text-sm leading-none">{emoji.name}</span>
      <span className="text-xs text-zinc-300">Unicode</span>
    </span>
  );
}

export function EmojiPickerButton({
  value,
  onChange,
  label = "Emoji",
  allowClear = true,
  recentEmojis = [],
  onSelectRecordRecent,
}: {
  value?: DiscordEmojiRef | null;
  onChange: (next: DiscordEmojiRef | null) => void;
  label?: string;
  allowClear?: boolean;
  recentEmojis?: DiscordEmojiRef[];
  onSelectRecordRecent?: (emoji: DiscordEmojiRef) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("unicode");

  const { data: discordEmojis, isFetching, refetch } = useQuery<AdminEmojisResponse>({
    queryKey: ["admin-discord-emojis"],
    queryFn: () => apiFetch<AdminEmojisResponse>("/api/admin/emojis"),
    enabled: open,
    staleTime: 60_000,
  });

  const combinedRecent = useMemo(() => {
    const seen = new Set<string>();
    const out: DiscordEmojiRef[] = [];
    for (const item of [...recentEmojis, ...(discordEmojis?.recentEmojis || [])]) {
      const key = item.kind === "custom" ? `c:${item.id}` : `u:${item.name}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(item);
      }
    }
    return out;
  }, [recentEmojis, discordEmojis?.recentEmojis]);

  const query = search.trim().toLowerCase();

  const filteredAppEmojis = useMemo(() => {
    const list = discordEmojis?.applicationEmojis || [];
    if (!query) return list;
    return list.filter((e) => e.name.toLowerCase().includes(query) || e.id?.includes(query));
  }, [discordEmojis?.applicationEmojis, query]);

  const filteredGuildEmojis = useMemo(() => {
    const list = discordEmojis?.guildEmojis || [];
    if (!query) return list;
    return list.filter(
      (e) =>
        e.name.toLowerCase().includes(query) ||
        e.guildName?.toLowerCase().includes(query) ||
        e.id?.includes(query)
    );
  }, [discordEmojis?.guildEmojis, query]);

  const pickEmoji = (emoji: DiscordEmojiRef) => {
    onChange(emoji);
    onSelectRecordRecent?.(emoji);
    setOpen(false);
  };

  return (
    <div className="flex items-center gap-1.5">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={`Select ${label}`}
        className="h-9 min-w-[140px] justify-between px-2.5 text-xs"
      >
        {value ? (
          <EmojiTokenBadge emoji={value} />
        ) : (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Smile className="h-3.5 w-3.5" />
            Choose Emoji
          </span>
        )}
      </Button>

      {allowClear && value && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Clear ${label}`}
          onClick={() => onChange(null)}
          className="h-9 w-9 shrink-0 text-muted-foreground hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Select Discord Emoji — {label}</DialogTitle>
            <DialogDescription>
              Pick a standard Unicode symbol or an active custom emoji from the Discord application or connected servers.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search emoji name or keyword..."
                className="h-9 pl-8 text-xs"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isFetching}
              onClick={() => void refetch()}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
              Refresh
            </Button>
          </div>

          {discordEmojis && !discordEmojis.botOnline && (
            <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 p-2.5 text-xs text-amber-200">
              Discord bot token is offline or unverified in this environment; showing standard Unicode emojis. Live application &amp; server emojis populate automatically when the bot is connected.
            </div>
          )}

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="w-full justify-start">
              <TabsTrigger value="unicode">Unicode Presets</TabsTrigger>
              <TabsTrigger value="application">
                App Emojis ({discordEmojis?.applicationEmojis?.length ?? 0})
              </TabsTrigger>
              <TabsTrigger value="server">
                Server Emojis ({discordEmojis?.guildEmojis?.length ?? 0})
              </TabsTrigger>
              <TabsTrigger value="recent">Recent ({combinedRecent.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="unicode" className="max-h-72 space-y-4 overflow-y-auto pr-1 thin-scrollbar">
              {UNICODE_PRESETS.map((group) => {
                const items = group.items.filter(
                  (it) => !query || it.label.toLowerCase().includes(query) || it.emoji.includes(query)
                );
                if (items.length === 0) return null;
                return (
                  <div key={group.category} className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {group.category}
                    </p>
                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                      {items.map((item) => (
                        <button
                          key={item.emoji}
                          type="button"
                          onClick={() =>
                            pickEmoji({ kind: "unicode", name: item.emoji, source: "unicode" })
                          }
                          title={item.label}
                          className="flex flex-col items-center justify-center gap-1 rounded-lg border border-border bg-zinc-950 p-2.5 text-center transition hover:border-zinc-600 hover:bg-zinc-900 cursor-pointer"
                        >
                          <span className="text-xl leading-none">{item.emoji}</span>
                          <span className="w-full truncate text-[10px] text-muted-foreground">
                            {item.label.split(" ")[0]}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </TabsContent>

            <TabsContent value="application" className="max-h-72 overflow-y-auto pr-1 thin-scrollbar">
              {filteredAppEmojis.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  {isFetching
                    ? "Loading application emojis from Discord..."
                    : "No custom application emojis matched."}
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {filteredAppEmojis.map((em) => (
                    <button
                      key={`app-${em.id}`}
                      type="button"
                      onClick={() => pickEmoji(em)}
                      className="flex items-center gap-2 rounded-lg border border-border bg-zinc-950 p-2 text-left transition hover:border-zinc-600 hover:bg-zinc-900 cursor-pointer"
                    >
                      <img
                        src={
                          em.imageUrl ||
                          `https://cdn.discordapp.com/emojis/${em.id}.${em.animated ? "gif" : "webp"}?size=64`
                        }
                        alt={em.name}
                        className="h-6 w-6 shrink-0 object-contain"
                      />
                      <span className="truncate font-mono text-xs text-zinc-200">:{em.name}:</span>
                    </button>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="server" className="max-h-72 overflow-y-auto pr-1 thin-scrollbar">
              {filteredGuildEmojis.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  {isFetching
                    ? "Loading connected server emojis..."
                    : "No connected Discord server emojis available."}
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {filteredGuildEmojis.map((em) => (
                    <button
                      key={`guild-${em.id}`}
                      type="button"
                      onClick={() => pickEmoji(em)}
                      className="flex items-center gap-2.5 rounded-lg border border-border bg-zinc-950 p-2 text-left transition hover:border-zinc-600 hover:bg-zinc-900 cursor-pointer"
                    >
                      <img
                        src={
                          em.imageUrl ||
                          `https://cdn.discordapp.com/emojis/${em.id}.${em.animated ? "gif" : "webp"}?size=64`
                        }
                        alt={em.name}
                        className="h-6 w-6 shrink-0 object-contain"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-xs text-zinc-200">:{em.name}:</p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {em.guildName || "Discord Server"}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="recent" className="max-h-72 overflow-y-auto pr-1 thin-scrollbar">
              {combinedRecent.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  Recently picked emojis will appear here for fast reuse.
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {combinedRecent.map((em, idx) => (
                    <button
                      key={`recent-${em.id || em.name}-${idx}`}
                      type="button"
                      onClick={() => pickEmoji(em)}
                      className="flex items-center gap-2 rounded-lg border border-border bg-zinc-950 p-2 text-left transition hover:border-zinc-600 hover:bg-zinc-900 cursor-pointer"
                    >
                      <EmojiTokenBadge emoji={em} />
                    </button>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
