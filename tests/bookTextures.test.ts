import {describe, expect, it} from 'vitest';
import {farSpines, isFarSpine, spineReach, sweepDue, spinesToDraw, staleKeys, textureKey} from '../src/scene/bookTextures';
import type {Book} from '../src/types';

const book = (id: string, v: number) => ({id, v}) as Book;

describe('texture keys', () => {
  it('name a book, its version and the kind', () => {
    expect(textureKey(book('b1', 3), 'spine')).toBe('b1:3:spine');
  });

  it('flag textures of deleted books and old versions, and keep the live ones', () => {
    const keys = ['a:1:spine', 'a:1:cover', 'a:0:spine', 'gone:1:spine', 'b:2:cover'];
    expect(staleKeys(keys, [book('a', 1), book('b', 2)]).sort()).toEqual(['a:0:spine', 'gone:1:spine']);
    expect(staleKeys([], [book('a', 1)])).toEqual([]);
  });

  it('does not confuse ids that start alike', () => {
    expect(staleKeys(['ab:1:spine'], [book('a', 1)])).toEqual(['ab:1:spine']);
  });
});

describe('spine selection', () => {
  const e = (caseIndex: number, hasSpine = false) => ({caseIndex, hasSpine});

  it('returns nothing, not an empty list, when no spine is missing in reach', () => {
    expect(spinesToDraw([e(0, true), e(9)], 0, 5, 6)).toBeNull();
    expect(spinesToDraw([], 0, 5, 6)).toBeNull();
  });

  it('orders the missing ones nearest bookcase first and skips those beyond reach', () => {
    const near = e(1);
    const mid = e(2);
    const far = e(9);
    const out = spinesToDraw([mid, far, near, e(0, true)], 5, 5, 6);
    expect(out).toEqual([near, mid]);
  });

  it('reach grows with distance and width, and far spines are those more than three reaches away', () => {
    expect(spineReach(20, 0.35, 1.6, 5)).toBeGreaterThan(spineReach(10, 0.35, 1.6, 5));
    expect(isFarSpine(0, 5, 20, 6)).toBe(true);
    expect(isFarSpine(0, 5, 17, 6)).toBe(false);
  });
});

describe('releasing far spines', () => {
  const e = (caseIndex: number, hasSpine = true) => ({caseIndex, hasSpine});

  it('picks drawn spines more than three reaches from the camera, never the open book, never undrawn ones', () => {
    const near = e(0);
    const far = e(9);
    const open = e(9);
    const undrawn = e(9, false);
    expect(farSpines([near, far, open, undrawn], open, 5, 0, 6)).toEqual([far]);
    expect(farSpines([near], undefined, 5, 0, 6)).toEqual([]);
  });

  it('is due by time, not by frames, so a loop that sleeps between interactions still sweeps', () => {
    expect(sweepDue(1000, 0, 2000)).toBe(false);
    expect(sweepDue(2000, 0, 2000)).toBe(true);
    expect(sweepDue(5000, 3000, 2000)).toBe(true);
  });
});
