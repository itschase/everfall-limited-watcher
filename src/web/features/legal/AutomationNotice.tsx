export function AutomationNotice({ kind }: { kind: "privacy" | "terms" }) {
  return (
    <section className="mx-auto max-w-4xl px-4 pb-8 sm:px-6">
      <h2 className="text-base font-semibold">
        Optional Discord customizations
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {kind === "privacy"
          ? "When enabled by a server manager, we store per-server pinning, sticky widget, and scheduled event preferences, tracked Discord message/event IDs, synchronization status, and temporary replacement-message data in Cloudflare D1. Sticky mode checks recent channel message IDs and types to determine widget position; it does not archive member message content. Event cover images are generated from public listing images already archived in R2. These features do not request additional Discord OAuth scopes."
          : "Server managers may enable automatic listing pins, widget pins, sticky widgets, and listing events. These features require the relevant Discord channel and event permissions. Sticky widgets may be replaced during successful monitoring with a cooldown; events reflect verified availability and may be delayed when monitoring or Discord is unavailable. Turning off event creation prevents new events; the separate sold-out cleanup setting controls whether an existing event is ended automatically. Disabling pinning removes pins applied by this service from tracked widgets."}
      </p>
    </section>
  );
}
