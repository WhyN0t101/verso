# Verso: rules for contributors and agents

3D bookshelf web app. Books live in the browser (`localStorage`, key `verso.v1`); there are no accounts. This file is the single source of project rules. Humans read it with [CONTRIBUTING.md](CONTRIBUTING.md). `CLAUDE.md` imports it, so every agent sees the same text.

## Stack

Vite, TypeScript (strict), three.js, Vitest. Deployed as a Cloudflare Worker with static assets.

## Layout

```
shared/         genre list and mapping (used by Worker and app)
src/worker.ts   Worker: /api/search, /api/covers, /api/cover; everything else goes to ASSETS
src/api.ts      browser client for /api/search
src/data/       book model, storage, settings, backup/import
src/scene/      three.js wall: shelf.ts wires loop, camera, picking, wood, wallBuild, bookTextures, bookMotion, entry, faces, plate, wall, room, assets, tint
src/textures/   canvas drawing for spines and generated covers
src/export/     share card drawing
src/ui/         panel, form, export dialog, style dialog, list view
public/         favicon, CC0 photo textures and optimised glTF models (CREDITS.md in each folder)
tests/          Vitest unit tests
docs/           design notes and plans
```

## Run

```sh
npm install
npm run build        # typecheck + vite build to dist/
npm run worker       # wrangler dev on :8787 (Worker + dist/), the Worker alone
npm run dev          # Vite (HMR) and wrangler dev together; Vite proxies /api to :8787
npm run dev:vite     # Vite alone; the app then says the Worker is not running when it calls /api
npm test             # vitest run
npm run typecheck
# dev only: open http://localhost:5173/?books=150 for a generated shelf (src/dev/seedBooks.ts);
# in dev, window.__verso.stats() reports draw calls, triangles and textures;
# window.__verso.idle() is true once the frame loop sleeps, window.__verso.frames(n) steps it by hand.
```

In a git worktree, link the main folder's `node_modules` (a directory junction on Windows) instead of running `npm install`; the dependencies are the same until `package.json` changes, and each copy costs about 360 MB.

## Deploy

Pushes to `main` deploy automatically (Cloudflare build). `npm run deploy` runs `wrangler deploy` manually. Config is in `wrangler.jsonc`; `dist/` is served as assets and the Worker only runs for `/api/*`. Because a push to `main` ships, nobody pushes to `main` without being asked, and work goes through a pull request.

## Hard rules

These are never traded away for speed.

- Worker code uses the Workers runtime only: `fetch` and web APIs, no Node APIs or Node-only packages.
- The cover proxy accepts numeric Open Library ids only. Never turn it into a general proxy. Any new image source gets its own route with a fixed host and a strict id pattern; nothing takes a URL from the request.
- Never commit secrets: `.dev.vars` and `.env*` stay untracked (`.dev.vars.example` is the template).
- `GOOGLE_BOOKS_API_KEY` is optional and currently unset. Do not change its setup; the Open Library flow must work without it. Any future key (for example `TMDB_API_KEY`) follows the same pattern: an optional Worker secret, and the app still works without it.
- Never break the existing storage key `verso.v1`. A format change needs a migration that reads old data (see `src/data/storage.ts`, `sanitizeBook`), new fields are optional, and old backups must still import. Add a test with the old shape.
- Everything that arrives from outside (localStorage, a backup file, a request, an API reply) is untrusted. Validate it at that boundary, once, and do not use it in CSS, HTML or URLs without a strict pattern. (An imported background image once reached `url("…")` unchecked; `sanitizeSettings` now allows plain base64 only.)
- Keep `npm run typecheck`, `npm test` and `npm run build` green.

## Code standards

