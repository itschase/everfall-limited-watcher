# Everfall Limited Watcher

A Cloudflare Workers + React (`shadcn-admin` dark UI) web platform and Discord bot that monitors the Everfall Community **Limited Cars** store, tracks verified listing history (`In Stock` / `Sold Out`), archives vehicle gallery images, and delivers structured Discord Components v2 alerts with optional role mentions.

## Repository Structure

```text
Everfall-Limited-Watcher/
├─ .github/workflows/deploy.yml   # CI verification + staging & master/main deploy
├─ index.html                     # Vite SPA root document
├─ vite.config.ts                 # Vite + React + Tailwind CSS v4 build -> dist/client
├─ wrangler.toml                  # Cloudflare Workers production + [env.staging] config
├─ AGENTS.md                      # Permanent UI, dual-runtime & privacy policy standards
├─ src/
│  ├─ index.ts                    # Cloudflare Worker entrypoint (fetch & scheduled cron)
│  ├─ server.ts                   # Node.js preview/runtime wrapper (Vite + memory KV)
│  ├─ api.ts                      # Typed JSON REST APIs (/api/*)
│  ├─ admin.ts                    # Discord OAuth2, HMAC sessions & legacy handlers
│  ├─ commands.ts                 # Ed25519 Discord slash commands & interactions
│  ├─ scraper.ts                  # Tebex Limited Cars scraper, archiver & dispatcher
│  ├─ discord.ts                  # Discord REST fetch with HTTP 429 retry handling
│  ├─ kv.ts                       # KV storage helpers (configs, listings, embed, logs)
│  └─ web/                        # React + shadcn/ui + TanStack Router/Query UI
│     ├─ components/              # ui/, layout/ (PublicLayout, AppShell), VehicleCard
│     ├─ features/                # homepage/, history/, dashboard/, legal/, admin/
│     ├─ lib/                     # api.ts & utils.ts
│     ├─ router.tsx               # Public, Legal, User & Admin routes
│     └─ main.tsx                 # React entrypoint
```

## Development & Build Commands

- `npm run dev` — Starts the Node preview server on `http://0.0.0.0:3000` with Vite middleware and in-memory KV.
- `npm run lint` — Runs `tsc --noEmit` across the frontend and Worker backend.
- `npm run build` — Builds the Vite SPA into `dist/client/` and verifies TypeScript compilation.
- `npm start` — Serves the compiled `dist/client/` bundle and Worker backend via Node.

## Required Environment Variables & Secrets

Public `[vars]` are configured in `wrangler.toml`. Sensitive values must only be set in Cloudflare Dashboard secrets or your local environment:

- `DISCORD_CLIENT_SECRET` — Discord OAuth2 client secret (also signs `everfall_session` cookies).
- `DISCORD_BOT_TOKEN` — Discord Bot token for fetching guilds, channels, roles, and posting alerts.
- `CRON_SECRET` — Optional Bearer secret for invoking `POST /cron` or `/register-commands` externally.
- `PUBLIC_ORIGIN` — Public Worker origin (`https://everfall-limited-watcher.itschase.workers.dev` in production).

## Staging & Production Deployment Branches

1. **Staging (`staging` branch):** Pushing to `staging` runs `npm run lint` and `npm run build`, then deploys via `npx wrangler deploy --config wrangler.toml --env staging` to `everfall-limited-watcher-staging`.
2. **Production (`master` or `main` branch):** Merging into `master` or `main` runs all verification checks and deploys to production (`https://everfall-limited-watcher.itschase.workers.dev`).

## UI Foundation & License Attribution

The web interface adapts UI primitives and dashboard patterns from [`satnaing/shadcn-admin`](https://github.com/satnaing/shadcn-admin) (MIT License) with Tailwind CSS v4, Radix UI, TanStack Router, TanStack Query, and Lucide React icons.