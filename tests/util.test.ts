import {describe, expect, it} from 'vitest';
import {clamp, hash, rng, slug} from '../src/util';

describe('slug', () => {
  it('makes a lowercase file-name part and falls back to "book" when nothing is left', () => {
    expect(slug('The Left Hand of Darkness!')).toBe('the-left-hand-of-darkness');
    expect(slug('  --  ')).toBe('book');
  });

  it('keeps letters of any script, so a Cyrillic or Japanese title does not become "book"', () => {
    expect(slug('Война и мир')).toBe('война-и-мир');
    expect(slug('吾輩は猫である')).toBe('吾輩は猫である');
    expect(slug('Café Nº 5')).toBe('café-nº-5');
  });
});

describe('seeded helpers', () => {
  it('hash and rng are stable, so a book looks the same after every reload', () => {
    expect(hash('Dune|Frank Herbert')).toBe(hash('Dune|Frank Herbert'));
    const a = rng(7);
    const b = rng(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    for (let i = 0; i < 100; i++) expect(a()).toBeLessThan(1);
  });

  it('clamp bounds both ends', () => {
    expect([clamp(5, 0, 3), clamp(-1, 0, 3), clamp(2, 0, 3)]).toEqual([3, 0, 2]);
  });
});
