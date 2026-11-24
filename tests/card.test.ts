import {describe, expect, it} from 'vitest';
import {cardQuote, fitCover, type FitInput} from '../src/export/layout';
import {THEMES, themeById} from '../src/export/themes';

const base: FitInput = {top: 150, bottom: 1212, fixedBelow: 400, quoteLineH: 52, wantLines: 7, minCover: 420, idealCover: 540, maxCover: 650};

describe('cardQuote', () => {
  it('prefers notes, quoted', () => expect(cardQuote({notes: ' Loved it ', summary: 'S'})).toEqual({text: '“Loved it”', quoted: true}));
  it('falls back to the summary', () => expect(cardQuote({notes: '  ', summary: 'S'})).toEqual({text: 'S', quoted: false}));
  it('is null with neither', () => expect(cardQuote({notes: '', summary: ''})).toBeNull());
});

describe('fitCover', () => {
  it('keeps every quote line and a full cover when there is room', () => {
    expect(fitCover({...base, fixedBelow: 150})).toEqual({cover: 548, quoteLines: 7});
  });
  it('drops quote lines before shrinking the cover', () => {
    const r = fitCover(base);
    expect(r.cover).toBeGreaterThanOrEqual(540);
    expect(r.quoteLines).toBeLessThan(7);
  });
  it('shrinks the cover only when even no quote cannot fit the ideal', () => {
    const r = fitCover({...base, fixedBelow: 560});
    expect(r.cover).toBeLessThan(540);
    expect(r.cover).toBeGreaterThanOrEqual(420);
  });
  it('never goes below the minimum', () => expect(fitCover({...base, fixedBelow: 2000})).toEqual({cover: 420, quoteLines: 0}));
  it('grows the cover when there is no quote', () => expect(fitCover({...base, wantLines: 0, fixedBelow: 150}).cover).toBe(650));
});

describe('themes', () => {
  it('has unique ids and resolves an unknown id to the first theme', () => {
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length);
    expect(themeById('nope' as never).id).toBe(THEMES[0]!.id);
  });
});
