import {describe, expect, it} from 'vitest';
import {CASE_ROWS, caseX, fasciaText, firstMatchCase, groupSections, layoutWall, nearestCase, snapCase} from '../src/scene/wall';
import {makeBook} from '../src/data/books';
import type {Book} from '../src/types';

const mk = (title: string, genre = '', w = 0.4): Book => ({...makeBook({title, genre}), w});
const many = (n: number, genre?: string) => Array.from({length: n}, (_, i) => mk(`B${i}`, genre));

describe('layoutWall', () => {
  it('shows one case with two rows for an empty library', () => {
    const w = layoutWall([], 4.2, false);
    expect(w.cases).toHaveLength(1);
    expect(w.cases[0]!.rows).toHaveLength(2);
  });

  it('fills full cases in insertion order and adds cases to the right', () => {
    const books = many(60);
    const w = layoutWall(books, 4.2, false);
    expect(w.cases.length).toBeGreaterThan(1);
    for (const c of w.cases.slice(0, -1)) expect(c.rows).toHaveLength(CASE_ROWS);
    const order = w.cases.flatMap((c) => c.rows.flat().map((p) => p.b.id));
    expect(order).toEqual(books.map((b) => b.id));
    expect(w.caseOf.get(books[0]!.id)).toBe(0);
    expect(w.caseOf.get(books[59]!.id)).toBe(w.cases.length - 1);
  });

  it('shows only the rows needed plus one empty row on the last case', () => {
    const rowsOf = (n: number) => layoutWall(many(n), 4.2, false).cases.at(-1)!.rows;
    const perRow = layoutWall(many(40), 4.2, false).cases[0]!.rows[0]!.length;
    expect(rowsOf(3)).toHaveLength(2); // one used row, one empty
    expect(rowsOf(perRow + 1)).toHaveLength(3); // two used rows, one empty
    expect(rowsOf(perRow * 3 + 1)).toHaveLength(CASE_ROWS); // four used rows: full
    expect(rowsOf(perRow * 2 + 1).at(-1)).toEqual([]); // the extra row is empty
  });

  it('keeps every row inside the case width', () => {
    const w = layoutWall(many(40), 3.6, false);
    for (const c of w.cases) for (const row of c.rows) for (const p of row) expect(p.x + p.b.w).toBeLessThanOrEqual(3.6);
  });

  it('lists one jump entry per bookcase when ungrouped', () => {
    const w = layoutWall(many(60), 4.2, false);
    expect(w.sections.map((s) => s.name.startsWith('Bookcase'))).not.toContain(false);
    expect(w.sections.reduce((n, s) => n + s.count, 0)).toBe(60);
  });
});

