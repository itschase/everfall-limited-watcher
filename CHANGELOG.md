# Changelog

## 2026-11-22 — Manual vehicle price metadata and inline stock pricing

- Added administrator-only pricing controls in Vehicle Metadata for entering/correcting an amount and currency, hiding a price, or reverting to the recorded store price. Manual values persist independently of store refreshes and support archived vehicles with previously missing prices.
- Overlay manual values in the existing authenticated private/no-store price response using a batched override read. Public listing metadata and anonymous responses never expose manual price fields. Price-only changes do not dispatch Discord messages.
- Place available and sold-out prices beside the stock label on homepage/archive cards and expanded details. This intentionally extends the earlier in-stock-card-only display rule; sign-in remains required. Existing presentation-guide edits are preserved separately.
- Extend price tests for manual precedence, clear/reset behavior, validation, member API output and administrator write authorization.

## 2026-11-22 — Operator presentation guides

- Added Live Widget and Vehicle Cards tabs to server management, with shared-renderer previews, accessible selectable annotations, and a responsive store-to-delivery diagram.
- Kept operator formatting read-only, resolved the server’s configured widget preset automatically, and retained explicit deployment, refresh, move, and removal actions. Changing the destination resets deployment confirmation.
- Removed the eight-record dashboard preview cap so widget summaries and ordering use the complete catalog, matching deployment input. Preserved existing server-side authorization, channel permission checks, mention suppression, and configuration-save isolation.
- No OAuth scopes, collected data categories, cookies, retention, third-party services, or deletion behavior changed; existing legal disclosures remain applicable.


## 2026-11-22 — Clearer player and server-owner language

- Applied the approved copy review to homepage, Features, About, vehicle cards/history, sign-in, server settings and Changelog descriptions. Replaced infrastructure language with familiar benefits, removed unsupported immediacy/permanence/setup-time guarantees, and described the homepage as recent listings rather than the entire archive.
- Refresh exact legacy default phrases during normalization of saved public page content so existing defaults receive the improvements without overwriting independently written text, changing layout settings, or modifying legal content. The refresh is idempotent and requires no database migration writes.
- Label current pricing as Recorded store price, retain Last listed price for archived records, and move HTTP diagnostics behind Technical Details. Preserve pricing authorization, availability logic, and existing controls.
- Added regression coverage for saved default updates, custom wording and legal text preservation, layout retention, idempotence, and non-mutation of incoming configuration.

## 2026-11-22 — Expanded vehicle close control

- Anchor the expanded listing close button to the header's top-right corner instead of a wrapping flex row. Reserve horizontal space for its 40px target on mobile and desktop, and allow long listing content to wrap without overlapping the control.
- Preserve the existing accessible label, keyboard behavior, and return-to-history handler.

## 2026-11-22 — Authenticated listing prices

- Capture explicit structured store amounts/currencies in both monitors and validate them on ingestion. Preserve the last verified price when stock is archived or a response omits pricing; never infer a currency or invent a price.
- Serve prices through a separate authenticated, private/no-store endpoint. Public listing payloads and shared homepage caches contain no structured pricing. A session-scoped, deduplicated client query displays prices only for signed-in members.
- Show prices on cards only while in stock; archived detail views retain a clearly labeled last-listed price. Unavailable pricing is omitted. Added validation, archive preservation, authentication, and cache-header coverage.

## 2026-11-21 — Cohesive dashboard layouts and website appearance

- Introduced shared responsive summary metrics and replaced oversized summaries on Administrator Overview, Bot Control, Status Widgets, and Server Manager. Four metrics use a mobile two-column layout; three-metric groups adapt without narrow unreadable cards. Moved overview shortcuts into a disclosure so delivery activity is closer to the top.
- Shortened operational descriptions and grouped secondary actions in keyboard-accessible menus while retaining their pending guards and handlers. Added explicit review dialogs for bot-wide synchronization and refreshing all widget messages, without changing the underlying operations.
- Reworked mobile Connected Servers rows around identity, channel names, environment, and widget state. IDs/copy actions remain available in expandable connection details, with a single clear log action. Prevented overlapping manual server refresh requests.
- Standardized card spacing, focus/invalid-input states, skip links, mobile text entry sizes, header hierarchy, and public section/footer rhythm. Added safe avatar/decorative-image failure fallbacks and readable route-not-found/loading-failure recovery.

