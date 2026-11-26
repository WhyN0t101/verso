# Plan: one environment per medium

Status: proposal, not built.

## The idea

Today Verso is one lit study with one wall of bookcases. The proposal: keep that room as **Books**, and add three more, each with its own room, shelf style, spines and data source:

| Medium | Room | Shelf and item | Source of titles |
| --- | --- | --- | --- |
| Books | The current lamplit study: oak, armchair, oil lamp, painting | Bookcase, cloth and leather spines | Open Library (done) |
| Comics | A comic shop at night: painted metal racks, halftone wall, neon sign | Racks of thin tall issues in bags and boards, long-box ends | Open Library for collected editions; Comic Vine as an optional keyed source |
| Anime | A Japanese room: shoji glow, tatami rug, paper lantern, figure shelf | Tankobon manga volumes and series boxes, shorter and brighter spines | AniList (GraphQL, no key) |
| Movies | A home cinema: dark walls, LED backlight, red velvet, projector | Blu-ray and DVD cases, black spines with a coloured title band | TMDB (free key, optional secret) |

A person switches medium from the top bar. Each medium keeps its own shelf, filters, jump list and settings, all in the same browser storage.

## Decisions

Settled with the owner:

1. **Separate walls, one per medium.** A comic spine next to a Blu-ray in one bookcase looks wrong, and each room needs its own scene. An "All media" list view can come later.
2. **TMDB is accepted for movies.** The owner registers a free TMDB account when phase 6 starts and adds the key as the Worker secret `TMDB_API_KEY` (same pattern as `GOOGLE_BOOKS_API_KEY`). The key is never in the browser. Until it is set, the movie form works by hand. The app shows TMDB's required credit line once the source is live.

Still proposed:

3. **Same three states with labels per medium** (Reading / Watching). Stored values stay `wishlist`, `reading`, `finished`, so old data and backups keep working.

## Rules that stay true (from CLAUDE.md)

- The storage key stays `verso.v1`. Every new field is optional and read through `sanitizeBook`, so old data and old backups import unchanged.
- The cover proxy must never become a general proxy. Each new source gets its own route with a fixed host and a strict id pattern (AniList image CDN, TMDB image CDN, Comic Vine image host). Nothing takes a URL from the request.
- Worker code uses only web APIs.
- `npm run typecheck` and `npm test` stay green, one commit per logical change.

## Design

### Data

- `Book` gets `kind?: 'book' | 'comic' | 'anime' | 'movie'`. Absent means `book`.
- `sanitizeBook` defaults a missing or unknown kind to `book`. Backups carry the field; a backup from before this change imports as all books.
- The id of an external item is kept as `source?: {name: 'openlibrary' | 'anilist' | 'tmdb' | 'comicvine'; id: string}` so a title can be refreshed later. Optional, never required.
- `Settings` gets `environment?: Kind` (the medium last open). Appearance settings (wood, light, background, room props) become per medium, stored as `settings.looks?: Partial<Record<Kind, Look>>`. A missing look means that medium's default.

### Environment definition (one file per medium)

A plain object in `src/environments/<kind>.ts`, no code branches in the scene:

```
{
  kind, label, statusLabels,
  look: {wood, light, background},            // defaults for the room
  item: {sizes, aspect, spineStyle},          // geometry ranges and which spine drawer to use
  shelf: {rowHeight, rows, width, finish},    // bookcase, rack, shoji cabinet, media wall
  props: [{model, height, place}],            // room models, lazy loaded
  decor: [{model, height}],                   // shelf objects
  source: 'openlibrary' | 'anilist' | 'tmdb',
}
```

`createShelf` and `createRoom` take an environment instead of reading constants. Books is the first environment and must render exactly as it does now; that is the regression check for the refactor.

### Scene

- **Geometry:** item sizes come from the environment (comic: 0.06 thick, 2.6 tall; manga: 0.2 thick; Blu-ray: 0.14 thick, 1.9 tall). The wall layout code (`wall.ts`) already works on widths, so it needs the row height and case width as inputs, not constants.
- **Spines:** `textures/draw.ts` gets one drawer per style: cloth/leather (exists), comic (bag, board and a coloured edge), manga (white spine with a volume number band), disc case (black spine, title band, studio mark). Contrast rules stay: every drawer picks ink by the same 4.5:1 check.
- **Room:** each environment lists its own CC0 models and textures. Models are loaded on demand when that room is shown, so the first visit to a medium pays for it and the others cost nothing.
- **Budget:** keep each room under about 1.5 MB of models and textures and the same draw-call ceiling as today. Check with `?books=500` equivalents per medium.

### Data sources (Worker)

- `GET /api/search?kind=anime&q=...` and `?kind=anime&work=<id>`, one handler per source behind the same cache wrapper. The response shape (`SearchResult`, `WorkDetail`) stays the same so the form needs little change.
- `GET /api/cover?src=anilist&id=<digits>` style routes, each with its own fixed host.
- Genres: `shared/genres.ts` gets a list and a mapping per medium (anime genres, film genres, comic genres).
- Rate limits and attribution: TMDB requires its credit line and logo in the app; AniList asks for fair use. Add a short "Data from" line in the add dialog and the README.

### UI

- Medium switch in the top bar (tabs on wide screens, a menu on phones), with counts.
- Status labels, search placeholder, empty state and add-dialog wording come from the environment.
- Export card: a theme per medium (poster-style for movies, volume cover for anime) after the base cards work.
- List view is shared and shows the medium's own wording.

## Phases

Each phase ends with typecheck, tests and a browser check, and is one or more commits.

1. **Foundations (no visible change).** Add `kind` and `source` to `Book`, migration and backup tests, per-medium settings, and the `Environment` type. Books becomes `environments/book.ts`. The app must look identical.
2. **Scene takes an environment.** Move constants in `shelf.ts`, `room.ts`, `wall.ts` and `draw.ts` behind the definition. Add a test that the Books environment lays out the same wall as before.
3. **Switcher and storage.** Top-bar medium switch, per-medium shelves, filters and looks. Empty media show their own empty state.
4. **Anime.** Smallest data work (no key). AniList source, manga spine drawer, Japanese room. Proves the whole path end to end.
5. **Comics.** Open Library for collected editions first; Comic Vine only if a key is wanted. Comic spine drawer, comic shop room.
6. **Movies.** TMDB source with the optional secret, disc-case spine drawer, home cinema room, attribution.
7. **Polish.** Export card themes, README and credits for new assets, mobile pass, performance pass.

Phases 1 to 3 are the risky part, because they touch the central scene code. Phases 4 to 6 are mostly new files.

## Risks

- **Scene refactor regressions.** Mitigation: Books must match today's output; keep the layout tests and add one for the environment path.
- **Source terms.** TMDB, AniList and Comic Vine each have usage and attribution rules. Read them before shipping and record the result in the README.
- **Asset licences.** Use CC0 only (Poly Haven, Kenney), and extend the `CREDITS.md` files as models are added.
- **Weight.** Models per room load on demand; measure each room before merging.
- **Wrong cover shapes.** Posters and manga covers have different aspect ratios from books. The item geometry already takes the cover aspect, but ranges must be set per medium.
- **Scope.** One wall per medium multiplies test and design work by four. Doing anime first and shipping it before starting the others keeps that in check.

## Open questions

1. Should "All media" exist as a combined list from the start, or only after the four walls work?
2. Are comics and anime separate for good, or is manga a comic in one room? The plan treats manga as anime/manga, one room, because the same people collect both.
3. Should the brand stay "Verso" for all four, or does the home screen need a collection name?
