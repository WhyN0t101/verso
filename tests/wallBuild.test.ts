import {describe, expect, it} from 'vitest';
import {DEPTH, innerWidthFor, standBook, widthBucket} from '../src/scene/wallBuild';
import type {Book} from '../src/types';

const book = (id: string, extra: Partial<Book> = {}) => ({id, w: 0.4, h: 1.8, d: 1.1, ...extra}) as Book;

describe('bookcase width', () => {
  it('picks a narrower case for a tall narrow window and a wider one for a wide window', () => {
    expect([widthBucket(0.5), widthBucket(1), widthBucket(1.8)]).toEqual([0, 1, 2]);
    expect(innerWidthFor(0)).toBeLessThan(innerWidthFor(1));
    expect(innerWidthFor(1)).toBeLessThan(innerWidthFor(2));
    expect(innerWidthFor(-1)).toBe(innerWidthFor(1));
  });
});

describe('standBook', () => {
  it('stands a book the same way every time', () => {
    const a = standBook(book('b1'), 1, 3, 4, 0, 0, 4.2);
    const b = standBook(book('b1'), 1, 3, 4, 0, 0, 4.2);
    expect(a).toEqual(b);
  });

  it('puts the book on the board at its row offset, with the pull out of line inside the allowed range', () => {
    const {home, lean} = standBook(book('b2'), 0.5, 0, 5, 10, 2, 4.2);
    expect(lean).toBe(0);
    expect(home[0]).toBeCloseTo(10 - 4.2 / 2 + 0.06 + 0.5 + 0.2, 10);
    expect(home[1]).toBeCloseTo(2 + 0.9, 10);
    const front = home[2] - (-DEPTH / 2 + 0.1 + 1.1 / 2);
    expect(front).toBeGreaterThanOrEqual(0);
    expect(front).toBeLessThanOrEqual(0.09);
  });

  it('only a book at the end of a row can lean, and only when there is room for its high corner', () => {
    let leaned = 0;
    for (let i = 0; i < 200; i++) {
      const mid = standBook(book('m' + i), 1, 2, 5, 0, 0, 4.2);
      expect(mid.lean).toBe(0);
      const first = standBook(book('f' + i), 1, 0, 1, 0, 0, 4.2);
      expect(first.lean).toBe(0);
      if (standBook(book('e' + i), 1, 4, 5, 0, 0, 4.2).lean > 0) leaned++;
      // No room at the end of the row: the book is at the wall.
      expect(standBook(book('e' + i), 4.0, 4, 5, 0, 0, 4.2).lean).toBe(0);
    }
    expect(leaned).toBeGreaterThan(0);
    expect(leaned).toBeLessThan(200);
  });

  it('a leaning book keeps its low corner on the board', () => {
    for (let i = 0; i < 100; i++) {
      const b = book('l' + i);
      const {home, lean} = standBook(b, 1, 4, 5, 0, 0, 4.2);
      if (!lean) continue;
      const lowCorner = home[1] - (b.h / 2) * Math.cos(lean) - (b.w / 2) * Math.sin(lean);
      expect(lowCorner).toBeCloseTo(0, 10);
      return;
    }
    throw new Error('no leaning book found in 100 tries');
  });
});