## 2026-11-21 — Expanded icons, personal appearance, and editor safety

- Expanded the allowlisted site catalog to 204 Lucide icons plus No icon, preserving every existing saved key. Added category/purpose keyword search, match counts, explicit selection state, reset controls, and arrow/Home/End keyboard browsing. Icons remain explicit vector imports rather than arbitrary markup or the entire icon package.
- Added personal Compact/Comfortable spacing and Focused/Wide content controls. Choices persist only in browser memory across navigation and reset on reload; they do not alter server settings or published pages. Added local page/tool search with Ctrl/Command K, keyboard navigation, and administrator-only destinations filtered by the current session.
- Added validated section content widths, icon sizes, and primary/outline button styles to Pages, using the same renderer for preview and publication. Mobile previews start collapsed and can be shown/hidden without losing content.
- Protected Pages against navigation during unsaved/pending work and against editing fallback defaults after an initial load failure. Failed refreshes retain prior data, retry states have explicit recovery, and canceling edits clears stale mutation failures in Pages and Release Notes.
- Updated both policy pages to distinguish in-memory personal choices, local navigation search, and administrator-published appearance. Added regression checks for saved-icon compatibility, every catalog entry's SVG rendering, keyword/category search, and safe/idempotent section-option normalization.

## 2026-11-21 — Backfilled member release history

- Added member-facing releases for November 16–20, dated from the original repository commits. Grouped related changes by day and described their visible benefits rather than publishing internal implementation or deployment details.
- Added the previously undocumented November 21 Discord presence controls, profile/contact presentation, and login-popup fix. Preserved all existing release versions, dates, and content so website editor overrides remain effective.
- Regenerated the bundled release catalog from the marked source section. Historical dates describe when changes entered the repository; they do not assert a separately verified production deployment date.

## 2026-11-21 — Organized sidebar and dependable homepage navigation

- Unified mobile and desktop branding into one accessible homepage link, including the icon-only state. The mobile title previously contained no link. Removed the redundant bottom Public Homepage shortcut and kept branding outside the scrollable navigation area.
- Reorganized administrator tools into Discord & Servers, Listings & Media, Website & Content, and Monitoring & Testing disclosures, with Overview directly accessible. Active routes (including the legacy hero editor) open their group and highlight their link; manually selected groups and desktop collapse choices survive in-app navigation without cookies or browser storage.
- Added short grid-height/opacity disclosure transitions, rotating chevrons, restrained hover movement, focus indicators, and reduced-motion alternatives. Closed groups are inert and hidden from assistive technology; disclosure buttons expose expanded/control state.
- Collapsed desktop groups open keyboard-accessible menus with tooltips instead of flattening every administrator link into a long icon rail. Sidebar navigation scrolls independently within the viewport, and route changes reveal the active link without moving the main page.
- Kept the full product title, neutral Zinc presentation, shared navigation primitives, and existing administrator authorization boundaries.

## 2026-11-21 — Isolated recovery, permissions, and exact test previews

- Fixed widget failure isolation: a deleted or inaccessible widget no longer skips subsequent widgets in its server. Pin PUT 404 responses remain failures rather than setting a successful pin flag.
- Added per-operation failures, check/success timestamps, sticky eligibility, and manager-authorized event/widget recovery. Targeted retries share the monitoring lease, use the verified catalog, and never dispatch listing alerts or rerun unrelated operations. Removed-widget errors and pending moves are cleaned from tracking.
- Added read-only channel/event permission checks and save-time validation for newly enabled options, with channel-specific remediation. Configuration saves still never post Discord messages.
- Reconcile test-event status with Discord. Persist exact previews in bounded database chunks for ten minutes and require matching settings/server at the deploy API; expired previews are rejected and cleaned during later generation. Real-event tracking remains isolated.
- Added a bounded fifteen-minute in-memory cover cache keyed by composition, images, and archive ETags. Failed covers are not retained, image replacements invalidate prior covers, and metadata failures fall back to normal rendering.
- Updated both legal pages for permission checks, explicit recovery, operation status, and temporary preview retention.

## 2026-11-21 — Faster navigation, persistent archive views, and safer release editing

