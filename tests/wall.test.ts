import {describe, expect, it} from 'vitest';
import {CASE_ROWS, caseX, firstMatchCase, layoutWall, nearestCase, snapCase} from '../src/scene/wall';
import {makeBook} from '../src/data/books';
import type {Book} from '../src/types';

const mk = (title: string, genre = '', w = 0.4): Book => ({...makeBook({title, genre}), w});
const many = (n: number, genre?: string) => Array.from({length: n}, (_, i) => mk(`B${i}`, genre));

describe('layoutWall', () => {
  it('always returns one empty case for an empty library', () => {
    const w = layoutWall([], 4.2, false);
    expect(w.cases).toHaveLength(1);
    expect(w.cases[0]!.rows).toHaveLength(CASE_ROWS);
  });

  it('fills fixed-height cases in insertion order and adds cases to the right', () => {
    const books = many(60);
    const w = layoutWall(books, 4.2, false);
    expect(w.cases.length).toBeGreaterThan(1);
    for (const c of w.cases) expect(c.rows).toHaveLength(CASE_ROWS);
    const order = w.cases.flatMap((c) => c.rows.flat().map((p) => p.b.id));
    expect(order).toEqual(books.map((b) => b.id));
    expect(w.caseOf.get(books[0]!.id)).toBe(0);
    expect(w.caseOf.get(books[59]!.id)).toBe(w.cases.length - 1);
  });

  it('keeps every row inside the case width', () => {
    const w = layoutWall(many(40), 3.6, false);
    for (const c of w.cases) for (const row of c.rows) for (const p of row) expect(p.x + p.b.w).toBeLessThanOrEqual(3.6);
  });

  it('gives each genre its own labelled case, catch-all last, when grouped', () => {
    const books = [mk('a', 'Sci-fi'), mk('b', 'Fantasy'), mk('c', ''), mk('d', 'Sci-fi'), mk('e', 'Fantasy')];
    const w = layoutWall(books, 4.2, true);
    expect(w.cases.map((c) => c.label)).toEqual(['Fantasy', 'Sci-fi', 'Unsorted']);
    expect(w.caseOf.get(books[0]!.id)).toBe(1);
    expect(w.caseOf.get(books[1]!.id)).toBe(0);
  });

  it('splits a large genre over several cases with the same label', () => {
    const w = layoutWall(many(60, 'Fantasy'), 3.6, true);
    expect(w.cases.length).toBeGreaterThan(1);
    expect(new Set(w.cases.map((c) => c.label))).toEqual(new Set(['Fantasy']));
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
