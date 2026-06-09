# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev:all        # Start backend + Vite frontend concurrently (development)
npm run dev:server     # Backend only with hot-reload (nodemon)
npm run dev            # Vite frontend only
npm run build          # Build frontend + generate build metadata
npm start              # Production: serve built frontend + backend
npm test               # Run subscription parsing tests (test.js)
npm run check          # Node syntax check + dev build validation
```

## Architecture

**XELA Monitor** — VPN subscription management dashboard. Tracks subscription URLs, traffic usage, expiry dates, customer accounts, and billing.

### Data Layer (`database.js`)

Dual-mode abstraction with identical CRUD interface:

- `JsonDataStore` — local JSON files in `data/` (dev, no `DATABASE_URL`)
- `PostgresDataStore` — Neon PostgreSQL (production, when `DATABASE_URL` is set)

Collections: `subscriptions`, `users`, `bills`, `customUrls`

### Backend (`server.js`)

Single-file Express-style HTTP server (~69KB) handling:

- REST API for all four collections
- Subscription URL parsing — detects client type from User-Agent (Shadowrocket, Clash, Stash, Surge, Quantumult X) and returns appropriately formatted responses
- Session-based admin auth (cookie)
- Cron-based auto-refresh of subscription data
- Static file serving from `dist/`

### Frontend (`src/main.jsx`)

Monolithic React 19 component (~78KB) using Ant Design. All UI logic lives in this single file — dashboard, URL pool, user management, billing, custom URLs, dark mode.

`src/api.js` wraps HTTP calls; `src/utils.js` has formatting/date helpers.

### Deployment

- **Local**: HTTP server on port 3000, JSON storage
- **Vercel**: `api/[...path].js` routes all API calls to serverless functions, PostgreSQL via `DATABASE_URL`

See `.env.example` for required environment variables.

## UI Design Rules

- **All UI components must use Ant Design (antd).** Do not write custom components with raw HTML + CSS + JS.
- Visual customization must be done via Ant Design's theming system: `ConfigProvider` token overrides, `theme.useToken()`, or component-level `styles`/`className` props targeting antd's CSS variables.
- Never introduce a new UI element that bypasses antd — if antd lacks a suitable component, compose one from existing antd primitives.