- Load route components on demand. The main JavaScript entry decreased from approximately 1.17 MB to 252 KB before compression; shared dependencies and page code remain separate loads.
- Debounce archive searches by 350 ms and preserve validated query, stock filter, and page in the URL through reload, detail navigation, and browser history.
- Protect release-note drafts/pending saves with a leave/stay dialog and browser unload protection. Conditional database inserts prevent concurrent release creation from overwriting a winning version.
- Refresh the member Changelog every minute while open, on focus/reconnect, and through a refresh action with a visible timestamp.
- Added regression coverage for failure isolation, scoped recovery, missing pins, external event completion, exact preview reuse/binding/expiry, cover invalidation, permission remediation/authorization, and concurrent creation. Local browser checks cover archive navigation, unsaved edit protection, and Changelog refresh without external Discord mutations.

## 2026-11-21 — Automatic website release publication

- Made the explicitly marked website section below the repository source for bundled member release notes. Production builds and local startup generate a validated JSON catalog, so a deployed release appears automatically without a separate administrative publish action or database migration.
- Kept internal engineering entries outside the published block. Enforced unique versions, valid dates, supported sections, and existing content limits; malformed public entries fail the build rather than being silently omitted or truncated.
- Added a freshness check to validation so repository copy and its generated catalog must be committed together. Existing website editor overrides and withdrawn drafts continue to take precedence for their version.
- Added regression checks for source isolation, duplicate versions, malformed entries, generated catalog freshness, and automatic availability through the member release loader.

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

## 2026-11-21 — Deployment installation and CI startup fixes

- Updated bun.lock alongside package-lock.json so Cloudflare Workers Builds can install the added Wrangler dependency with Bun's frozen-lockfile mode.
- Extracted the Node-only local SQLite adapter into src/localD1.ts. Tests import this side-effect-free adapter instead of initializing the preview server and opening a shared on-disk database, preventing parallel Linux test processes from racing on SQLite startup.
- Kept the preview server's existing database path explicit and preserved the same D1 adapter behavior. The application test suite, TypeScript validation, and production build pass after extraction.

## 2026-11-21 — Purpose and usage documentation

- Expanded the README with the application's purpose, visitor workflows, Discord setup and commands, manager customizations, admin Pages usage, Node setup, bindings/secrets, and verification commands.
- Documented both frozen lockfiles and distinguished connected Cloudflare Builds from manually dispatched production GitHub Actions deployment.
- Clarified actual monitoring cadence versus display-only settings and identified remaining deployed Discord/zoom acceptance work.

## 2026-11-21 — Quiet Components v2 sticky replacements

- Omit legacy content/embed fields when replacing Components v2 widgets so Discord accepts the component-only payload.
- Set Suppress Notifications on sticky replacements in addition to disabling mentions, reducing channel notification noise.
- Extend the sticky-send failure/recovery regression test to assert the Components v2 payload and notification flags.

## 2026-11-21 — Time-limited Discord event simulator

- Added a Listing Event Simulator to Admin Testing for marked Test servers, including servers without a notification channel. Production targets and non-administrator callers are rejected server-side.
- Added a selectable maximum of 1/2/3 vehicles, a 1–60 minute event lifetime, and generated cover previews using the same third-slot/fallback/center-crop composite renderer as real events.
- Use current vehicles first and archived vehicles as clearly labeled simulations. Optional repeated samples fill a three-column cover when the archive has fewer distinct vehicles.
- Require explicit preview and deploy actions, show the simplified vehicle-name event description and cover, and expose tracked status, Discord event links, and manual early ending. Discord's external-event end time handles automatic expiry independently of monitoring cadence.
- Keep test event IDs, expiry times and deployment request IDs in separate D1 records. Serialize operations, reuse deployment requests, recover interrupted creation/start attempts, and prevent overlapping active test events without changing live event tracking, listing stock, alert history, roles, or customization settings.
- Updated fixed privacy/terms disclosures for test-event state, documented usage, and added tests for production/auth restrictions, bounded input, 1/2/3 cover previews, lifetime fields, retry recovery, duplicate prevention, early ending, real-event isolation, and zero routine KV operations.

## 2026-11-21 — Multi-vehicle event preview resource fix