- **Scope.** Do what was asked, no more. No unrequested refactors, extra features or speculative abstractions. A bug fix is made once, in the shared code, after checking every caller.
- **Match the code around you:** naming, comment density, formatting. Read a file before changing it.
- **Types.** The compiler is strict (`strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`). No `any`, no unchecked casts or non-null assertions unless a comment in the same change says why they are safe. A cast on parsed third-party JSON is a boundary bug: validate it instead. Before finishing, run `grep -nE ' as |!\.|!\)'` over your diff; every hit has a reason.
- **Small functions, early returns,** descriptive names. A function does one job. Split by job, not by line count.
- **Errors.** Handle them where something can be done about them. No empty `catch`; log with context or show the user a message. A failed optional feature (a cover, a model) must leave the app working. After a failed or restarted async job (a render, a request), clear what the last success left behind (a blob, an image, an enabled button) so the UI never offers stale output.
- **Canvas text** that can grow with data (signs, plates, cards) wraps or truncates at a minimum readable size; it never shrinks below what is legible at the camera's normal distance.
- **Comments say why,** not what. No commented-out code. No TODO without who, why and when it matters.
- **No new dependency** for something a few lines or the platform can do. A real need is discussed in the pull request first, with size and licence.
- **Docs move with code.** Change behaviour, commands or layout: update `README.md` and this file in the same change. Adding, splitting or moving a module updates the Layout block of both in the same commit.
- Code identifiers are English. Prose follows the project language (English).

## Tests

- New logic and every bug fix get a test that fails without the change. Tests are deterministic: no real network, clocks or randomness without a seed; stub `fetch`, `localStorage` and the cache as the existing tests do.
- Pure logic (layout, parsing, mapping, sanitising, contrast) is tested in `tests/`. Rendering is checked by eye (see below), not snapshotted.
- Tests import the constants the code uses and assert behaviour; they never copy a constant or re-implement the formula (`expect(TAP_SLOP).toBe(6)` passes when code and test drift together).
- Text-on-colour pairs generated from a hue (card themes, spine ink, accents) have a test that sweeps every hue and asserts 4.5:1 (3:1 only for text of 24 px or more).
- Code that decides when the frame loop wakes or sleeps is tested through the call sites with a fake scheduler, not only the loop itself. A sleep test steps to rest and asserts the pose equals the target, comparing each moving quantity; signed sums cancel.
- A fix that cannot be tested in node (rendering, DOM, WebGL) says so in the commit body, and its logic is extracted when it can be.
- A change to how something looks is not done until it has been seen in a browser: run `npm run dev`, load `?books=60` and `?books=500`, check the console for errors. A preset or tint (wood, theme) is checked with every preset side by side, not only the default.

## Security

- Sanitise on input (`sanitizeBook`, `sanitizeSettings`, `parseBackup`), not on every use.
- Worker routes accept only what they need: fixed hosts, anchored patterns, length limits, `GET` and `HEAD`.
- Compare an upstream content type or path with an explicit allow-list or an anchored pattern, never `startsWith` (`image/` once let `image/svg+xml` through the cover proxy). Cap a body while reading it, not after.
- No personal data in URLs, logs or third-party requests.
- Do not add analytics, tracking or remote fonts or scripts.

## Performance

The shelf draws only while something moves, and an idle page must stay idle. Do not add a continuous animation, a per-frame allocation, or a per-book mesh or material that could be shared.

- The frame loop sleeps when nothing moves. Every change must wake it, including changes started by timers, promises and async callbacks, not only input events; name any new source of change in the pull request and wake from the code that makes it. Periodic work in a loop that can sleep counts time, not frames.
- Prove idle with a measurement: with the shelf untouched, `requestAnimationFrame` callbacks per second over 3 s must be 0 (`window.__verso.idle()` is true), and waking again with no input must change no pixel.
- Draw-call ceiling today is about 500 at 500 books (503 measured with default settings, November 2026). A change that raises it or the frame time needs a reason and a measurement (`?books=500`, `window.__verso.stats()`).
- Compare numbers only at the same state: same book count, viewport, camera and settings (the armchair and lamp setting changes triangles and textures), after spine textures settle, read several times. A shadow-pass frame or a throttled tab reads about twice the draw calls.
- Share geometry and materials; parts of one object that share a material are one mesh or one geometry group. Dispose what a rebuild replaces; release textures that are far from the camera.
- Load heavy things on demand (models, big textures, the glTF loader). First paint must not wait on them.
- Keep images and models small: textures sized to how big they appear (512 px for tiles), meshes compressed, assets named by content so they can cache.

## Assets and licences

