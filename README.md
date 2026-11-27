# Verso

A 3D bookshelf for your reading life. Books stand on a Three.js shelf, search dims what does not match, a click pulls a book out to show its details, and a styled card can be exported for Instagram.

## Features

- A wall of procedural 3D bookcases (4 rows each, new cases appear to the right) with hover, click, search and status dimming, pull-out animation, horizontal panning (drag, wheel, swipe with snap on touch), position dots, and a flat list view (also the fallback without WebGL). Search and filters move the camera to the first match. Optional "Group by genre" gives each genre its own labelled bookcase.
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

For UI work with hot reload, run `npm run dev`: it starts Vite and the Worker together, and Vite proxies `/api` to the Worker. If the Worker is not running the app says so. Open Library alone gives a complete add-a-book flow. Without `GOOGLE_BOOKS_API_KEY` the Google Books summary fallback is skipped.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server and `wrangler dev` together (Vite proxies `/api`) |
| `npm run dev:vite` | Vite alone |
| `npm run worker` | `wrangler dev`: the Worker plus `dist/` assets |
| `npm run build` | Typecheck, then production build to `dist/` |
| `npm run deploy` | `wrangler deploy` |
| `npm test` | Unit tests (Vitest) |

## Deploy (Cloudflare Workers with static assets)

`wrangler.jsonc` names the Worker `verso`, serves `dist/` as static assets (free, no Worker invocation) and runs the Worker only for `/api/*`. Add the optional Google key as a secret: `npx wrangler secret put GOOGLE_BOOKS_API_KEY` (or Settings, Variables and Secrets in the dashboard). No code change is needed when the key is added later.

## API

- `GET /api/search?q=<text>` returns candidate books (title, author, year, mapped genre, cover path).
- `GET /api/search?work=<OL id>` returns `{summary, genre, source}`. Title and author for the Google Books fallback come from Open Library's own record, never from the request.
- `GET /api/covers?title=<text>&author=<text>` returns `{choices}`: candidate edition covers, best match first, each with an own-origin `cover` path.
- `GET /api/cover?id=<numeric Open Library cover id>&size=S|M|L` streams the image from our origin.

Responses go through the Workers Cache API and carry `Cache-Control` headers. Subjects are mapped to a fixed list in `shared/genres.ts`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow and [AGENTS.md](AGENTS.md) for the rules every change follows, including those for coding agents. A plan for more media (comics, anime, movies) is in [docs/plan-media-environments.md](docs/plan-media-environments.md).

## Structure

```
shared/         genre list and mapping, used by the Worker and the app
src/worker.ts   Cloudflare Worker: /api/search, /api/covers and /api/cover; everything else goes to the static assets
src/api.ts      browser client for the Worker's API
src/covers.ts   cover loading (own-origin proxy, request sharing, two lanes) and dominant colour
src/toneQueue.ts  background queue that fills in the colour of covers that have none
src/state.ts    the one shared state object, and persisting it
src/search.ts   the search and status filter
src/data/       book model, storage, settings, backup/import, bulk delete
src/scene/      Three.js wall: wall.ts (pure layout and camera targeting), shelf.ts, room.ts (floor, lamps, props), assets.ts (glTF loader)
src/textures/   canvas drawing for spines and generated covers
src/export/     export card drawing
src/ui/         panel, add/edit form, export dialog, style dialog, jump list, select mode, list view
src/dev/        generated test shelf (dev only)
public/         favicon, CC0 photo textures and glTF models (CREDITS.md in each folder)
tests/          Vitest unit tests; tests/helpers/fakeDom.ts is a minimal stand-in for the DOM
docs/           design notes and plans
```

## Notes

- Fonts (Literata for titles and notes, Atkinson Hyperlegible Next for small interface text) are bundled with `@fontsource`; the app waits for them before drawing any canvas.
- Textures are created lazily: spines for rows near the camera, the cover face on first selection. Textures of deleted or edited books are disposed on rebuild.