- Reproduced the failed two-vehicle request and identified a platform resource-limit response rather than a normal application validation error.
- Render full-resolution sources one at a time into the final canvas instead of retaining every decoded source. Repeated sample columns reuse already-painted pixels and avoid extra image reads/decodes.
- Replace per-pixel temporary array allocation and repeated coordinate math with precomputed columns and direct RGBA copying.
- Use native streaming PNG compression with standard PNG chunks/checksums instead of synchronous JavaScript deflate, preserving 960×540 output, center crops, transparency and third-slot image fallback.
- Added a high-resolution two/three-column regression covering native PNG decoding, pixel colors and repeated-source read avoidance. TypeScript, all 43 tests, the production build and Worker dry run pass.

## 2026-11-21 — Versioned member Changelog

- Added an authenticated Changelog page linked from dashboard navigation and the account menu. It presents readable, detailed release notes organized into Highlights, New additions, Improvements, and Fixes.
- Added an administrator Release Notes editor for adding versions, editing release dates, introductions and section entries, previewing the member layout, saving drafts, publishing updates and withdrawing a version from member view.
- Seeded an editable user-facing release focused on visible benefits and features, omitting implementation tools, providers and infrastructure details.
- Store versions independently, require login for member reads, enforce administrator-only editing, and exclude draft content from member API responses. Updates preserve other versions and introduce no KV operations.
- Added regression coverage for safe content/version/date validation, publication and draft isolation, independent updates, authentication, write authorization, duplicate-version handling and zero KV usage.

## 2026-11-21 — Discord presence, profiles, and login improvements

- Added configurable bot presence and synchronization after saving its settings (44ca3f4, 3f135f8, 7aca09c).
- Refined Discord profile cards and the account menu, and added the About contact card with a GitHub link (15d68f4 through 751d81c).
- Opened the Discord login popup synchronously from the login action to avoid browser popup blocking while retaining full-page fallback (eb2756e).

## 2026-11-20 — Public page editing and delivery recovery

- Added public Features/About pages and unified page editing, expanded widget and announcement controls, and added recovery from existing Discord messages (b2a1ce1).
- Consolidated monitoring configuration and changed widget synchronization to use catalog changes and shared snapshots (6f1f2f6). Subsequent storage work retained compatibility with historical records and media (f6d6a33).

## 2026-11-19 — Live widgets and server management

- Added interactive stock widgets and a preview/confirmation flow for explicit deployment (c7c808e, 98d7617).
- Expanded server management, widget controls, command registration diagnostics, and bot readiness checks (ea52021, ea3a783). Added public presentation data and page metadata (be1a97f).

## 2026-11-18 — Listing inspection and monitoring visibility

- Added catalog/status snapshots and monitoring attempt logs, with improved logout handling (f854ee2, ed80550).
- Refined homepage filters and listing metadata, added preview-to-inspect behavior and time-limited badges, and paginated administrative logs (46a58cd, e78973d). Added the interactive creator profile card (ab564a4).

## 2026-11-17 — Web dashboard and searchable history

- Introduced the shared React interface, operator dashboard, member history page, and dedicated administrative pages (24bd6a8).
- Improved stock verification and store-check feedback during the day's monitoring revisions. Avoid publishing historical timing values because the cadence changed again in later updates.

## 2026-11-16 — Initial listings, Discord setup, and preserved history

- Introduced Discord commands, listing announcements, galleries, and the public listing showcase (f58c8fd, 9f5440d, 21f9c17).
- Fixed Discord sign-in, separated operator and creator dashboards, and added server-specific announcement settings (560c419, 3308979, 502e8b4, 07f9a08).
- Preserved verified listing history on failed or unrecognized store responses rather than treating them as confirmed sell-outs (4f3c818).

## Website release notes

Only releases inside the markers below are automatically published to signed-in members with the application deployment. Keep this copy focused on user benefits; internal engineering notes belong above. Each version is unique and uses the heading format shown below. Website editor overrides (including withdrawn drafts) take precedence for the same version.

<!-- website-releases:start -->

## 2026.11.22.4 | 2026-11-22 | Add missing vehicle prices and see them beside stock status

Administrators can now add or correct prices for current and past vehicles from Vehicle Metadata, including releases whose prices were not recorded originally.

### New additions

