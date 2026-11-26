# Contributing to Verso

Thanks for helping. Verso is a 3D bookshelf that keeps everything in the visitor's own browser. The rules every change follows, for people and for coding agents alike, are in [AGENTS.md](AGENTS.md). Read it first; this page is the short path.

## Set up

```sh
npm install
cp .dev.vars.example .dev.vars   # optional: add GOOGLE_BOOKS_API_KEY
npm run dev                      # Vite and the Worker together: http://localhost:5173
```

Open `http://localhost:5173/?books=150` for a generated shelf. Open Library alone gives a complete add-a-book flow; no key is needed.

## Before you open a pull request

```sh
npm run typecheck
npm test
npm run build
```

All three must pass. For anything visible, also look at it: load `?books=60` and `?books=500`, check the browser console, and try the keyboard and the list view. Say in the pull request what you checked and what you did not.

## Workflow

1. Open an issue first for anything bigger than a fix, or read `docs/` for plans already written (for example `docs/plan-media-environments.md`).
2. Branch from `main`: `type/short-description`, such as `fix/cover-lag` or `feat/anime-wall`.
3. Keep the change small and focused: one logical change per commit, no unrelated clean-ups.
4. Commit as `TYPE: summary`, uppercase type (`ADD`, `FIX`, `UPDATE`, `REMOVE`, `REFACTOR`, `DOCS`, `TEST`, `CHORE`), imperative, 72 characters or fewer: `FIX: stop a second Add press adding the book twice`.
5. Open a pull request into `main` and fill in the template. Pushes to `main` deploy, so nothing goes there directly.

## What reviewers look for

- It does what the issue says and nothing more.
- Stored data and old backups still load; the key `verso.v1` is untouched.
- Outside input is validated at the boundary; the Worker stays a narrow proxy.
- New logic has a test that fails without the change.
- No new dependency without a reason, and no asset without a licence line in its `CREDITS.md`.
- The page is no slower: no new always-running animation, no per-book mesh or material that could be shared.
- Keyboard use, contrast and screen-reader names still work.

## Assets

Only CC0 or compatible licences. Add the source and author to the folder's `CREDITS.md`. Resize and compress before committing (see AGENTS.md).

## Using a coding agent

Agents follow the same rules; `AGENTS.md` is written for them. The tools we recommend alongside them (ponytail, codegraph, rtk, caveman) are listed in AGENTS.md. You remain responsible for what they submit: read the diff, run the checks yourself, and do not let an agent push to `main`.

## Licence

Verso is GPL-3.0 (see `LICENSE`). Contributions are accepted under the same licence.
