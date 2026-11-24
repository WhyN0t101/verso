import {describe, expect, it} from 'vitest';
import {GENRES, mapGenre} from '../shared/genres';

describe('mapGenre', () => {
  it('prefers specific genres over the generic Fiction rule', () => {
    expect(mapGenre(['Fiction', 'Science fiction', 'Space opera', 'Ecology'])).toBe('Science fiction');
  });
  it('returns the most frequent genre', () => {
    expect(mapGenre(['Vampires', 'Horror tales', 'Fiction', 'Transylvania'])).toBe('Horror');
  });
  it('falls back to Fiction for plain novels', () => {
    expect(mapGenre(['Novels', 'English fiction'])).toBe('Fiction');
  });
  it('returns empty when nothing matches so the user chooses', () => {
    expect(mapGenre(['Accessible book', 'Large type books'])).toBe('');
    expect(mapGenre([])).toBe('');
  });
  it('does not treat "history and criticism" as History', () => {
    expect(mapGenre(['History and criticism'])).toBe('');
  });
  it('only ever returns a genre from the fixed list', () => {
    const g = mapGenre(['Fantasy fiction', 'Dragons']);
    expect(GENRES as readonly string[]).toContain(g);
  });
});
