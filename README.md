# Everfall Limited Watcher

A Cloudflare Workers + React (`shadcn-admin` dark UI) web platform and Discord bot that monitors the Everfall Community **Limited Cars** store, tracks verified listing history (`In Stock` / `Sold Out`), archives vehicle gallery images, and delivers structured Discord Components v2 alerts with optional role mentions.

[Open Everfall Limited Watcher](https://everfall-limited-watcher.itschase.workers.dev/)

The purpose is to keep limited vehicle releases visible in one preserved archive and in the Discord servers that follow them. Blocked or inconclusive store responses preserve verified history rather than confirming sell-outs. This is an independent community utility, not an official Everfall or Tebex service.

## Usage

### Visitors

Browse the homepage, inspect vehicle details and galleries, and sign in with Discord to access the complete history list. A direct `/history/{packageId}` link opens the expanded vehicle listing; its close/back control returns to the archive. Widget links point to the live store while active and the permanent history record after sell-out.

### Server managers

1. Select **Add to Discord**, then sign in using an account with **Manage Server** or Administrator permission for the server.
2. Open **Dashboard**, expand your server, and use **Channel & Roles** to select the notification channel and optional mention roles. Saving settings does not publish messages.
3. Use **Widgets** to preview and explicitly deploy a live status widget. Existing deployments support refresh, template changes, moving, and removal.
4. Use **Customizations** to opt into listing pins, widget pins, sticky placement, and active-listing Discord events. Preferences take effect during successful authoritative monitoring, rather than sending messages or creating events when saved.

The destination channel needs **View Channel**, **Send Messages**, and **Embed Links**. Widget inspection/sticky mode also needs **Read Message History**; pinning needs the applicable **Pin Messages** permission, and events need relevant **Create Events / Manage Events** permissions. Thread destinations require corresponding thread permissions. Permission and synchronization errors appear in the dashboard.

Sticky mode checks during monitoring with a 15-minute movement cooldown; it is not an instant Gateway listener. Events reuse one tracked event while listings remain active, with independent sold-out cleanup. New listing pinning, widget pinning, sticky mode, and event creation default to disabled.

| Discord command | Purpose |
| --- | --- |
| `/setup <#channel>` | Configure the notification channel. |
| `/widget` | Privately preview and confirm widget deployment. |
| `/add-role <@role>` | Add an alert mention role. |
| `/remove-role <@role>` | Remove an alert mention role. |
| `/check` | Request a store check, subject to monitoring safeguards. |
| `/help` | Show server configuration and interactive controls. |

Configuration commands enforce server-management permissions. Test notifications are restricted to servers explicitly designated as test environments and do not mention roles by default.

### Administrators

Signed-in members can open **Changelog** from dashboard navigation or their account menu to read versioned, member-friendly release notes. Administrators can use **Admin → Release Notes** to add a version, edit its introduction and Highlights/New additions/Improvements/Fixes, preview the member view, and save it as a draft or publish it. Unpublished drafts are visible only to administrators; updating one version preserves the others. Keep the public wording focused on member benefits rather than internal tools or hosting details.

The configured master administrator can manage the bot, servers, monitoring, deliveries, embeds, vehicle metadata, images, and public content. **Admin → Pages** edits Home, Features, About, Privacy Policy, and Terms of Service through structured controls rather than arbitrary HTML.

Pages supports independent hero/badge visibility, intentional blank badge text, visual Lucide/no-icon selection, cards, button destinations, section ordering/duplication/removal/reset, and layout presets. Additional paragraph/CTA sections appear after built-in content. Required legal content stays protected. Desktop/Tablet/Mobile previews render shared public components at 1280/768/375px.

Edits autosave after a short debounce and on text-field blur, with Unsaved/Saving/Saved/failed feedback. Manual Save, retry, and Discard Unsaved remain available, and each page saves independently. The **Scheduled Store Check** setting changes only the public indicator; it does not change actual monitoring cadence or verification logic.

### Simulate a listing event

In **Admin → Testing**, mark the intended server **Test**, then use **Listing Event Simulator**:

1. Select the Test server, a maximum of **1, 2, or 3 vehicles**, and an event lifetime of **1–60 minutes**.
2. Select **Generate Event Preview** to review the cover and simplified vehicle-name description. Current listings are preferred; archived vehicles are used as clearly labeled samples when necessary.
3. Optionally enable **Repeat archived samples to fill all slots** to exercise a three-column composite even with fewer than three distinct archived vehicles.
4. Select **Deploy Test Event** and confirm the target and lifetime. This creates a real, clearly labeled Discord event in the selected Test server.
5. Use **Open Discord Event**, **Reload Status**, or **End Test Event Now** as needed. Discord's scheduled end time ends it automatically after the selected lifetime, independently of store monitoring.

Events need Create/Manage Events permissions; an alert channel is not required. Only one tracked test event can be active per server. Test events never change real availability, sent-alert history, automatic event tracking, role mentions, or server customization settings. Production servers are blocked by the API, and interrupted deployment retries reuse tracked state to reduce duplicates.

## Repository Structure

```text
Everfall-Limited-Watcher/
├─ .github/workflows/deploy.yml   # CI verification + staging & master/main deploy
├─ index.html                     # Vite SPA root document
├─ vite.config.ts                 # Vite + React + Tailwind CSS v4 build -> dist/client
├─ wrangler.toml                  # Cloudflare Workers production + [env.staging] config
├─ AGENTS.md                      # Permanent UI, dual-runtime & privacy policy standards
├─ src/
│  ├─ worker.ts                   # Cloudflare entrypoint + bundled WebP Wasm initialization
│  ├─ index.ts                    # Shared fetch and scheduled handlers
│  ├─ server.ts                   # Node.js preview/runtime wrapper (Vite + local D1)
│  ├─ localD1.ts                  # Side-effect-free Node SQLite adapter for preview/tests
│  ├─ serverAutomation.ts         # Optional listing pins, sticky widgets, and tracked events
│  ├─ eventImage.ts                # Server-side listing event cover composites
│  ├─ api.ts                      # Typed JSON REST APIs (/api/*)
│  ├─ admin.ts                    # Discord OAuth2, HMAC sessions & legacy handlers
│  ├─ commands.ts                 # Ed25519 Discord slash commands & interactions
│  ├─ scraper.ts                  # Tebex Limited Cars scraper, archiver & dispatcher
│  ├─ discord.ts                  # Discord REST fetch with HTTP 429 retry handling
│  ├─ kv.ts                       # D1 storage helpers and legacy KV imports
│  └─ web/                        # React + shadcn/ui + TanStack Router/Query UI
│     ├─ components/              # ui/, layout/ (PublicLayout, AppShell), VehicleCard
│     ├─ features/                # homepage/, history/, dashboard/, legal/, admin/
│     ├─ lib/                     # api.ts & utils.ts
│     ├─ router.tsx               # Public, Legal, User & Admin routes
│     └─ main.tsx                 # React entrypoint
```

## Development & Build Commands

Use **Node.js 24 or newer** because the local adapter uses `node:sqlite`. Run `npm ci`, then `npm run dev`, and open `http://localhost:3000`. Set environment variables before launching; `.env` is ignored by Git but is not automatically loaded by the Node server. Public preview pages work without Discord credentials; authenticated features require a configured Discord application.

- `npm run dev` — Starts the Node preview server on `http://0.0.0.0:3000` with Vite middleware, local SQLite D1, and in-memory compatibility bindings.
- `npm run lint` — Runs `tsc --noEmit` across the frontend and Worker backend.
- `npm test` — Runs storage, presentation, authorization, image, and mocked Discord regression tests.
- `npm run build` — Builds the Vite SPA into `dist/client/` and verifies TypeScript compilation.
- `npm run check:worker` — Dry-runs Worker/Wasm bundling after the frontend build.
- `npm start` — Starts the Node server; set `NODE_ENV=production` to serve the compiled frontend.

Both `package-lock.json` and `bun.lock` must be updated when dependencies change. GitHub Actions uses `npm ci`; Bun-based Cloudflare builds use `bun install --frozen-lockfile`. A stale Bun lockfile fails deployment even when npm installation succeeds.

Use the Bun version recorded in `.bun-version` (the version used to reproduce the reported Cloudflare build). Keep `tsx` in runtime `dependencies`, since `start` and release generation use it. After changing dependencies or moving a package between groups, regenerate with `bun install` and `npm install --package-lock-only`, then run:

```sh
npm run check:lockfiles
npm ci
npm run lint
npm test
bun run build
npm run check:worker
```

`npm run lint` first checks root dependency versions and groups against both lockfiles, including Bun's JSONC syntax. `check:lockfiles` also checks Bun's frozen dependency resolution without rewriting its lockfile and dry-runs npm's clean install. CI performs an actual clean Bun frozen install and build in a separate job, alongside the npm job. Both gate GitHub Actions deployment jobs. Connected Cloudflare Builds starts independently on a push; CI cannot retroactively stop that build, so commit both synchronized lockfiles before pushing.

## Required Environment Variables & Secrets

Public `[vars]` are configured in `wrangler.toml`. Sensitive values must only be set in Cloudflare Dashboard secrets or your local environment:

- `DISCORD_CLIENT_SECRET` — Discord OAuth2 client secret (also signs `everfall_session` cookies).
- `DISCORD_BOT_TOKEN` — Discord Bot token for fetching guilds, channels, roles, and posting alerts.
- `CRON_SECRET` — Optional Bearer secret for invoking `POST /cron` or `/register-commands` externally.
- `DISCORD_STATUS_WEBHOOK_URL` — Optional Cloudflare Worker secret for one status-card channel. It is not per-server and bot profile activity does not need it.
- `PUBLIC_ORIGIN` — Public Worker origin (`https://everfall-limited-watcher.itschase.workers.dev` in production).
- `DISCORD_CLIENT_ID` / `DISCORD_APPLICATION_ID`, `DISCORD_PUBLIC_KEY` — Application identity and interaction-signature verification.
- `DISCORD_PRIMARY_ADMINISTRATOR` — Discord user ID allowed to use master administration.

Configure Discord's OAuth redirect as `<PUBLIC_ORIGIN>/auth/callback` and its interactions endpoint as `<PUBLIC_ORIGIN>/interactions`. Bot Control provides readiness and command-registration tools. Provision `DB` (D1) and `MEDIA_BUCKET` (R2) for production; staging must use separate resources and secrets.

## Discord Rich Presence

The Bot Status page stores activity settings in D1. When enabled, a Cloudflare Durable Object keeps the bot's Discord Gateway connection and refreshes the activity automatically; no external Node service or `PRESENCE_SYNC_SECRET` is needed. The Worker uses the existing `DISCORD_BOT_TOKEN` secret. Durable Object session and connection status are stored in its SQLite-backed storage.

Activity name/state can use live listing and check-time variables. Discord only allows bot profiles to set activity name, type, state, and a streaming URL; the optional webhook card provides editable details, relative timestamps, and a custom HTTPS link button in one configured channel. It is disabled by default, is not required for profile activity, and publishes only after an explicit dashboard action; after creation, the Gateway edits that same message as data changes. Activity updates do not post messages.

Production structured and temporary state uses D1, and media uploads are stored in R2. Workers KV remains bound for backward-compatible structured-data fallbacks/imports and reads of previously archived image blobs; new OAuth state/handoffs, user guild caches, widget confirmations, test-alert cooldowns, and media uploads do not write to KV.

## Staging & Production Deployment Branches

Production uses connected **Cloudflare Workers Builds**, which installs from the committed lockfile, builds `dist/client`, and deploys using `wrangler.toml`.

GitHub Actions separately verifies pushes and pull requests with TypeScript, tests, frontend build, and Worker dry run. Pushing `staging` also runs its staging deployment job. The production Actions deployment job runs only on **manual workflow dispatch** from `master` or `main`, separately from connected Cloudflare Builds. Actions deployments require `CF_API_TOKEN` and `ACCOUNT_ID` secrets.

Production store monitoring is triggered by the externally managed job, currently configured for approximately every 15 minutes. **Change `STORE_MONITOR_INTERVAL_MINUTES` in `src/shared/appConfig.ts` to update the service's cadence in one place.** API responses, website copy, Discord help/template variables, presence previews and cadence-dependent local checks derive from it. The Pages editor shows this interval read-only; legacy homepage-only overrides no longer take precedence. Previously saved built-in Features workflow copy is refreshed to the shared interval without rewriting unrelated delivery estimates or custom text.

Changing source code does not reschedule an external service: keep the external job's trigger and authentication aligned separately. The [legacy Scrapling workflow](.github/workflows/store-monitor.yml) has its own GitHub schedule declaration; its activation was not verified and this change does not modify it. Do not run a second automatic monitoring job unintentionally. The native Worker minute trigger only wakes Rich Presence; it does not run storefront verification.

## UI Foundation & License Attribution

The web interface adapts UI primitives and dashboard patterns from [`satnaing/shadcn-admin`](https://github.com/satnaing/shadcn-admin) (MIT License) with Tailwind CSS v4, Radix UI, TanStack Router, TanStack Query, and Lucide React icons.
## Pages editor and server customizations

The Pages editor now autosaves structured content per page, with isolated D1 JSON updates, retry/manual save controls, section/card management, independent hero/badge visibility, and real responsive preview viewports. Scheduled Store Check controls change only the public display.

Server managers can configure listing pins, widget pins/sticky placement, and active-listing events from a per-server Customizations tab. Settings saves never send messages or create events; enabled automation runs during successful authoritative monitoring. Event covers use the existing R2 archives and a bundled WebP decoder. The Cloudflare entrypoint is `src/worker.ts`; `src/index.ts` remains the shared request/scheduled implementation used by the Node server.

Run `npm test` for the storage/presentation/Discord regression suite and `npm run check:worker` after the production build to verify the Worker/Wasm deployment bundle. See [implementation and validation notes](docs/validation/implementation.md) for the KV audit, observed browser checks, and remaining deployed acceptance tests.

See [CHANGELOG.md](CHANGELOG.md) for detailed changes. Automated Discord tests use mocked REST responses; real guild permissions, event/pin/sticky behavior, and the full browser zoom matrix still require deployed acceptance testing.

## Automatically published member release notes

The website `/changelog` is available to signed-in members. Releases inside the `website-releases:start` / `website-releases:end` markers in `CHANGELOG.md` are bundled automatically with each application deployment. Engineering entries outside those markers are never included. Write plain-language benefits without internal tools or infrastructure details.

Add a unique release using `## version | YYYY-MM-DD | Title`, followed by a summary and any of `### Highlights`, `### New additions`, `### Improvements`, or `### Fixes`. Each section uses single-line `- ` entries. At least one entry is required. Keep existing versions when adding a release.

Run `npm run changelog:generate` and commit `CHANGELOG.md` together with `src/shared/publishedReleaseNotes.json`. Builds and local startup regenerate the catalog; `npm run lint` rejects stale generated copy. Invalid dates, duplicate versions, unsupported formatting, and oversized content fail validation. A successful production deployment makes new versions available through the existing authenticated Changelog API; no publish request or additional secret is required.

The website release editor remains available for drafts and wording corrections. A saved website version overrides the repository copy of that same version, including when unpublished. Use a new version for a new update; editing the repository cannot republish a version deliberately withdrawn in the website editor. The member Changelog refreshes every minute while open, on focus/reconnect, and through **Refresh Changelog**. The editor warns before leaving unsaved work; simultaneous creation of an existing version returns a conflict rather than replacing it.

## Sidebar navigation

## User-facing language

Public page copy uses player- and server-owner-facing terminology. Exact legacy default phrases in saved Home, Features, and About configurations are refreshed during normalization; custom wording and legal pages are not rewritten. This introduces no migration writes. Vehicle HTTP diagnostics are expandable, and available prices are labeled as recorded store prices rather than checkout quotes.

## Member listing prices

Store monitors record an explicit amount and currency from structured package data when available. Signed-in members see prices on in-stock cards, including the homepage. Sold-out cards omit pricing; archived detail views show the last recorded listing price to signed-in members. Missing prices are not estimated, and old archive entries without recorded pricing remain blank until a verified price is collected.

Pricing uses a separate authenticated `/api/listing-prices` response with private/no-store caching and session-scoped client queries. Anonymous listing/detail responses and shared homepage caches exclude structured prices. Omitted store prices do not erase previously recorded prices. No additional OAuth scopes or personal information are required.

## Workspace appearance and page search

Use **Customize view** in the application header to choose Compact/Comfortable spacing and Focused/Wide content. These are browser-memory preferences, retained across in-app navigation and reset on reload. They do not change account data, server configuration, cookies, or published content. The shared summary and form patterns keep mobile controls readable while reducing unnecessary card height.

Use **Find a page** or **Ctrl/Command K** for local page/tool search. Arrow keys select a result, Enter opens it, and Escape closes the search. Administrative destinations are only listed for administrators; normal route and API authorization still apply. Search text is not sent to a search service.

The Pages icon picker offers 204 allowed SVG icons and No icon, with categories, name/purpose search, explicit defaults, and keyboard browsing. Existing saved icon keys remain valid. Additional sections can choose Standard/Wide content, Small/Medium/Large icons, and Outline/Primary buttons. Options are normalized on save and rendered by the same components in preview and publication. Previews start collapsed on phones; Show/Hide Preview does not discard edits.

Bot-wide synchronization and bulk widget refresh require a review step describing their scope. Other existing explicit operations, permission checks, pending guards, and test-server restrictions remain in force. Page editors warn before leaving unsaved work, and failed initial content loads block editing rather than exposing publishable fallback defaults.

## Sidebar navigation

The sidebar logo/title opens the homepage on desktop and mobile. Administrator tools are organized into expandable Discord & Servers, Listings & Media, Website & Content, and Monitoring & Testing groups, with Overview directly accessible. Visiting a page reveals its active group. Group and desktop width choices are retained during in-app navigation, reset on a full reload, and are not written to cookies or browser storage. The compact desktop sidebar opens group menus; the mobile drawer keeps its title above a separately scrolling navigation list. Transitions respect reduced-motion preferences.

## Automation checks, recovery, and saved previews

Server managers can use **Check Permissions** in Customizations to inspect relevant Discord channel/event access without sending messages. Newly enabled settings are checked when saved. Deploy a widget before checking its channel. Permissions may change afterward; checks are readiness information rather than a delivery guarantee.

Automation status shows the last attempt, last fully successful attempt, and earliest sticky cooldown eligibility. A widget moves only when successful monitoring finds newer messages. Each failed event/widget has its own retry action using the verified catalog; retries do not send listing alerts, scrape the store, or rerun unrelated operations. Concurrent monitoring/recovery may require waiting briefly. A deleted widget may still require redeployment.

Test deployment uses the exact preview, bound to its server and settings for ten minutes. Expired previews or changed settings require regeneration. Preview data is temporary; expired records are cleaned during later generation. Reload Status checks Discord for externally ended/deleted events. Covers use a bounded fifteen-minute memory cache invalidated by archived image changes.

Archive search waits 350 ms after typing. Its query, stock filter, and page are saved in the URL for sharing, reload, and return from vehicle details. Interface routes load on demand so administrative screens stay out of the initial public-page download.
