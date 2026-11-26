import {describe, expect, it} from 'vitest';
import {matchingIds, removeBooks, restoreBooks} from '../src/data/bulk';
import {makeBook} from '../src/data/books';
import type {Book} from '../src/types';

const shelf = (): Book[] => ['Dune', 'Emma', 'Ulysses', 'Walden', 'Beloved'].map((t) => makeBook({title: t, genre: t === 'Emma' ? 'Classic' : 'Fiction'}));

describe('bulk delete and undo', () => {
  it('removes the chosen books and remembers where they were', () => {
    const books = shelf();
    const {books: kept, removed} = removeBooks(books, new Set([books[1]!.id, books[3]!.id]));
    expect(kept.map((b) => b.title)).toEqual(['Dune', 'Ulysses', 'Beloved']);
    expect(removed.map((r) => [r.book.title, r.index])).toEqual([['Emma', 1], ['Walden', 3]]);
  });

  it('undo restores the exact original order', () => {
    const books = shelf();
    const ids = new Set([books[0]!.id, books[2]!.id, books[4]!.id]);
    const {books: kept, removed} = removeBooks(books, ids);
    expect(restoreBooks(kept, removed).map((b) => b.id)).toEqual(books.map((b) => b.id));
  });

  it('undo keeps books added in the meantime and never duplicates', () => {
    const books = shelf();
    const {books: kept, removed} = removeBooks(books, new Set([books[1]!.id]));
    const added = makeBook({title: 'New'});
    const back = restoreBooks([...kept, added], removed);
    expect(back.map((b) => b.title)).toEqual(['Dune', 'Emma', 'Ulysses', 'Walden', 'Beloved', 'New']);
    expect(restoreBooks(back, removed)).toHaveLength(back.length);
  });

  it('ignores unknown ids and an empty selection', () => {
    const books = shelf();
    expect(removeBooks(books, new Set(['nope'])).removed).toEqual([]);
    expect(removeBooks(books, new Set()).books).toHaveLength(5);
  });
});

describe('select all matching', () => {
  it('respects the search text and the status filter', () => {
    const books = shelf();
    books[0]!.status = 'reading';
    books[1]!.status = 'reading';
    expect(matchingIds(books, '', '')).toHaveLength(5);
    expect(matchingIds(books, 'classic', '')).toEqual([books[1]!.id]);
    expect(matchingIds(books, '', 'reading')).toEqual([books[0]!.id, books[1]!.id]);
    expect(matchingIds(books, 'fiction', 'reading')).toEqual([books[0]!.id]);
    expect(matchingIds(books, 'zzz', '')).toEqual([]);
  });
});

describe('matching by genre section', () => {
  it('limits the match to the picked genres and combines with the other filters', () => {
    const books = shelf();
    expect(matchingIds(books, '', '', ['Classic'])).toEqual([books[1]!.id]);
    expect(matchingIds(books, '', '', ['Classic', 'Fiction'])).toHaveLength(5);
    expect(matchingIds(books, 'dune', '', ['Classic'])).toEqual([]);
    expect(matchingIds(books, '', '', null)).toHaveLength(5);
  });
});
