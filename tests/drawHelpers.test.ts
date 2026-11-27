import {describe, expect, it} from 'vitest';
import {accOf, paletteOf, roundRect, sat, spineLightness, wrapAll, wrapLines} from '../src/textures/draw';
import type {Book} from '../src/types';

/** Ten pixels per character, so widths are easy to reason about. */
const g = {measureText: (t: string) => ({width: t.length * 10})} as unknown as CanvasRenderingContext2D;
const book = (extra: Partial<Book> = {}) => ({id: 'x', hue: 200, pattern: 1, ...extra}) as Book;

describe('wrapAll', () => {
  it('breaks on word boundaries at the width and collapses whitespace', () => {
    expect(wrapAll(g, 'one  two\nthree four', 80)).toEqual(['one two', 'three', 'four']);
  });

  it('never drops a word that is wider than the line, and returns nothing for blank text', () => {
    expect(wrapAll(g, 'extraordinarily short', 50)).toEqual(['extraordinarily', 'short']);
    expect(wrapAll(g, '   ', 50)).toEqual([]);
  });
});

describe('wrapLines', () => {
  it('leaves text that fits alone', () => {
    expect(wrapLines(g, 'a b c', 100, 3)).toEqual(['a b c']);
  });

  it('cuts to the line limit and ends the last line with an ellipsis that still fits', () => {
    const out = wrapLines(g, 'alpha beta gamma delta epsilon', 60, 2);
    expect(out).toHaveLength(2);
    expect(out[1]?.endsWith('…')).toBe(true);
    for (const line of out) expect(line.length * 10).toBeLessThanOrEqual(60);
  });

  it('does not leave dangling punctuation before the ellipsis', () => {
    const out = wrapLines(g, 'one, two, three, four', 40, 1);
    expect(out[0]).not.toMatch(/[,.;:]…$/);
  });
});

describe('palette helpers', () => {
  it('takes the hue from the cover tone and keeps its saturation inside the spine band', () => {
    expect(paletteOf(book({tone: {h: 120.4, s: 100, l: 50}}))).toEqual({h: 120, s: 48});
    expect(paletteOf(book({tone: {h: 10, s: 0, l: 50}}))).toEqual({h: 10, s: 22});
    expect(paletteOf(book())).toEqual({h: 200, s: 40});
  });

  it('keeps lightness inside the band whatever the cover or pattern', () => {
    for (const l of [0, 10, 50, 100]) for (const pattern of [0, 1, 2, 3]) {
      const v = spineLightness(book({tone: {h: 0, s: 40, l}, pattern}));
      expect(v).toBeGreaterThanOrEqual(28);
      expect(v).toBeLessThanOrEqual(52);
    }
  });

  it('clamps shifted saturation and wraps the accent hue', () => {
    expect(sat({h: 0, s: 40}, 90)).toBe(100);
    expect(sat({h: 0, s: 40}, -90)).toBe(0);
    expect(accOf(book({hue: 350}))).toBe('hsl(18,55%,66%)');
  });
});

describe('roundRect', () => {
  it('draws one closed path of four arcs', () => {
    const calls: string[] = [];
    const rec = new Proxy({}, {get: (_t, k) => (..._a: unknown[]) => void calls.push(String(k))}) as unknown as CanvasRenderingContext2D;
    roundRect(rec, 0, 0, 10, 10, 2);
    expect(calls).toEqual(['beginPath', 'moveTo', 'arcTo', 'arcTo', 'arcTo', 'arcTo', 'closePath']);
  });
});
