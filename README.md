# Everfall Limited Watcher

A Discord bot that monitors the Everfall Community **Limited Cars** store, checks for new limited‑edition listings every 15 minutes (or on demand), and posts rich embeds with images, buttons, pagination, and role mentions to a configurable channel.

## Features
- Automatic checks every 15 minutes via Cloudflare Workers cron.
- Manual `/check` slash command to trigger an immediate scrape.
- Configurable target channel and role mentions (`/setup`, `/add‑role`, `/remove‑role`).
- Rich embeds with:
  - Title, description, thumbnail & image.
  - Custom fields (price, stock, time left, etc.).
  - Buttons (View on Store, Buy Now, Refresh).
  - Select menu for recent listings.
  - Pagination and image carousel.
  - Timestamp footer and color‑coding for status.
- Simple `/help` command for usage.

## Repository Layout
```
Everfall-Limited-Watcher/
├─ .github/
│  └─ workflows/
│     └─ deploy.yml          # GitHub Actions CI/CD
├─ src/
│  ├─ index.ts               # Workers entry point (interactions & cron)
│  ├─ commands.ts            # Slash‑command registration & handlers
│  ├─ scraper.ts             # Store page fetch & parse logic
│  ├─ discord.ts             # Discord REST helper (send embeds, replies)
│  └─ kv.ts                  # KV wrapper for guild config & listings
├─ .gitignore
├─ package.json
├─ tsconfig.json
├─ wrangler.toml
└─ README.md                # (this file)
```