- Vehicle Metadata includes amount and currency controls, with separate actions to save a manual price, hide pricing, or restore the recorded store value. Store checks do not replace manual corrections.

### Improvements

- Signed-in members see prices beside the stock label, such as Sold Out — $25.00, on homepage cards, archive cards, and expanded vehicle details. Signed-out visitors still see stock status without a price.

## 2026.11.22.3 | 2026-11-22 | Preview widgets and understand vehicle cards

Server managers can explore what members will see before deploying a live widget and follow how vehicle listings become cards and Discord updates.

### New additions

- A Live Widget tab shows the configured format with explanations, alongside channel deployment and existing widget controls.
- A Vehicle Cards tab highlights the parts of a card and explains the journey from store information to verified, consistently presented listings.

### Improvements

- Widget previews include the full catalog so summaries and vehicle ordering reflect the available listing data.
- Changing the destination channel clears deployment confirmation so you can review the new destination before posting.


## 2026.11.22.2 | 2026-11-22 | Clearer descriptions and more familiar language

The website now explains features and settings in language aimed at Everfall players, collectors, and Discord server owners.

### Improvements

- Homepage, Features, and About descriptions focus on vehicle alerts, galleries, listing history, and community updates. Wording more clearly reflects scheduled checks and recent listings.
- History labels, sign-in guidance, role notification settings, and save feedback are easier to understand. Recorded prices are clearly distinguished from historical listing prices.
- Technical listing diagnostics are available through an expandable details section, keeping the main vehicle information easier to scan.

### Fixes

- Existing page content that still uses the old default phrases receives the clearer wording. Individually written content, saved layouts, and legal text are preserved.

## 2026.11.22.1 | 2026-11-22 | Easier closing of expanded vehicle listings

Expanded vehicle listings now keep their close control in a predictable position, including on phones.

### Fixes

- The close button stays at the top-right of the listing header instead of wrapping beneath vehicle details. Titles and archive information have their own space so the control remains easy to reach.

## 2026.11.22 | 2026-11-22 | Listing prices for signed-in members

Signed-in members can see recorded store prices alongside available vehicles and retain that information when reviewing archived releases.

### New additions

- Available vehicle cards show the recorded price and currency when you are signed in, including on the homepage. Visitors who are signed out do not receive pricing information.

### Improvements

- Sold-out cards keep their compact appearance. Open the archived vehicle details while signed in to see its last listed price, when recorded. Prices are shown only when the store supplies an explicit amount and currency.

## 2026.11.21.5 | 2026-11-21 | A more compact workspace with more ways to make it yours

Everfall Limited Watcher now brings related information closer together, puts useful controls within easier reach, and offers more ways to shape page content. The refinements extend from server management and administrative tools to public pages, previews, and recovery screens.

### Highlights

- Dashboard summaries use less space on phones, with related counts arranged together. Administrator Overview brings recent deliveries closer to the top, while Bot Control and Status Widgets give their main action a clearer place.
- Choose from 204 icons with category filters, purpose-based search, keyboard browsing, and clear previews. Existing icon choices remain supported, and sections can still use no icon.

### New additions

- Customize your workspace with compact or comfortable spacing and focused or wide content. These choices affect your current browser view only and reset on reload.
- Find pages and tools from the header search button or Ctrl/Command K. Search results reflect the pages available to your account.
- Additional page sections now offer content-width, icon-size, and primary or outline button options, with the same appearance in preview and on the published page.

### Improvements

- Connected server rows emphasize names, channels, and useful status. Technical IDs and copy controls are available through expandable connection details, keeping the main list easier to scan.
- Secondary operations sit in consistent menus. Bot-wide synchronization and bulk widget refresh show what will happen before you continue.
- Public sections and footers have more consistent spacing and typography. Page editors can hide previews while working, and phone previews start collapsed to put editing controls closer to hand.

### Fixes

- Failed requests offer clearer retry paths, and existing information remains available during refresh failures. Page editing pauses if saved content cannot be loaded, protecting published pages from accidental replacement.
- Leaving Pages with unsaved work now offers a stay-or-leave choice. Canceling a failed edit clears stale failure feedback, and unavailable profile images use a clean fallback instead of a broken image.

## 2026.11.21.4 | 2026-11-21 | Smoother sign-in and clearer Discord profiles

