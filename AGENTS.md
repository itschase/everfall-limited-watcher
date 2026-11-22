# Everfall Limited Watcher — Architecture & Engineering Standards

## 1. Frontend Architecture (shadcn-admin Foundation)
- The web UI lives under `src/web/` and uses **React 19**, **TypeScript**, **Vite**, **Tailwind CSS v4**, **shadcn/ui (Radix UI)**, **TanStack Router**, **TanStack Query**, and **Lucide React**, styled after `satnaing/shadcn-admin` (MIT) dark mode.
- Always reuse shared primitives in `src/web/components/ui/`, layout shells (`PublicLayout`, `AppShell`), and `VehicleCard` rather than writing standalone HTML template strings in Worker TypeScript files.
- Keep `dark` neutral Zinc theme tokens (`#09090B`, `#121215`, `#18181B`, `#27272A`, `#FAFAFA`) consistent across every route, reserving color strictly for semantic badges and operational status indicators (no blue action buttons).
- Always display the full product title **"Everfall Limited Watcher"** consistently across headers, sidebars, breadcrumbs, footer, and legal pages, and keep Terms/Privacy links strictly in the footer (not the main nav/sidebar bars).
- Avoid decorative emojis in headers, buttons, and status badges; use Lucide SVG icons consistently and keep status indicator dots strictly for live operational/stock state (`Active`, `In Stock`, `Sold Out`, `Online`, `Refreshing`).

## 2. Dual-Runtime Compatibility (Cloudflare Workers + AI Studio Node Server)
- Core Worker modules (`src/index.ts`, `src/api.ts`, `src/admin.ts`, `src/commands.ts`, `src/scraper.ts`, `src/kv.ts`, `src/discord.ts`, `src/register.ts`) must **never** import `node:*`, `vite`, or access `process`.
- `src/server.ts` provides the Node.js HTTP + in-memory KV + Vite/static `ASSETS` wrapper so the exact same codebase runs in AI Studio on `0.0.0.0:3000` and deploys to Cloudflare Workers via `wrangler.toml`.

## 3. Data Integrity, Security & Isolation
- Never overwrite or remove preserved historical listings (such as `7815813` and `7815819`); non-authoritative store responses must preserve verified history.
- Server configuration saves (`/dashboard`, `/setup`, `select_channel`) must never automatically broadcast Discord messages.
- Test notifications (`Test Environment`) are strictly restricted server-side to guilds marked `environment === "test"` and must never mention Discord roles by default.

## 4. Mandatory Legal & Privacy Impact Review (Issue #18)
Whenever modifying Discord OAuth scopes, collected user/server data, cookies, logging retention, third-party services, or deletion behavior, **review and update `/privacy-policy` (`src/web/features/legal/PrivacyPage.tsx`) and `/terms-of-service` (`src/web/features/legal/TermsPage.tsx`)** in the same change so published policies always match actual code behavior.

## 5. Repository and Website Changelogs
- Record engineering details in `CHANGELOG.md` outside the website release markers. For each user-visible update, also add a unique, plain-language release inside `website-releases:start` / `website-releases:end`; those entries are automatically published to signed-in members with deployment.
- Follow the documented version/date/title and section format, describe user benefits, and omit internal tools, providers, credentials, and infrastructure details from website copy.
- Run `npm run changelog:generate` and commit `src/shared/publishedReleaseNotes.json` with the source changelog. Never edit the generated catalog directly. Preserve existing releases and remember that website editor overrides, including withdrawn versions, take precedence for the same version.
