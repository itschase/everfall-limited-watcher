# Implementation and validation — 2026-11-21

The changes preserve existing D1 records, archived listings, OAuth behavior, announcement templates, and Discord configuration. No production data migration or historical deletion is required. New server customizations default to disabled; sold-out cleanup defaults on but has no effect until an event has been created through the opt-in feature.

## Public content and editor

Home, Features, About, Privacy, and Terms keep their existing structured controls. Home now has independent hero/badge visibility, intentional blank badge text, Lucide/no-icon selection and badge styles. Home/Features/About support additional structured sections with paragraphs, icons, safe buttons, visibility, ordering, duplication, removal, alignment, spacing and surfaces. Additional sections appear after the built-in sections; built-in sections keep their existing ordering controls. Required legal sections and fixed customization disclosures remain visible.

Page autosave runs after one second of inactivity and on text-input blur. Manual Save and Discard Unsaved remain available, with save-state feedback above and below the form. Failed content is not retried continuously; manual retry or a subsequent change can retry it. Responses preserve newer drafts and edits on other tabs. D1 page writes update individual JSON paths atomically and unchanged pages do not increment the saved version. Desktop/Tablet/Mobile previews render the same public components inside 1280/768/375px iframe viewports, scaled to fit the editor.

The Scheduled Store Check setting affects only the public indicator and its preview. Automatic mode uses the configured interval; custom label/minutes and visibility do not change the actual GitHub workflow schedule, cron handling, store verification, or dispatch rules.

## Server customization operation

The Dashboard exposes Channel & Roles, Customizations, and Widgets tabs per managed server. Saving customization preferences does not send any messages or create events. Changes take effect during a successful authoritative monitoring cycle. Missing channel permissions continue to use the existing explicit save/deployment errors. Event and widget automation errors are also exposed in Customizations.

Optional listing pins are applied to newly delivered active listing alerts. Widget pin state is persisted to avoid repeating unchanged pin operations. Disabling widget pinning removes pins tracked as applied by the service.

Sticky mode checks recent messages only after a 15-minute movement cooldown. It ignores tracked widgets and pin-system messages, deletes the previous widget before creating a replacement, suppresses mentions, and updates the same registry record with the new message ID. A D1 pending replacement payload supports retry after a failed send. Discord nonce enforcement and recent-message recovery reduce duplicate sends after an ambiguous response. This is polling during monitoring, not an immediate Gateway listener. As with any Discord REST operation, a very late ambiguous response beyond Discord's nonce window can require manual inspection; do not treat mocked tests as proof of all network failure modes.

Event automation tracks one event ID, reuses it on updates, starts scheduled events, extends the end time periodically, and completes/cancels the event when no verified active listings remain and cleanup is enabled. A lost creation response is recovered by identifying the application's matching managed event before another creation attempt. Disabling event creation prevents new creation; the cleanup toggle independently controls sold-out cleanup. An existing active event is not immediately deleted just by saving settings.

Event covers use up to three active listings, prefer the third archived image (slot index 2), fall back to other slots, and compose 1/2/3 center-cropped columns. Covers are generated once per synchronization pass and reused across guilds. Missing/unsupported images omit the cover rather than stopping listing monitoring. PNG/JPEG/WebP are supported. Workers bundle the decoder Wasm via src/worker.ts; the Node server initializes it from disk. No new third-party image service is used.

