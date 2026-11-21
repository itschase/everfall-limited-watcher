# Changelog

## 2026-11-21 — Structured public pages and reliable editing

- Added independent homepage eyebrow visibility, intentional blank text, Lucide/no-icon selection, and restrained appearance presets. Hiding the hero or badge retains all saved content.
- Added display-only Scheduled Store Check controls: automatic cadence, custom label/minutes, and visibility. Monitoring intervals and verification rules remain unchanged.
- Extended Home, Features, and About with structured paragraph/CTA sections, safe destinations, icons, visibility, ordering, duplication, removal, and per-section reset. Existing feature cards can now be removed down to an empty list without silently restoring defaults.
- Added blur/debounced autosave, retryable failures, manual save/cancel fallback, prominent save-state feedback, unload protection, and reconciliation that preserves edits across page tabs and requests.
- Added atomic D1 JSON-path page saves to preserve unrelated page/template settings during concurrent edits and skip unchanged saves.
- Replaced width-limited previews with iframe viewports rendering the shared public components at Desktop 1280px, Tablet 768px, and Mobile 375px. Removed preview-only hero sizing so breakpoint and typography behavior follows the public renderer.
- Collapsed feature-card forms into individual editing panels, added card-level restore controls, and preserved the required legal sections.
