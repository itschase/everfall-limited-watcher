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

## Required Environment Variables & Secrets

Public `[vars]` are configured in `wrangler.toml`. Sensitive values must only be set in Cloudflare Dashboard secrets or your local environment:

- `DISCORD_CLIENT_SECRET` — Discord OAuth2 client secret (also signs `everfall_session` cookies).
- `DISCORD_BOT_TOKEN` — Discord Bot token for fetching guilds, channels, roles, and posting alerts.
- `CRON_SECRET` — Optional Bearer secret for invoking `POST /cron` or `/register-commands` externally.
- `PRESENCE_SYNC_SECRET` — Shared secret for the optional persistent Rich Presence service; configure it as both a Worker secret and a Node-host environment variable.
- `DISCORD_STATUS_WEBHOOK_URL` — Optional incoming webhook URL for one status-card channel only. It is not per-server and bot profile activity does not need it.
- `PUBLIC_ORIGIN` — Public Worker origin (`https://everfall-limited-watcher.itschase.workers.dev` in production).
- `DISCORD_CLIENT_ID` / `DISCORD_APPLICATION_ID`, `DISCORD_PUBLIC_KEY` — Application identity and interaction-signature verification.
- `DISCORD_PRIMARY_ADMINISTRATOR` — Discord user ID allowed to use master administration.

Configure Discord's OAuth redirect as `<PUBLIC_ORIGIN>/auth/callback` and its interactions endpoint as `<PUBLIC_ORIGIN>/interactions`. Bot Control provides readiness and command-registration tools. Provision `DB` (D1) and `MEDIA_BUCKET` (R2) for production; staging must use separate resources and secrets.

## Optional Discord Rich Presence service

Discord bot presence requires a persistent Gateway connection and cannot run inside a stateless Cloudflare Worker invocation. Deploy one always-on Node.js 22+ service using the included `Dockerfile.presence`. It reuses the existing `DISCORD_BOT_TOKEN` (do not reset it) and the same random `PRESENCE_SYNC_SECRET` configured as a Worker secret. The service defaults to the production `/api/internal/bot/presence` endpoint; set `PUBLIC_ORIGIN` for staging or a custom domain, or set `PRESENCE_SYNC_URL` to override the endpoint directly.

Build the image with `docker build -f Dockerfile.presence -t everfall-presence .`. On the host, create a private env file containing `DISCORD_BOT_TOKEN` and `PRESENCE_SYNC_SECRET`, then run `docker run -d --restart unless-stopped --name everfall-presence --env-file <private-env-file> everfall-presence`. Keep the service to one instance per bot token and inspect startup/sync errors with `docker logs everfall-presence`. These variables must be present in the Node service environment; setting them only as Worker secrets does not start the Gateway process. No webhook URL is needed for profile activity, and activity updates do not post messages.

The Bot Status page stores activity settings in D1. Activity name/state can use live listing and check-time variables. Discord only allows bot profiles to set activity name, type, state, and a streaming URL; the optional webhook card provides editable details, relative timestamps, and a custom HTTPS link button in one configured channel. It is disabled by default, is not required for profile activity, and posts only after an explicit dashboard publish action; after creation, the service edits the same message as data changes.

Production structured and temporary state uses D1, and media uploads are stored in R2. Workers KV remains bound for backward-compatible structured-data fallbacks/imports and reads of previously archived image blobs; new OAuth state/handoffs, user guild caches, widget confirmations, test-alert cooldowns, and media uploads do not write to KV.

## Staging & Production Deployment Branches

Production uses connected **Cloudflare Workers Builds**, which installs from the committed lockfile, builds `dist/client`, and deploys using `wrangler.toml`.

GitHub Actions separately verifies pushes and pull requests with TypeScript, tests, frontend build, and Worker dry run. Pushing `staging` also runs its staging deployment job. The production Actions deployment job runs only on **manual workflow dispatch** from `master` or `main`, separately from connected Cloudflare Builds. Actions deployments require `CF_API_TOKEN` and `ACCOUNT_ID` secrets.

Real store monitoring uses [the scheduled Scrapling workflow](.github/workflows/store-monitor.yml), currently targeting checks approximately every seven minutes and posting authenticated results to `POST /cron`. Its `CRON_SECRET` must match the Worker secret. Native Worker cron triggers are disabled because direct storefront requests can be challenged. The workflow and shared configuration control real cadence; homepage display controls do not.

## UI Foundation & License Attribution

The web interface adapts UI primitives and dashboard patterns from [`satnaing/shadcn-admin`](https://github.com/satnaing/shadcn-admin) (MIT License) with Tailwind CSS v4, Radix UI, TanStack Router, TanStack Query, and Lucide React icons.
## Pages editor and server customizations

The Pages editor now autosaves structured content per page, with isolated D1 JSON updates, retry/manual save controls, section/card management, independent hero/badge visibility, and real responsive preview viewports. Scheduled Store Check controls change only the public display.

Server managers can configure listing pins, widget pins/sticky placement, and active-listing events from a per-server Customizations tab. Settings saves never send messages or create events; enabled automation runs during successful authoritative monitoring. Event covers use the existing R2 archives and a bundled WebP decoder. The Cloudflare entrypoint is `src/worker.ts`; `src/index.ts` remains the shared request/scheduled implementation used by the Node server.

Run `npm test` for the storage/presentation/Discord regression suite and `npm run check:worker` after the production build to verify the Worker/Wasm deployment bundle. See [implementation and validation notes](docs/validation/implementation.md) for the KV audit, observed browser checks, and remaining deployed acceptance tests.

See [CHANGELOG.md](CHANGELOG.md) for detailed changes. Automated Discord tests use mocked REST responses; real guild permissions, event/pin/sticky behavior, and the full browser zoom matrix still require deployed acceptance testing.
