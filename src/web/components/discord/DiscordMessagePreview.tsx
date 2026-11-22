import { Fragment } from "react";
import { AlertCircle, AlertTriangle, ExternalLink } from "lucide-react";
import {
  AnnouncementTemplate,
  ListingItem,
  MonitorStatus,
  WidgetTemplateConfig,
} from "@/lib/api";
import {
  buildCarDropPayload,
  buildWidgetPayload,
  validateDiscordPayloadLimits,
} from "../../../shared/presentation";
import { formatLocalDateTime } from "@/lib/utils";

function renderFormattedDiscordSegment(text: string): React.ReactNode {
  // Replace Discord custom emoji tokens <:name:id> / <a:name:id> and basic markdown links / bold / inline code / timestamps
  const tokenRegex =
    /(<a?:[a-zA-Z0-9_]+:\d{17,22}>|<t:\d+:[a-zA-Z]>|\[[^\]]+\]\(https?:\/\/[^)]+\)|\*\*[^*]+\*\*|`[^`]+`)/g;
  const parts = text.split(tokenRegex);

  return parts.map((part, idx) => {
    if (!part) return null;
    const customEmoji = part.match(/^<(a)?:([a-zA-Z0-9_]+):(\d{17,22})>$/);
    if (customEmoji) {
      const animated = Boolean(customEmoji[1]);
      const name = customEmoji[2];
      const id = customEmoji[3];
      return (
        <img
          key={idx}
          src={`https://cdn.discordapp.com/emojis/${id}.${animated ? "gif" : "webp"}?size=32&quality=lossless`}
          alt={`:${name}:`}
          title={`:${name}:`}
          className="mx-0.5 inline-block h-4 w-4 align-text-bottom"
        />
      );
    }

    const tsMatch = part.match(/^<t:(\d+):([a-zA-Z])>$/);
    if (tsMatch) {
      const ms = Number(tsMatch[1]) * 1000;
      const mode = tsMatch[2];
      const formatted = mode === "R" ? "just now" : formatLocalDateTime(ms);
      return (
        <span
          key={idx}
          className="rounded bg-[#3F4147] px-1 py-0.5 text-[11px] text-[#E0E1E5]"
        >
          {formatted}
        </span>
      );
    }

    const linkMatch = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
    if (linkMatch) {
      return (
        <a
          key={idx}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#00A8FC] hover:underline"
        >
          {linkMatch[1]}
        </a>
      );
    }

    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={idx} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }

    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={idx}
          className="rounded border border-white/10 bg-[#1E1F22] px-1.5 py-0.5 font-mono text-[11px] text-[#DBDEE1]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    return <Fragment key={idx}>{part}</Fragment>;
  });
}

function DiscordRichText({ content }: { content: string }) {
  const lines = content.split("\n");
  return (
    <div className="space-y-1 text-xs leading-relaxed text-[#DBDEE1]">
      {lines.map((line, idx) => {
        if (!line.trim()) {
          return <div key={idx} className="h-1.5" />;
        }
        if (line.startsWith("# ")) {
          return (
            <p key={idx} className="text-base font-bold leading-snug text-white">
              {renderFormattedDiscordSegment(line.slice(2))}
            </p>
          );
        }
        if (line.startsWith("-# ")) {
          return (
            <p key={idx} className="pt-1 text-[11px] text-[#949BA4]">
              {renderFormattedDiscordSegment(line.slice(3))}
            </p>
          );
        }
        if (line.startsWith("> ")) {
          return (
            <div
              key={idx}
              className="border-l-2 border-[#4E5058] pl-2.5 text-xs text-[#DBDEE1]"
            >
              {renderFormattedDiscordSegment(line.slice(2))}
            </div>
          );
        }
        return <p key={idx}>{renderFormattedDiscordSegment(line)}</p>;
      })}
    </div>
  );
}

function DiscordButtonChip({ btn }: { btn: any }) {
  const emoji = btn?.emoji;
  return (
    <span className="inline-flex items-center gap-1.5 rounded bg-[#4E5058] px-3 py-1.5 text-xs font-semibold text-white">
      {emoji?.id ? (
        <img
          src={`https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? "gif" : "webp"}?size=32`}
          alt={emoji.name || ""}
          className="h-4 w-4 object-contain"
        />
      ) : emoji?.name ? (
        <span>{emoji.name}</span>
      ) : null}
      <span>{btn?.label || "Link"}</span>
      <ExternalLink className="h-3 w-3 opacity-80" />
    </span>
  );
}