Discord integration follows the official [message endpoints](https://docs.discord.com/developers/resources/message) and [scheduled event lifecycle](https://docs.discord.com/developers/resources/guild-scheduled-event). Real Discord permissions must be verified after deployment.

## KV audit

- New customization preferences, event IDs/hashes/errors, sticky cooldown metadata, replacement payloads, and serialization leases use D1.
- Composite generation reads existing R2 archives directly; it does not read legacy media KV. It does not write generated image blobs to KV or add an image-service dependency.
- CMS autosave uses D1 and skips unchanged saves. It does not trigger Discord widget refreshes.
- Existing one-time D1 import helpers still read legacy structured KV until their migration markers are set. Those imports preserve older installations and historical data.
- Existing /media/listings responses retain legacy KV image fallback for previously archived media that has not migrated to R2. Removing it would break old galleries.
- Existing no-D1 compatibility helpers retain their previous KV storage paths. Production and the Node preview both have D1; new Discord automation requires D1 and never falls back to KV.
- Widget normalization now preserves renderVersion, avoiding repeat synchronization work caused by losing that marker.
- Regression tests assert zero routine KV operations after structured-data migration and during unchanged page/event operations.

## Validation performed

- npm run lint — passed.
- npm test — 39 passed, 0 failed. Includes all 32 existing tests plus new normalization/security, atomic concurrent page saves, authorization, 1/2/3 composite/crop/slot fallback, real WebP decoding, mocked event lifecycle and sticky-send recovery coverage.
- npm run build — passed. Vite reports the existing large single-chunk warning; code splitting remains a separate optimization.
- Wrangler deployment dry run — passed with the bundled WebP Wasm module.
- Local Cloudflare Worker runtime — started successfully and returned HTTP 200 from /api/public/presentation.
- Local browser Pages editor — checked at 320, 375, 430, 768, 1024, 1280 and 1440 CSS widths, without page overflow or offscreen inputs/buttons in the measured state. Expanded and collapsed sidebar states were checked at 1440px.
- Operational pages — Bot Control, Widgets, Monitoring, Dispatch, Embeds, Metadata and Servers checked at 320, 768 and 1024px with local data. Found/fixed implicit grid overflow in Embed Manager and URL/status-row overflow in Bot Control, then rechecked them at 320px.
- Local browser — badge visibility autosaved, edited cadence label persisted with Saved state, and /history/7815813 opened the full listing and returned to /history through its back control. Existing active/sold-out widget URL tests still pass.
- Screenshot: pages-desktop.jpg. Uses a synthetic local test identity and local configuration; it is not a screenshot of production.

## Post-deployment acceptance still required

- Native browser zoom 100%, 125%, 150% across the complete width/sidebar matrix, including populated long log/deployment rows and open dialogs.
- Real managed-server permissions, listing pins, widget pin/unpin, sticky replacement tracking, and event create/update/sold-out end behavior in a designated test guild.
- Real event cover previews using the available active listings. Current production stock may not provide 1/2/3 simultaneous listings; deterministic local pixel/composite tests cover those cases.
- Network-error retry and cross-tab editing in the deployed CMS. Local tests exercise state persistence and concurrent API saves; they do not replace deployed browser acceptance.

No live Discord test messages or events were sent during implementation.

## Administrator event simulator follow-up

Admin Testing now includes explicit preview/deployment of time-limited test events to marked Test servers. Administrators choose a maximum of 1/2/3 vehicle slots and a lifetime of 1–60 minutes. The preview uses the real event compositor, favors active vehicles, and otherwise uses archived samples. Repeating archived samples is an explicit option for filling all three columns when there are fewer distinct records.

The Discord event contains a TEST title, a simple vehicle-name list, the generated image, and a scheduled end time. It starts immediately through the same external-event API flow and can be ended early. Discord handles automatic end timing; no new timer, cron cadence, or KV polling is introduced. A single status refresh is scheduled in the open simulator when its tracked lifetime expires.

Test tracking uses separate D1 records (`test-event:` / `test-event-lock:`), request IDs, and a per-server operation lease. Creating/ending tests does not modify the automatic event record, availability, sent-alert history, role configuration, or manager customization preferences. Production servers and non-master-administrator callers are rejected. New regression tests cover generated slot counts, optional repeats, bounds, authorization, expiry fields, failed-start retry, duplicate prevention, early ending, real-event isolation and zero routine KV operations. The combined suite now has 42 passing tests.

The final Discord creation, displayed cover, selected lifetime expiry, and permission behavior still require the user's explicit deployment in a designated Test server; no real event was created by implementation checks.