Signing in and finding contact information is easier, with clearer Discord profile cards and more control over the bot's visible activity.

### New additions

- Administrators can configure the bot's Discord presence and activity from Bot Control. Saved settings are synchronized with its Discord status.
- The About page includes a creator contact card with profile details and a GitHub link for finding the project.

### Improvements

- Discord profile cards and the account menu have clearer names, profile details, and layouts that adapt to smaller screens.

### Fixes

- The Discord sign-in window opens directly when you select login, reducing popup-blocking problems. Full-page sign-in remains available when the browser blocks the window.

## 2026.11.21.3 | 2026-11-21 | A clearer sidebar with everything closer to hand

Finding the right page is easier with a more organized sidebar. The Everfall Limited Watcher logo and title now take you straight to the homepage on mobile and desktop, so the extra shortcut at the bottom is no longer needed.

### Highlights

- Administrator tools are grouped into Discord & Servers, Listings & Media, Website & Content, and Monitoring & Testing. Overview remains a direct link, and your current page automatically reveals its group.

### Improvements

- Groups expand smoothly, chevrons show their state, and the current page has a clearer highlight. Your open groups and sidebar width choices stay in place as you move between pages.
- The compact desktop sidebar offers labeled group menus, while mobile keeps the title within reach above a separately scrolling list. Keyboard focus and reduced-motion preferences are supported.

### Fixes

- The mobile sidebar title now works as a homepage link, matching desktop behavior. Long navigation lists no longer push the title out of reach.

## 2026.11.21.2 | 2026-11-21 | Easier recovery, dependable previews, and smoother browsing

This update makes server management easier to diagnose and recover, keeps test-event previews consistent with what gets deployed, and helps you return to the exact archive view you were browsing. Release-note editing also gains stronger protection for work in progress.

### Highlights

- A failed widget no longer holds up other widgets in the same server. Managers can retry an individual failed event or widget operation, with clearer explanations of what went wrong.
- Test events now deploy the exact vehicles and cover shown in their saved preview. Previews remain valid for ten minutes, and events ended directly in Discord are recognized when their status is reloaded.

### New additions

- Check Permissions explains missing access before enabling new automation. Server customization panels show the last check, last successful check, and when sticky widgets next become eligible to move.
- Archive searches, stock filters, and page numbers are included in the address, making filtered views shareable and preserving them through reloads and vehicle-detail navigation.

### Improvements

- Pages load their own interface code as needed, and archive search waits briefly for you to finish typing before requesting results. Repeated event-cover previews reuse unchanged images to avoid unnecessary work.
- The Changelog checks for new updates every minute while open and includes a manual refresh control with the last refresh time.
- Leaving the release editor with unsaved changes now offers a choice to stay and finish editing. Creating the same release version simultaneously cannot silently replace the first saved version.

### Fixes

- Missing messages can no longer be recorded as successfully pinned. Failed operations remain visible for diagnosis and recovery.
- Test previews reject changed settings and expired selections instead of silently generating a different cover during deployment. Updating an archived image also refreshes the cached cover.

## 2026.11.21.1 | 2026-11-21 | Release notes that arrive with each update

Keeping up with Everfall Limited Watcher is easier. Member release notes now travel with the update itself, bringing clear explanations of new features and everyday improvements to the Changelog when that update is deployed.

### Highlights

- Published updates can now include their member release notes automatically, helping keep the website Changelog in step with the application.

### Improvements

- Release notes continue to focus on changes you can see and use, with features, additions, improvements, and fixes grouped for easier reading.
- Administrators can still refine published wording or withdraw a version from member view using the existing release editor.

## 2026.11.21 | 2026-11-21 | More control, clearer previews, and easier server setup

This update makes Everfall Limited Watcher more comfortable to use on smaller screens and gives server owners more ways to keep their communities informed. It also brings a more flexible public site and a safer way to try listing events before using them with your community.

### Highlights

- The dashboard now adapts more naturally when space is limited. Navigation, action buttons, forms, and data rows are easier to reach on smaller displays, helping you manage your server without constantly moving sideways across a page.
- Listing events can bring the vehicles in a release together in one place, with a generated cover showing up to three vehicles. Server managers can choose whether to enable automatic events and whether those events should end when the vehicles are no longer available.

### New additions

