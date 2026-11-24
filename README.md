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
cp .env.example .env.local   # optional: add GOOGLE_BOOKS_API_KEY
npm run dev
```

`npm run dev` also serves `api/*.ts` (see `vite.config.mts`), so search and covers work locally. Without `GOOGLE_BOOKS_API_KEY` the Google fallback runs unauthenticated and is quickly rate limited; Open Library still works on its own.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with the API |
| `npm run build` | Typecheck, then production build to `dist/` |
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` | `tsc --noEmit` |

## Deploy

Built for Vercel: the static build comes from Vite, and `api/search.ts` and `api/cover.ts` become serverless functions. Set `GOOGLE_BOOKS_API_KEY` in the project's environment variables. The key is only ever read in `api/search.ts`.

## API

- `GET /api/search?q=<text>` returns candidate books (title, author, year, mapped genre, cover path).
- `GET /api/search?work=<OL id>&title=&author=` returns `{summary, genre, source}`.
- `GET /api/cover?id=<Open Library cover id>&size=S|M|L` streams the image from our origin.

Both are cached in memory per instance and with `Cache-Control` for the CDN. Subjects are mapped to a fixed list in `shared/genres.ts`.

## Structure

```
api/            serverless functions (search, cover) and helpers in _lib/
shared/         code used by both api/ and src/ (genre list and mapping)
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
