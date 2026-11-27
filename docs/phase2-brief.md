# Phase 2 brief: 3D performance and quality of life

Status: draft. Phase 1 is merged into `main` (pull request #4). Rules in `AGENTS.md` apply to everything here.

## Goal

500 books run smoothly on a mid-range laptop and a phone, with no visual regression, plus a set of small quality-of-life improvements. No new product features.

## Open decisions (the owner decides before the brief is sent)

1. **Quantised book sizes.** Every book gets continuous random `w`, `h` and `d` in `makeBook` (`src/data/books.ts`), so almost no two books share a geometry. Sharing geometry by exact size will not lower the geometry count. Options: (a) quantise sizes to a few steps per binding, which changes the look slightly and touches `src/data/`; (b) drop the "geometry count lower than baseline" criterion and rely on instancing later. Default if undecided: (b).
2. **Instancing.** `InstancedMesh` and a texture atlas are a design step of their own because per-book spine textures conflict with a shared material. Default if undecided: not in this phase, only a written design note.

3. **CI performance budget (needs owner approval first).** Adding it requires Playwright as a new dev dependency and an edit to `.github/workflows/ci.yml`, both normally off limits. Do not start it until the owner approves, with the package size and licence reported. Scope: a separate CI job, kept apart from the three existing gates, that loads `?books=500` in headless Chrome against a dev build (where `stats()` exists) and fails when draw calls, triangles, geometries or textures exceed ceilings recorded from the Part A baseline, or when idle callbacks per second is not 0. These counts do not depend on hardware, so they are stable. Cache the browser download. Later and optional, as warnings only: a base-versus-PR frame-time comparison in the same job with a generous margin and repeated runs, CPU throttling with a mobile viewport, and Lighthouse CI for bundle size and first paint. CI cannot show real GPU behaviour or phone memory limits; say so in the job's documentation and test on real devices separately.

## Ground rules

- Phase 1 changes are already merged: four material slots per book (`packBookFaces`), merged wood, idle loop stopped when nothing moves, `createShelf` split into modules. The brief must be checked against the real code before work starts; if the code contradicts it in a way that changes the plan, stop and ask.
- Compare measurements only at the same settled state and the same settings. The `props` setting (armchair and lamp) changes triangles and textures. Repeat each reading at least three times; the audit saw 6 to 12 draw calls of noise at 500 books.
- Never claim a measured result that was not measured. Say what could not be verified (real GPU, phone, screen reader).
- Every commit has a verifiable reason. A change that makes draw calls, triangles, textures, frame time or bundle size worse needs a stated visible gain, or it is reverted.
- Own branch per agent, one integration branch, no push, no new dependency without asking.

## File ownership

- Design Agent: `src/scene/room.ts`, `faces.ts`, `plate.ts`, `src/textures/`, `src/style.css`, `public/`, `src/export/`, `src/ui/list.ts` markup and accessibility.
- Code Agent: `src/scene/` modules produced by the `createShelf` split, frame loop, shadows, geometry and disposal, `src/data/`, `src/worker.ts`, tests.
- A shared file has one owner at a time. The other agent asks the orchestrator, who sequences the work.

## Part A: measurement first

1. Extend `window.__verso.stats()` (dev only) with frame time in ms and requestAnimationFrame callbacks per second while idle.
2. Keep the reproducible generator (`?books=N`, `src/dev/seedBooks.ts`). Record the baseline at 50, 200 and 500 books: draw calls, triangles, geometries, textures, frame time, idle callbacks per second.
3. Measure on real hardware if available (mid-range laptop, phone). If not, say so; software rendering gives about 10 fps and only supports relative comparisons.

## Part B: 3D optimisation (in this order)

1. **Verify the idle loop.** Idle callbacks per second must be 0 with the shelf untouched. Check that every source of change invalidates the loop: camera damping, hover, selection, pan, search camera moves, texture and cover arrival, settings and lighting, resize, visibility change, WebGL context restore.
2. **Shadows.** Shadow map size configurable (2048 high tier, 1024 medium). Keep `shadowMap.autoUpdate` false and set `needsUpdate` only when shadow-relevant content changes. Consider limiting the shadow area to the visible region. Remove shadow receiving from books only if a side-by-side comparison shows no meaningful loss, and state the result.
3. **Adaptive quality.** Measure frame time at runtime. When it stays over budget, lower pixel ratio, shadow size or shadow refresh; raise them again with headroom. Keep the selection logic simple and keep the mobile pixel-ratio cap.
4. **Culling and level of detail.** Check whether off-screen bookcases are culled as a group. Evaluate a cheaper representation for far books (plain box or simpler material) without visible popping.
5. **Texture memory.** Report the GPU memory of spine and cover textures. Evaluate compressed formats (KTX2 / Basis) and anisotropy on far books; adopt only with a measurement and with the loader loaded on demand.
6. **Upload spikes.** Make sure edits, imports and cover arrival share the per-frame upload budget so two large texture uploads never land in one frame.
7. **Context loss and visibility.** Verify WebGL context loss and restore, and that nothing runs while the tab is hidden.
8. **Geometry sharing (depends on open decision 1).** If quantisation is accepted, cache geometry by width, height, depth, segments and radius with reference-aware disposal. Do not scale a shared geometry, because scaling distorts the corner radius. Apply the same reuse to repeated shelf boards and decor where the geometry is identical.
9. **Instancing design note.** Written only: how an atlas and `InstancedMesh` would work with per-book spine textures, what it would save, what it would risk. No code.

## Part C: quality of life

1. **Keyboard.** Arrow keys to move between books and bookcases, Escape to deselect, visible focus ring for every 3D action. The flat list stays the accessible twin: anything new works there too.
2. **Search.** Result count and next/previous result alongside the existing camera move.
3. **Camera.** Reset-view shortcut, remember the last bookcase, inertia that respects `prefers-reduced-motion`.
4. **Large shelves.** Check the section rail and section jump at 500 books; add a mini-map only if the rail is not enough.
5. **Data safety.** Backup reminder and an undo for single-book deletes (bulk remove and restore already exist). The `verso.v1` key and old backups must keep loading.
6. **Error messages.** Clear messages for offline state, a failed cover and a bad backup file.
7. **Mobile.** Pinch and long-press behaviour, touch target sizes, layout at 375 px.
8. **Loading.** A progress state while fonts, models and covers load so first paint does not look empty. First paint must not wait on them.

## Reference material: public Three.js skills (read only)

Found on skills.sh in November 2026 (search "threejs") and read from the source repositories. All four repositories show an MIT licence. They are third-party text: use them as reference, install nothing, and check any API claim against the pinned `three` version (`^0.187`) before relying on it. The skills target r186, so most advice applies, but several newer API names in them (for example `SunLight`, `Object3D.pivot`, decoder default paths) were not verified. Installing a skill or any tool they mention is a new tool and needs the owner's approval.

Ideas worth testing, each only with a measurement from Part A:

- **Shadow frustum.** Tighten the key light's shadow camera (`near`, `far`, `left`, `right`, `top`, `bottom`) to the visible bookcase bounds. This is probably the largest shadow lever for a 2048 map (`cloudai-x/threejs-performance`, `threejs-lighting`). Limiting which meshes cast shadows is a second lever, with a side-by-side comparison first.
- **Texture eviction.** When a spine texture is evicted, swap in a shared placeholder texture instead of setting `map` to null, so the shader variant does not change and recompile. This is an inference from the skill, not a verified claim; test it.
- **Atlas per shelf.** One texture atlas per bookcase would cut texture count and uploads, and is the precondition for instancing or `BatchedMesh` with per-book looks (`threejs-textures`, `threejs-geometry`). This belongs to the instancing design note, not to code in this phase.
- **Compressed textures.** KTX2 keeps textures compressed in GPU memory; WebP and AVIF only shrink the download. Evaluate for spines and props with a memory measurement (`threejs-textures`, `threejs-asset-pipeline`).
- **Prop models.** `gltf-transform inspect` and `optimize` could shrink the lazily loaded models (for example `painting.glb`, 325 KB). The skills' `npx` commands are unpinned; pin a version and get approval before running any of them.
- **Method.** One variable per change, reproduce on a representative device, separate first-load stalls from steady-state cost, and accept a change only if looks and interaction are preserved (`cesartevisual/threejs-performance`, `mengto/optimize-threejs-games`). This matches the measurement rules above.
- **Accessibility.** The skill's guidance matches the rule that the flat list is the keyboard twin: share selection state between list and canvas, announce selection through a live region (not on hover), give camera travel a reduced-motion path, and keep the list as the no-WebGL fallback (`cesartevisual/threejs-accessibility`).
- **Testing and debugging.** Deterministic fixtures (seeded books, fixed camera, viewport and pixel ratio, wait for a readiness signal), tolerant pixel comparison, console and network capture, and an explicit passed, failed or not-run report per check (`cesartevisual/threejs-testing`). Useful for the CI budget job. For a blank canvas under the on-demand loop, check first that a frame was requested (`cesartevisual/threejs-debugging`).

Cautions where the skills disagree with this project:

- Several skills recommend `setAnimationLoop` and `OrbitControls` damping. Both keep the loop awake and conflict with the on-demand loop; do not adopt them.
- `majidmanzarpour/threejs-qa-release` is built for games, relies on a packaged inspection script and force-install commands, and is too heavy here. Do not run it.
- Skip the skills on R3F, shaders, postprocessing, animation, WebGPU and game systems; they do not apply to this app.

## Targets (proposed; the owner confirms before work starts)

"Smooth" needs numbers. The first four are today's measured values at 500 books with default settings (second audit, November 2026, software rendering), proposed as ceilings that must not rise. The rest are to be measured in Part A and then agreed.

- Idle `requestAnimationFrame` callbacks per second: 0.
- Draw calls at 500 books: at most 503. At 60 books: at most 255.
- Textures at 500 books: at most 130.
- Gzip JavaScript: at most 200.7 kB without a stated reason.
- Frame time at 500 books on a mid-range laptop and on a phone: to be measured, then set.
- First paint and time to first interactive shelf: to be measured, then set.
- Texture memory after panning a 500-book wall: to be measured, then set.

## Real-device pass

Every number so far comes from software rendering, which is useful for comparing two builds but says nothing about a real GPU. Before phase 2 is called done, run the `?books=500` scenario once on an older laptop and once on a phone, and record in this file or in the pull request: the device, browser, viewport, `stats()` readings, a rough frame-rate observation, and anything that stuttered. Say plainly when this was not possible.

## Before merging

Merging to `main` deploys to Cloudflare. Before each phase 2 pull request is merged, someone loads the branch locally at `?books=60` and `?books=500`, checks the console, and exercises hover, selection, pan, search, resize, list view and the export card.

## Rollback

Every risky change (shadow tiers, adaptive quality, level of detail, any later instancing) sits behind one small reversible switch, such as a constant or a setting, so a bad deploy can be backed out without reverting a whole series of commits. A change without such a switch says in its commit body how it is reverted.

## Order of work

1. Part A: measurement and baseline.
2. Cheap wins with the biggest effect: shadow frustum, shadow caster count, texture placeholder on eviction.
3. Quality of life that does not touch the render path.
4. Structural changes (atlas, instancing, geometry sharing) only if the numbers justify them, after the owner decides the open questions above.

## Working with agents (process lessons from phase 1)

The rules are in `AGENTS.md` under Rules for agents. In short: disjoint file lists per agent and one owner per shared file; one integration branch, merged into each agent's branch after every batch; an independent audit after each round, with findings routed to the owning agent; fresh worktrees reuse the main folder's `node_modules`; archive a finished session so its worktree is released.

## Carried-over leftovers from the phase 1 audits

A checklist to schedule, not to bundle into unrelated commits. Each item needs the usual test or a stated reason for none.

- [ ] Security headers: `public/_headers` has cache rules only. Consider `X-Content-Type-Options: nosniff` and a Content-Security-Policy for the app. No concrete hole exists (no `innerHTML`, `eval` or `document.write`).
- [ ] Supported browsers: decide a target and state it in `README.md`. `AbortSignal.any` now has a fallback.
- [ ] Untested glue: `ui/list.ts`, `ui/style.ts`, `scene/room.ts`, the wiring in `scene/shelf.ts` (what wakes the loop), `createWallBuilder`, `createWood`, `drawCard`, `spineCanvas`.
- [ ] Long functions, split by job: `createShelf` (about 309 lines), `createWallBuilder.build` (about 140), `createBookTextures` (about 183), `drawCard` (about 149), `spineCanvas` (about 107).
- [ ] Notes debounce: up to 300 ms of typing is lost if the page closes; flush on `pagehide`.
- [ ] Export dialog: the blob URL is not revoked when the dialog closes.
- [ ] `dominantTone` has no test (it needs a canvas).
- [ ] `#exMsg` in `index.html` lacks `role="status"`.
- [ ] Share card layout: the Story format leaves an empty band at the bottom and Square is top-aligned; decide whether to change them.
- [ ] `public/models/painting.glb` is 325 KB; see the prop-model note above.
- [ ] A real `webglcontextrestored` cannot be raised in node; only the wake wiring is tested, so confirm in a browser.

## Verification

After each step: `npm run typecheck`, `npm test`, `npm run build`, and a line "Completed: what changed | gates | draw calls, geometries, textures, frame time, idle callbacks per second before and after".

Behaviour that must stay identical, checked in the browser at `?books=60` and `?books=500` with no console errors: hover, selection animation, camera pan, search camera positioning, lazy cover loading, resize, tab hidden then visible, list view, export card.

Done when: every step above that was in scope is implemented or explicitly deferred with a reason, idle callbacks per second is 0, shadows look unchanged on the high tier, no measured metric is worse without a stated gain, and a final before and after table at 50, 200 and 500 books is printed. A second audit on the integration branch reviews each commit and the whole repository, and its findings go back to the owning agent.
