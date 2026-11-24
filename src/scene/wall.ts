import type {Book} from '../types';
import {UNSORTED} from '../data/books';

/** Rows per bookcase; every case has the same height so the wall reads as one piece of furniture. */
export const CASE_ROWS = 4;
const ROW_GAP = 0.025;
const ROW_MARGIN = 0.12;

export interface Placed {
  b: Book;
  /** Offset from the left edge of the case interior. */
  x: number;
}

export interface Bookcase {
  index: number;
  /** Genre name when grouped, else null. */
  label: string | null;
  /** Top row first; always CASE_ROWS entries, some possibly empty. */
  rows: Placed[][];
}

export interface Wall {
  cases: Bookcase[];
  caseOf: Map<string, number>;
}

/** Genres alphabetical with the catch-all last; books keep their insertion order inside a genre. */
function groupGenres(books: Book[]): {label: string | null; books: Book[]}[] {
  const by = new Map<string, Book[]>();
  for (const b of books) by.set(b.genre, [...(by.get(b.genre) ?? []), b]);
  const names = [...by.keys()].sort((a, c) => (a === UNSORTED ? 1 : c === UNSORTED ? -1 : a.localeCompare(c)));
  return names.map((label) => ({label, books: by.get(label) ?? []}));
}

function fillRows(books: Book[], innerW: number): Placed[][] {
  const rows: Placed[][] = [[]];
  let x = 0;
  for (const b of books) {
    let row = rows[rows.length - 1] as Placed[];
    if (x + b.w > innerW - ROW_MARGIN && row.length) {
      row = [];
      rows.push(row);
      x = 0;
    }
    row.push({b, x});
    x += b.w + ROW_GAP;
  }
  return rows;
}

/** Packs books into rows, then rows into fixed-height bookcases. Grouped mode starts a new case per genre. */
export function layoutWall(books: Book[], innerW: number, groupByGenre: boolean): Wall {
  const groups = groupByGenre ? groupGenres(books) : [{label: null, books}];
  const cases: Bookcase[] = [];
  for (const g of groups) {
    const rows = fillRows(g.books, innerW);
    for (let i = 0; i < rows.length; i += CASE_ROWS) {
      const slice = rows.slice(i, i + CASE_ROWS);
      while (slice.length < CASE_ROWS) slice.push([]);
      cases.push({index: cases.length, label: g.label, rows: slice});
    }
  }
  if (!cases.length) cases.push({index: 0, label: null, rows: Array.from({length: CASE_ROWS}, () => [])});
  const caseOf = new Map<string, number>();
  for (const c of cases) for (const row of c.rows) for (const p of row) caseOf.set(p.b.id, c.index);
  return {cases, caseOf};
}

/** Index of the case holding the first book (reading order) that passes `pred`, or null. */
export function firstMatchCase(wall: Wall, pred: (b: Book) => boolean): number | null {
  for (const c of wall.cases) for (const row of c.rows) for (const p of row) if (pred(p.b)) return c.index;
  return null;
}

export const caseX = (index: number, pitch: number): number => index * pitch;

export const clampCase = (index: number, count: number): number => Math.min(Math.max(index, 0), Math.max(count - 1, 0));

export const nearestCase = (panX: number, pitch: number, count: number): number => clampCase(Math.round(panX / pitch), count);

/** Where a swipe settles (velocity in world units per ms): the nearest case, nudged one further by a flick, never more than one away. */
export function snapCase(panX: number, velocity: number, pitch: number, count: number): number {
  const near = nearestCase(panX, pitch, count);
  const flick = Math.abs(velocity) > 0.004 ? Math.sign(velocity) : 0;
  const projected = nearestCase(panX + velocity * 200, pitch, count);
  const lo = near - 1;
  const hi = near + 1;
  return clampCase(flick ? Math.min(Math.max(projected, lo), hi) : near, count);
}
