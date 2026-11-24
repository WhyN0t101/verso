# Verso

3D bookshelf web app. Books live in the browser (`localStorage`, key `verso.v1`); there are no accounts.

## Stack

Vite, TypeScript, three.js, Vitest. Deployed as a Cloudflare Worker with static assets.

## Layout

```
shared/         genre list and mapping (used by Worker and app)
src/worker.ts   Worker: /api/search, /api/cover; everything else goes to ASSETS
src/api.ts      browser client for /api/search
src/data/       book model, storage, settings, backup/import
src/scene/      three.js shelf
src/textures/   canvas drawing for spines and generated covers
src/export/     share card drawing
src/ui/         panel, form, export dialog, style dialog, list view
tests/          Vitest unit tests
prototype/      legacy single-file prototype, reference only
```

## Run

```sh
npm install
npm run build        # typecheck + vite build to dist/
npm run worker       # wrangler dev on :8787 (Worker + dist/)
npm run dev          # Vite with HMR; proxies /api to :8787, so run `npm run worker` too
npm test             # vitest run
npm run typecheck
```

## Deploy

Pushes to `main` deploy automatically (Cloudflare build). `npm run deploy` runs `wrangler deploy` manually. Config is in `wrangler.jsonc`; `dist/` is served as assets and the Worker only runs for `/api/*`.

## Rules

- Worker code uses the Workers runtime only: `fetch` and web APIs, no Node APIs or Node-only packages.
- The cover proxy accepts numeric Open Library ids only. Never turn it into a general proxy.
- Never commit secrets: `.dev.vars` and `.env*` stay untracked (`.dev.vars.example` is the template).
- `GOOGLE_BOOKS_API_KEY` is optional and currently unset. Do not change its setup; the Open Library flow must work without it.
- Never break the existing storage key `verso.v1`. A format change needs a migration that reads old data (see `src/data/storage.ts`, `sanitizeBook`) and old backups must still import.
- Keep `npm run typecheck` and `npm test` green. One commit per logical change, message `TYPE: summary`.
