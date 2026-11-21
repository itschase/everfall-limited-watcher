# Changelog

## 2026-11-21 — Structured public pages and reliable editing

- Added independent homepage eyebrow visibility, intentional blank text, Lucide/no-icon selection, and restrained appearance presets. Hiding the hero or badge retains all saved content.
- Added display-only Scheduled Store Check controls: automatic cadence, custom label/minutes, and visibility. Monitoring intervals and verification rules remain unchanged.
- Extended Home, Features, and About with structured paragraph/CTA sections, safe destinations, icons, visibility, ordering, duplication, removal, and per-section reset. Existing feature cards can now be removed down to an empty list without silently restoring defaults.
- Added blur/debounced autosave, retryable failures, manual save/cancel fallback, prominent save-state feedback, unload protection, and reconciliation that preserves edits across page tabs and requests.
- Added atomic D1 JSON-path page saves to preserve unrelated page/template settings during concurrent edits and skip unchanged saves.
- Replaced width-limited previews with iframe viewports rendering the shared public components at Desktop 1280px, Tablet 768px, and Mobile 375px. Removed preview-only hero sizing so breakpoint and typography behavior follows the public renderer.
- Collapsed feature-card forms into individual editing panels, added card-level restore controls, and preserved the required legal sections.

## 2026-11-21 — Server manager Discord customizations

- Added a per-server Customizations tab, independent of notification channel/role settings and widget deployment controls. Only server managers can save it, saves preserve existing settings, and saving never posts messages or creates events.
- Added opt-in pinning for new active listing alerts and live widgets. Widget pin state persists so unchanged monitoring runs do not repeat pin operations.
- Added sticky-widget placement checks during authoritative monitoring with a 15-minute cooldown, recent-message inspection, mention suppression, and one registry record per deployment. Replacement payloads persist temporarily in D1 so a failed send can be retried after deletion.
- Added tracked Discord event create/update/start/end behavior, recovery of a prior create response, independent sold-out cleanup, error feedback, and a D1 lease to serialize overlapping automation runs.
- Added reusable server-side 1/2/3-column PNG cover generation with central 50% crops, preferred third image slots, fallbacks, direct R2 archive reads, and one generated cover reused across servers in the same sync. WebP decoding uses a bundled Worker Wasm module and a Node-compatible initializer.
- Preserved widget render-version metadata in storage to stop unnecessary synchronization work. New automation state never writes to KV; existing D1 import markers continue to prevent repeat legacy reads.
- Synchronized the dependency lockfile, added a local Wrangler build check, made SQLite tests close file handles before Windows cleanup, and added regression coverage for authorization, concurrent saves, empty/hidden content, unsafe destinations, composite pixels, WebP decoding, event lifecycle, sticky recovery, and zero routine KV operations.
- Added tests and Worker bundling checks to deployment CI so a successful frontend build alone cannot publish broken server integration code.

## 2026-11-21 — Shared dashboard responsiveness and presentation

- Collapse the desktop sidebar automatically below 1280px, preserve manual control, and keep mobile drawer labels visible even when the desktop sidebar is collapsed.
- Use available main/card widths for responsive form grids and heading/action groups. Shared cards, selectors, tab panels, and implicit grid tracks now shrink safely instead of forcing horizontal page overflow.
- Keep Bot Control identity/status rows compact and wrapping, and allow long copyable endpoint URLs to remain accessible at 320px.
- Stack shared tables into labeled row cards below 40rem of available width while retaining row controls, copy actions and pagination. Sortable header controls remain visible and table roles remain explicit.
- Keep compact 16–20px card spacing, Zinc colors, Plus Jakarta Sans and Lucide icons. Clarify change-only Status Widget synchronization separately from optional sticky placement.
- Record implementation behavior, remaining necessary legacy KV usage, local validation evidence, and the post-deployment Discord/zoom acceptance checklist in docs/validation/implementation.md.
