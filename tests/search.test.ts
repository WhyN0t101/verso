import {describe, expect, it} from 'vitest';
import {matches} from '../src/search';
import type {Book} from '../src/types';

const b = {title: 'The Left Hand of Darkness', author: 'Ursula K. Le Guin', genre: 'Science fiction'} as Book;

describe('matches', () => {
  it('needs every word, in any order, across title, author and genre', () => {
    expect(matches(b, 'guin darkness')).toBe(true);
    expect(matches(b, 'science hand ursula')).toBe(true);
    expect(matches(b, 'guin dune')).toBe(false);
  });

  it('ignores case in the book, treats an empty query as everything, and survives repeated spaces', () => {
    expect(matches(b, 'the   left')).toBe(true);
    expect(matches(b, '')).toBe(true);
  });

  it('treats regular expression characters literally', () => {
    expect(matches(b, 'k.')).toBe(true);
    expect(matches(b, '.*')).toBe(false);
    expect(matches(b, '(')).toBe(false);
  });

  it('limits by genre list and combines it with the text', () => {
    expect(matches(b, '', '', ['Science fiction', 'Fantasy'])).toBe(true);
    expect(matches(b, '', '', ['Fantasy'])).toBe(false);
    expect(matches(b, 'guin', '', [])).toBe(false);
  });
});