- Server customizations now include options for pinning new listing messages, pinning the live widget, and keeping the widget closer to recent channel activity. Each server controls its own preferences.
- A dedicated event simulator lets administrators choose a test server, preview one-, two-, or three-vehicle covers, and create a clearly labeled test event for a chosen amount of time. Test events can also be ended early.
- This Changelog keeps members informed with versioned release notes explaining what has changed and how those changes affect everyday use.

### Improvements

- Public pages have more flexible sections, clearer visibility controls, editable icons, and previews for different screen sizes. Hiding a section keeps its saved content ready for later.
- The page editor saves changes automatically and shows whether work is waiting, saving, saved, or needs another attempt. Pages can be edited independently without replacing changes on another page.
- Sold-out widget items take you to the preserved vehicle record. Opening a direct history link shows the full listing immediately, and closing it returns to the archive.

### Fixes

- Improved the handling of high-resolution images when building multi-vehicle event covers, reducing unnecessary image work and keeping repeated test samples efficient.
- Updated labels and status explanations so it is easier to understand when widgets change and which settings affect only the information shown on the website.

## 2026.11.20 | 2026-11-20 | More flexible pages and announcement recovery

This update expands the information available on the public website and gives administrators more ways to manage pages, widgets, and existing announcements.

### New additions

- Dedicated Features and About pages explain what Everfall Limited Watcher does and how it helps communities follow limited vehicles.
- Administrators can manage public page content in one Pages editor and recover announcement tracking from existing Discord messages.

### Improvements

- Expanded announcement and widget controls make it easier to review presentation and manage existing deployments.
- Widget synchronization checks for changes in the verified catalog, reducing unnecessary updates when listing information has stayed the same.

## 2026.11.19 | 2026-11-19 | Live stock widgets for your Discord server

Keep current vehicle availability within reach in Discord with an interactive stock widget and clearer server management tools.

### Highlights

- Live stock widgets bring vehicle availability into a Discord channel and provide interactive controls for browsing listings.

### New additions

- Preview a widget and confirm its deployment before a message is posted to your server.
- Server management tools provide more control over widget deployments and clearer information about server configuration.

### Improvements

- Administrators can review bot readiness and command registration to help diagnose setup problems.
- Public pages include clearer page descriptions and link-preview information when shared.

## 2026.11.18 | 2026-11-18 | Easier vehicle browsing and clearer monitoring information

Finding and inspecting vehicles is more convenient, while administrators gain a clearer view of recent monitoring activity.

### New additions

- Vehicle previews open a closer inspection view, with expandable listing details and time-limited listing labels.
- A creator profile card makes profile information available from the public interface.

### Improvements

- Homepage filters and listing summaries make it easier to focus on vehicles that interest you.
- Monitoring and delivery logs use pages so administrators can review activity without scrolling through one long list.

### Fixes

- Improved logout handling so leaving a signed-in session behaves more consistently.

## 2026.11.17 | 2026-11-17 | A dedicated dashboard and vehicle archive

Everfall Limited Watcher gains a more complete web interface for browsing vehicle history and managing Discord server settings.

### Highlights

- Signed-in members can browse the vehicle history archive, search listings, and inspect vehicle galleries beyond the homepage showcase.
- Server managers have a dedicated dashboard for reviewing their servers and configuring notification channels and roles.

### Improvements

- A shared dark interface brings consistent navigation, cards, forms, and dialogs across public pages and the dashboard.
- Dedicated administrator pages bring server oversight, announcement presentation, monitoring activity, and test tools into one interface.

## 2026.11.16 | 2026-11-16 | Introducing Everfall Limited Watcher

Follow limited vehicle listings from the website and Discord, with vehicle galleries and a preserved record of previously verified listings.

### Highlights

- The homepage showcases limited vehicles with image galleries, while Discord announcements bring listing details into configured server channels.
- Verified listing history is preserved when a store check fails or returns an unrecognized page, avoiding false sell-out changes from an inconclusive response.

### New additions

- Discord sign-in connects server managers to settings for the servers they can manage, with creator administration kept separate.
- Server-specific announcement settings let communities choose how listing information is presented.

### Fixes

- Corrected a Discord sign-in redirect loop so authorized users can reach their dashboard.

<!-- website-releases:end -->