export function AnnouncementPreviewCard({
  mode,
  template,
  listing,
  portalOrigin,
  monitorStatus,
}: {
  mode: "in_stock" | "sold_out";
  template: AnnouncementTemplate;
  listing: ListingItem;
  portalOrigin?: string;
  monitorStatus?: MonitorStatus | null;
}) {
  const payload = buildCarDropPayload({
    car: {
      id: listing.id,
      name: listing.name,
      description: listing.description,
      url: listing.url,
      images: listing.images,
      isAvailable: mode === "in_stock",
      detectedAt: listing.detectedAt,
      lastVerifiedAt: listing.lastVerifiedAt,
      soldOutAt: mode === "sold_out" ? listing.soldOutAt || Date.now() : undefined,
    },
    override: listing.presentation?.override || null,
    template,
    portalOrigin,
    monitorStatus,
    isUpdate: mode === "sold_out",
  });

  const validation = validateDiscordPayloadLimits(payload);
  const container = payload.components?.find((c: any) => c.type === 17);
  const accentHex = container?.accent_color
    ? `#${Number(container.accent_color).toString(16).padStart(6, "0")}`
    : template.accentColor;

  return (
    <div className="space-y-3">
      {validation.errors.length > 0 && (
        <div className="rounded-lg border border-red-500/40 bg-red-950/40 p-3 text-xs text-red-200">
          <div className="flex items-center gap-1.5 font-semibold">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
            Discord Payload Limit Exceeded
          </div>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {validation.errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-[#313338] p-4 shadow-inner">
        <div className="mb-3 flex items-center gap-2">
          <img src="/icon.webp" alt="" className="h-7 w-7 rounded-full bg-zinc-900 object-contain" />
          <span className="text-sm font-semibold text-white">Everfall Limited Watcher</span>
          <span className="rounded bg-[#5865F2] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            APP
          </span>
          <span className="text-[11px] text-[#949BA4]">Today at {formatLocalDateTime(Date.now())}</span>
        </div>

        {container && (
          <div
            className="space-y-3 rounded-lg border border-white/10 bg-[#2B2D31] p-4"
            style={{ boxShadow: `inset 4px 0 0 ${accentHex}` }}
          >
            {(container.components || []).map((comp: any, idx: number) => {
              if (comp.type === 10) {
                return <DiscordRichText key={idx} content={comp.content || ""} />;
              }
              if (comp.type === 12 && Array.isArray(comp.items)) {
                const single = comp.items.length === 1;
                return (
                  <div
                    key={idx}
                    className={
                      single
                        ? "overflow-hidden rounded-lg"
                        : "grid grid-cols-2 gap-1.5 overflow-hidden rounded-lg"
                    }
                  >
                    {comp.items.slice(0, 4).map((item: any, i: number) => (
                      <img
                        key={i}
                        src={item?.media?.url}
                        alt={item?.description || ""}
                        referrerPolicy="no-referrer"
                        className="aspect-video w-full bg-[#1E1F22] object-cover"
                      />
                    ))}
                  </div>
                );
              }
              if (comp.type === 1 && Array.isArray(comp.components)) {
                return (
                  <div key={idx} className="flex flex-wrap gap-2 pt-1">
                    {comp.components.map((btn: any, bIdx: number) => (
                      <DiscordButtonChip key={bIdx} btn={btn} />
                    ))}
                  </div>
                );
              }
              return null;
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function buildWidgetPreviewPayload({
  template,
  listings,
  monitorStatus,
  portalOrigin,
  lastSyncedAt,
}: {
  template: WidgetTemplateConfig;
  listings: ListingItem[];
  monitorStatus: MonitorStatus | null;
  portalOrigin?: string;
  lastSyncedAt?: number;
}) {
  return buildWidgetPayload({
    records: listings.map((l) => ({
      id: l.id,
      firstSeenAt: l.detectedAt,
      lastVerifiedAt: l.lastVerifiedAt,
      soldOutAt: l.soldOutAt ?? undefined,
      isAvailable: l.isAvailable,
      payload: {
        name: l.name,
        description: l.description,
        url: l.url,
        images: l.images,
      },
      override: l.presentation?.override || null,
    })),
    monitorStatus,
    template,
    portalOrigin,
    widgetUpdatedAt: lastSyncedAt || Date.now(),
  });

}

export function WidgetPreviewCard({
  template,
  listings,
  monitorStatus,
  portalOrigin,
  lastSyncedAt,
}: {
  template: WidgetTemplateConfig;
  listings: ListingItem[];
  monitorStatus: MonitorStatus | null;
  portalOrigin?: string;
  lastSyncedAt?: number;
}) {
  const payload = buildWidgetPreviewPayload({ template, listings, monitorStatus, portalOrigin, lastSyncedAt });

  const validation = validateDiscordPayloadLimits(payload);
  const embed = payload.embeds?.[0];
  const colorHex = embed?.color
    ? `#${Number(embed.color).toString(16).padStart(6, "0")}`
    : template.accentColor;

  return (
    <div className="space-y-3">
      {validation.errors.length > 0 && (
        <div className="rounded-lg border border-red-500/40 bg-red-950/40 p-3 text-xs text-red-200">
          <div className="flex items-center gap-1.5 font-semibold">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
            Discord Payload Limit Exceeded
          </div>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {validation.errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {validation.warnings.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 p-3 text-xs text-amber-200">
          <div className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
            {validation.warnings.join(" ")}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-[#313338] p-4 shadow-inner">
        <div className="mb-3 flex items-center gap-2">
          <img src="/icon.webp" alt="" className="h-7 w-7 rounded-full bg-zinc-900 object-contain" />
          <span className="text-sm font-semibold text-white">Everfall Limited Watcher</span>
          <span className="rounded bg-[#5865F2] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            APP
          </span>
          <span className="text-[11px] text-[#949BA4]">Live Status Widget</span>
        </div>

        {embed && (
          <div
            className="space-y-3 rounded-lg border border-white/10 bg-[#2B2D31] p-4"
            style={{ boxShadow: `inset 4px 0 0 ${colorHex}` }}
          >
            <p data-preview-region="widget-heading" className="text-sm font-bold text-white">
              {renderFormattedDiscordSegment(embed.title || "")}
            </p>
            <div data-preview-region="widget-content" className="space-y-3">
            {embed.description && <DiscordRichText content={embed.description} />}

            {Array.isArray(embed.fields) && embed.fields.length > 0 && (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                {embed.fields.map((field: any, fIdx: number) => (
                  <div
                    key={fIdx}
                    className={
                      field.inline
                        ? "rounded-md bg-[#232428]/70 p-2.5"
                        : "rounded-md bg-[#232428]/70 p-2.5 sm:col-span-3"
                    }
                  >
                    <p className="text-xs font-bold text-white">
                      {renderFormattedDiscordSegment(field.name || "")}
                    </p>
                    <div className="mt-1">
                      <DiscordRichText content={field.value || ""} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            </div>
            {embed.image?.url && (
              <div data-preview-region="widget-image" className="overflow-hidden rounded-lg border border-white/10 bg-[#1E1F22]">
                <img
                  src={embed.image.url}
                  alt="Widget featured vehicle angle"
                  referrerPolicy="no-referrer"
                  className="aspect-video w-full object-cover"
                />
              </div>
            )}

            {embed.footer?.text && (
              <p data-preview-region="widget-footer" className="text-[11px] text-[#949BA4]">
                {embed.footer.text}
                {embed.timestamp ? ` • ${formatLocalDateTime(embed.timestamp)}` : ""}
              </p>
            )}
          </div>
        )}

        {Array.isArray(payload.components) &&
          payload.components[0]?.components?.length > 0 && (
            <div data-preview-region="widget-links" className="mt-2.5 flex flex-wrap gap-2">
              {payload.components[0].components.map((btn: any, idx: number) => (
                <DiscordButtonChip key={idx} btn={btn} />
              ))}
            </div>
          )}
      </div>
    </div>
  );
}