- Only CC0 or compatible-licence assets. Record each one in the `CREDITS.md` of its folder (file, source, author).
- Optimise before committing: pack models into one `.glb`, resize textures, compress meshes. The optimiser is a one-off tool on a developer's machine, not a project dependency.
- No assets of unknown origin. No screenshots of copyrighted covers in the repository.
- The project is GPL-3.0; contributions are accepted under it.

## Accessibility

- Everything reachable by mouse is reachable by keyboard, with a visible focus ring and a name for screen readers. The flat list view is the accessible twin of the 3D shelf: new features work there too.
- Text keeps 4.5:1 contrast. Spine ink is chosen by that rule; keep it when changing spine drawing. Form fields style `::placeholder` explicitly; the browser default does not pass.
- `aria-label` goes on an element that has a role (`role="img"`, `group`, `radiogroup`), never on a plain `div` or `span`. Keep live regions small.
- Do not disable zoom. Respect `prefers-reduced-motion`.

## Git

- Branch names: `type/short-description` (`fix/cover-lag`, `feat/anime-wall`).
- Commit messages: `TYPE: summary` with an uppercase type (`ADD`, `FIX`, `UPDATE`, `REMOVE`, `REFACTOR`, `DOCS`, `TEST`, `CHORE`), imperative present tense, 72 characters or fewer. One logical change per commit.
- Do not skip hooks, rewrite shared history or force-push. Check `git status` before committing: stage only your own files.
- Open a pull request; do not push to `main`.

## Rules for agents

In addition to everything above:

- **Ask before** anything destructive or hard to undo (deleting files or data, overwriting, schema changes, force-push), before adding a dependency, and before running a tool you have not been told you may run. Do not work around a refusal.
- **Do not commit, push or deploy** unless asked. A push to `main` deploys.
- **Verify before saying done.** Run `npm run typecheck`, `npm test` and `npm run build`; for visible changes, look at it in a browser. Report failures with the real output, and say what you did not check.
- **Stay in your files.** Another person or agent may have uncommitted work in the same tree. Never revert or commit changes you did not make.
- **Read first.** Verify a file, function or flag exists before recommending or using it. Prefer the project's own helpers over new ones.
- **Keep diffs small and reviewable:** no drive-by formatting, no unrelated renames, no generated noise.
- **Say plainly** what you skipped, what is a guess, and any risk the owner must know.
- **Parallel agents** get disjoint file lists, and a shared file has one owner at a time; two agents once rewrote the same page-material code in `src/scene/shelf.ts` and conflicted. Merge a shared integration branch after each batch of commits.
- **Worktrees** reuse the main folder's `node_modules` (see Run); never `npm install` per worktree. Archive a finished session so its worktree is released.

## Recommended agent tools

Optional and per developer; none is a project dependency, and none changes the rules above. Install each from its own documentation. Where a tool and this file disagree, this file wins.

| Tool | What it is for here |
| --- | --- |
| **ponytail** | Keeps changes to the smallest complete diff: reuse before writing, no speculative options, a test for new logic. Its audit and review commands (`/ponytail-audit`, `/ponytail-review`) suit a whole-repo or pull-request check against these rules. |
| **codegraph** | A local code index. Query it before grepping or reading files to find a symbol, its callers and what a change reaches. The index lives in `.codegraph/`, is built on your machine and stays untracked. |
| **rtk** | Condenses command output to save tokens. Trust the exit code over the text: if a result is empty, garbled or contradicts the exit code, run the command again as `rtk bypass <cmd>`. Failing tests and typecheck errors must be read in full. |
| **caveman** | Terse replies in chat. It never applies to anything written into the repository: code, comments, commit messages, docs, pull requests and issues stay in clear, full sentences. |

## Definition of done

- [ ] It does what was asked and nothing else.
- [ ] `npm run typecheck`, `npm test`, `npm run build` pass.
- [ ] New logic and fixes have tests; old stored data and backups still load. A fix with no test says why in its commit body.
- [ ] Looked at in a browser if it is visible; no console errors; frame cost not worse.
- [ ] Docs, `CREDITS.md` and `.dev.vars.example` updated where relevant.
- [ ] No secrets, no new warnings, no unexplained dependency.
- [ ] Commits follow `TYPE: summary`, one logical change each.
