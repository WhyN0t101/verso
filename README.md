# Verso

A 3D bookshelf for your reading life. Books stand on a Three.js shelf, search dims what does not match, a click pulls a book out to show its details, and a styled card can be exported for Instagram.

## Features

- Procedural 3D shelf with hover, click, search dimming, pull-out animation, vertical panning, and a flat list view (also the fallback without WebGL).
- Add dialog with search-as-you-type on Open Library; summary from the works endpoint, falling back to Google Books. Every field stays editable.
- Real covers through an own-origin proxy, so the export canvas is never tainted. Spine colour comes from the cover's dominant colour; a generated cover is the fallback.
- Notes and a 1 to 5 star rating per book.
- Export card in 4:5, 9:16 and 1:1. Uses the Web Share API where the browser can share files, otherwise downloads a PNG.
- Presets for wood finish, lighting and background (gradients or an uploaded image).
- JSON backup and restore. Everything else lives in `localStorage` (`verso.v1`).

## Setup

```sh
npm install
cp .dev.vars.example .dev.vars   # optional: add GOOGLE_BOOKS_API_KEY
npm run build
npm run worker                   # Worker + built assets on http://localhost:8787
```

For UI work with hot reload, run `npm run worker` in one terminal and `npm run dev` in another; Vite proxies `/api` to the Worker. Open Library alone gives a complete add-a-book flow. Without `GOOGLE_BOOKS_API_KEY` the Google Books summary fallback is skipped.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server (proxies `/api` to `wrangler dev`) |
| `npm run worker` | `wrangler dev`: the Worker plus `dist/` assets |
| `npm run build` | Typecheck, then production build to `dist/` |
| `npm run deploy` | `wrangler deploy` |
| `npm test` | Unit tests (Vitest) |

## Deploy (Cloudflare Workers with static assets)

`wrangler.jsonc` names the Worker `verso`, serves `dist/` as static assets (free, no Worker invocation) and runs the Worker only for `/api/*`. Add the optional Google key as a secret: `npx wrangler secret put GOOGLE_BOOKS_API_KEY` (or Settings, Variables and Secrets in the dashboard). No code change is needed when the key is added later.

## API

- `GET /api/search?q=<text>` returns candidate books (title, author, year, mapped genre, cover path).
- `GET /api/search?work=<OL id>&title=&author=` returns `{summary, genre, source}`.
- `GET /api/cover?id=<numeric Open Library cover id>&size=S|M|L` streams the image from our origin.

Responses go through the Workers Cache API and carry `Cache-Control` headers. Subjects are mapped to a fixed list in `shared/genres.ts`.

## Structure

```
shared/         genre list and mapping, used by the Worker and the app
src/worker.ts   Cloudflare Worker: /api/search and /api/cover
src/data/       book model, storage, settings, backup/import
src/scene/      Three.js shelf: build, camera, picking, animation, lazy textures
src/textures/   canvas drawing for spines and generated covers
src/export/     export card drawing
src/ui/         panel, add/edit form, export dialog, style dialog, list view
prototype/      the original single-file prototype, kept for reference
tests/          Vitest unit tests
```

## Notes

- Fonts (Inter, Playfair Display) are bundled with `@fontsource`; the app waits for them before drawing any canvas.
- Textures are created lazily: spines for rows near the camera, the cover face on first selection. Textures of deleted or edited books are disposed on rebuild.