describe('grouped layout', () => {
  const genres = (spec: Record<string, number>) => Object.entries(spec).flatMap(([g, n]) => many(n, g).map((b, i) => ({...b, title: `${g}${i}`})));

  it('gives every genre its own section, even with one book, Unsorted then Other last', () => {
    const books = genres({Sci: 4, Fantasy: 5, Poetry: 1, Drama: 2, Unsorted: 3});
    expect(groupSections(books).map((s) => [s.name, s.books.length])).toEqual([['Drama', 2], ['Fantasy', 5], ['Poetry', 1], ['Sci', 4], ['Unsorted', 3]]);
    expect(layoutWall(books, 4.2, true).sections.every((s) => !s.contains)).toBe(true);
  });

  it('keeps up to 12 genres as they are, and merges only above 12', () => {
    const twelve = Object.fromEntries(Array.from({length: 12}, (_, i) => [`G${String.fromCharCode(65 + i)}`, 2]));
    expect(groupSections(genres(twelve))).toHaveLength(12);
    expect(groupSections(genres(twelve)).map((s) => s.name)).not.toContain('Other');
    const thirteen = {...twelve, GM: 1};
    const out = groupSections(genres(thirteen));
    expect(out).toHaveLength(12);
    expect(out.at(-1)!.name).toBe('Other');
  });

  it('folds the smallest genres into Other and says which ones', () => {
    const spec: Record<string, number> = {Big1: 9, Big2: 8, Big3: 7, Big4: 6, Big5: 5, Big6: 5, Big7: 4, Big8: 4, Big9: 4, Big10: 3, Big11: 3, Tiny1: 1, Tiny2: 1, Mid: 2};
    const out = groupSections(genres(spec));
    expect(out).toHaveLength(12);
    const other = out.at(-1)!;
    expect(other.name).toBe('Other');
    expect(other.contains).toEqual([{name: 'Mid', count: 2}, {name: 'Tiny1', count: 1}, {name: 'Tiny2', count: 1}]);
    expect(other.books).toHaveLength(4);
    const wall = layoutWall(genres(spec), 4.2, true);
    expect(wall.sections.at(-1)).toMatchObject({name: 'Other', count: 4, contains: [{name: 'Mid', count: 2}, {name: 'Tiny1', count: 1}, {name: 'Tiny2', count: 1}]});
    const partsWithOther = wall.cases.flatMap((c) => c.sections).filter((p) => p.name === 'Other');
    expect(partsWithOther.length).toBeGreaterThan(0);
    expect(partsWithOther.every((p) => p.contains?.join() === 'Mid,Tiny1,Tiny2')).toBe(true);
  });

  it('puts a genre literally called Other with the folded ones without listing itself', () => {
    const spec = Object.fromEntries([...Array.from({length: 12}, (_, i) => [`G${String.fromCharCode(65 + i)}`, 3]), ['Other', 2]]);
    const other = groupSections(genres(spec)).at(-1)!;
    expect(other.name).toBe('Other');
    expect(other.contains?.map((c) => c.name)).not.toContain('Other');
    expect(other.books.length).toBeGreaterThanOrEqual(2);
  });

  it('moves a book to its new section as soon as its genre changes', () => {
    const books = genres({Fantasy: 3, Sci: 3});
    const before = layoutWall(books, 4.2, true);
    expect(before.sections.map((s) => [s.name, s.count])).toEqual([['Fantasy', 3], ['Sci', 3]]);
    const moved = books.map((b, i) => (i === 0 ? {...b, genre: 'Gothic'} : b));
    const after = layoutWall(moved, 4.2, true);
    expect(after.sections.map((s) => [s.name, s.count])).toEqual([['Fantasy', 2], ['Gothic', 1], ['Sci', 3]]);
  });

  it('flows small sections along shared shelves with a bookend between them', () => {
    const w = layoutWall(genres({Fantasy: 3, Sci: 3}), 4.8, true);
    expect(w.cases).toHaveLength(1);
    expect(w.cases[0]!.rows.flat()).toHaveLength(6);
    expect(w.cases[0]!.rows[0]!.length).toBeGreaterThan(3); // both sections share the top row
    expect(w.cases[0]!.bookends).toHaveLength(1);
    expect(w.cases[0]!.sections).toEqual([{name: 'Fantasy', continued: false}, {name: 'Sci', continued: false}]);
  });

  it('does not make one bookcase per genre', () => {
    const w = layoutWall(genres({A: 4, B: 4, C: 4, D: 4, E: 4, F: 4}), 4.2, true);
    expect(w.cases.length).toBeLessThan(6);
  });

  it('marks a section that carries over into the next bookcase as continued', () => {
    const w = layoutWall(genres({Fantasy: 60, Sci: 4}), 3.6, true);
    expect(w.cases.length).toBeGreaterThan(1);
    expect(w.cases[0]!.sections).toEqual([{name: 'Fantasy', continued: false}]);
    expect(w.cases[1]!.sections[0]).toEqual({name: 'Fantasy', continued: true});
    expect(w.sections[0]).toMatchObject({name: 'Fantasy', count: 60, firstCase: 0});
    expect(w.sections[1]).toMatchObject({name: 'Sci', count: 4});
    expect(w.sections[1]!.firstCase).toBe(w.cases.findIndex((c) => c.sections.some((s) => s.name === 'Sci')));
  });
});

describe('fasciaText', () => {
  const part = (name: string, continued = false) => ({name, continued});
  it('names one, two, three and many sections', () => {
    expect(fasciaText([])).toBe('');
    expect(fasciaText([part('Fantasy')])).toBe('Fantasy');
    expect(fasciaText([part('Fantasy', true), part('Gothic')])).toBe('Fantasy (continued) and Gothic');
    expect(fasciaText([part('A'), part('B'), part('C')])).toBe('A, B and C');
    expect(fasciaText([part('A'), part('B'), part('C'), part('D'), part('E')])).toBe('A, B and 3 more');
    expect(fasciaText([{name: 'Other', continued: false, contains: ['Drama', 'Poetry']}])).toBe('Other (Drama and Poetry)');
    expect(fasciaText([{name: 'Other', continued: true, contains: ['A', 'B', 'C', 'D']}])).toBe('Other (continued) (A, B and 2 more)');
  });
});

describe('camera targeting', () => {
  const books = many(60);
  const w = layoutWall(books, 4.2, false);

  it('finds the case of the first match in reading order', () => {
    expect(firstMatchCase(w, (b) => b.title === 'B0')).toBe(0);
    expect(firstMatchCase(w, (b) => b.title === 'B59')).toBe(w.cases.length - 1);
    expect(firstMatchCase(w, (b) => ['B59', 'B30'].includes(b.title))).toBe(w.caseOf.get(books[30]!.id));
    expect(firstMatchCase(w, () => false)).toBeNull();
  });

  it('maps pan positions to the nearest case, clamped', () => {
    expect(nearestCase(caseX(2, 5), 5, 4)).toBe(2);
    expect(nearestCase(-9, 5, 4)).toBe(0);
    expect(nearestCase(99, 5, 4)).toBe(3);
    expect(nearestCase(7, 5, 4)).toBe(1);
  });

  it('snaps to the nearest case, and a flick moves at most one case further', () => {
    expect(snapCase(6, 0, 5, 4)).toBe(1);
    expect(snapCase(6, 0.05, 5, 4)).toBe(2);
    expect(snapCase(6, -0.05, 5, 4)).toBe(0);
    expect(snapCase(6, 5, 5, 4)).toBe(2);
    expect(snapCase(14, 0.05, 5, 4)).toBe(3);
  });
});
