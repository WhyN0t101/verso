import type {Book} from '../types';
import {UNSORTED} from '../data/books';

/** Rows in a full bookcase. The last case shows only the rows it needs plus one empty row. */
export const CASE_ROWS = 4;
const MIN_ROWS = 2;
const ROW_GAP = 0.025;
const ROW_MARGIN = 0.12;
/** A genre with fewer books than this is shelved under "Other". */
export const MIN_SECTION = 3;
export const OTHER = 'Other';
/** Width of the slim bookend that separates two sections on a shared shelf. */
export const BOOKEND_W = 0.1;

export interface Placed {
  b: Book;
  /** Offset from the left edge of the case interior. */
  x: number;
}

export interface Bookend {
  /** Row index inside the case, top row first. */
  row: number;
  x: number;
}

/** A section as it appears on one bookcase's fascia. */
export interface SectionPart {
  name: string;
  /** The section began in an earlier bookcase. */
  continued: boolean;
}

export interface Bookcase {
  index: number;
  /** Top row first. Between MIN_ROWS and CASE_ROWS entries, some possibly empty. */
  rows: Placed[][];
  bookends: Bookend[];
  /** Sections present here, in shelf order. Empty when grouping is off. */
  sections: SectionPart[];
}

/** One entry of the jump list. */
export interface SectionInfo {
  name: string;
  count: number;
  /** Bookcase where the section begins. */
  firstCase: number;
}

export interface Wall {
  cases: Bookcase[];
  caseOf: Map<string, number>;
  /** Genres when grouped, otherwise one entry per bookcase. */
  sections: SectionInfo[];
}

interface Section {
  name: string;
  books: Book[];
}

/** Genres alphabetical, then Unsorted, then Other. Small genres fold into Other. Insertion order is kept inside a section. */
export function groupSections(books: Book[]): Section[] {
  const by = new Map<string, Book[]>();
  for (const b of books) by.set(b.genre, [...(by.get(b.genre) ?? []), b]);
  const named: Section[] = [];
  const other: Book[] = [];
  for (const [name, list] of by) {
    if (name === OTHER || list.length < MIN_SECTION) other.push(...list);
    else named.push({name, books: list});
  }
  named.sort((a, c) => (a.name === UNSORTED ? 1 : c.name === UNSORTED ? -1 : a.name.localeCompare(c.name)));
  // Other keeps the order the books were added in, not the order the small genres were met.
  const order = new Map(books.map((b, i) => [b.id, i]));
  other.sort((a, c) => (order.get(a.id) ?? 0) - (order.get(c.id) ?? 0));
  return other.length ? [...named, {name: OTHER, books: other}] : named;
}

interface FlatRow {
  items: Placed[];
  bookends: number[];
}

/** Packs sections end to end into rows; a bookend marks each change of section when it fits on the row. */
function flow(sections: Section[], innerW: number): {rows: FlatRow[]; sectionOf: Map<string, string>} {
  const rows: FlatRow[] = [{items: [], bookends: []}];
  const sectionOf = new Map<string, string>();
  let x = 0;
  sections.forEach((s, si) => {
    s.books.forEach((b, bi) => {
      let row = rows[rows.length - 1] as FlatRow;
      if (si > 0 && bi === 0 && row.items.length && x + BOOKEND_W + b.w <= innerW - ROW_MARGIN) {
        row.bookends.push(x);
        x += BOOKEND_W + ROW_GAP;
      }
      if (x + b.w > innerW - ROW_MARGIN && row.items.length) {
        row = {items: [], bookends: []};
        rows.push(row);
        x = 0;
      }
      row.items.push({b, x});
      x += b.w + ROW_GAP;
      sectionOf.set(b.id, s.name);
    });
  });
  return {rows, sectionOf};
}

/** Lays books out on a wall of bookcases. Grouped mode keeps genres together on shared shelves. */
export function layoutWall(books: Book[], innerW: number, groupByGenre: boolean): Wall {
  const sections = groupByGenre ? groupSections(books) : [{name: '', books}];
  const {rows, sectionOf} = flow(sections, innerW);
  const cases: Bookcase[] = [];
  for (let i = 0; i < rows.length || !cases.length; i += CASE_ROWS) {
    const slice = rows.slice(i, i + CASE_ROWS);
    const used = Math.max(slice.length, 1);
    const shown = Math.min(CASE_ROWS, Math.max(MIN_ROWS, used + (used < CASE_ROWS ? 1 : 0)));
    const caseRows: Placed[][] = slice.map((r) => r.items);
    while (caseRows.length < shown) caseRows.push([]);
    const bookends: Bookend[] = [];
    slice.forEach((r, k) => r.bookends.forEach((x) => bookends.push({row: k, x})));
    cases.push({index: cases.length, rows: caseRows, bookends, sections: []});
  }
  const caseOf = new Map<string, number>();
  for (const c of cases) for (const row of c.rows) for (const p of row) caseOf.set(p.b.id, c.index);

  if (!groupByGenre) {
    const info = cases.map((c) => ({name: `Bookcase ${c.index + 1}`, count: c.rows.flat().length, firstCase: c.index}));
    return {cases, caseOf, sections: info};
  }
  const firstCase = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const c of cases) {
    for (const p of c.rows.flat()) {
      const name = sectionOf.get(p.b.id) ?? '';
      counts.set(name, (counts.get(name) ?? 0) + 1);
      if (!firstCase.has(name)) firstCase.set(name, c.index);
      if (!c.sections.some((s) => s.name === name)) c.sections.push({name, continued: (firstCase.get(name) ?? 0) < c.index});
    }
  }
  const info = sections.map((s) => ({name: s.name, count: counts.get(s.name) ?? 0, firstCase: firstCase.get(s.name) ?? 0}));
  return {cases, caseOf, sections: info};
}

/** Text for a bookcase's fascia: "Fantasy", "Fantasy (continued) and Gothic", "Fantasy, Gothic and 2 more". */
export function fasciaText(parts: SectionPart[]): string {
  const names = parts.map((p) => (p.continued ? `${p.name} (continued)` : p.name));
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
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
