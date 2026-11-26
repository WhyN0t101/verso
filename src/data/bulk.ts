import type {Book, Status} from '../types';
import {matches} from '../search';

export interface Removal {
  book: Book;
  /** Position in the list before removal, so an undo puts the book back where it stood. */
  index: number;
}

export function removeBooks(books: Book[], ids: ReadonlySet<string>): {books: Book[]; removed: Removal[]} {
  const removed: Removal[] = [];
  const kept: Book[] = [];
  books.forEach((book, index) => (ids.has(book.id) ? removed.push({book, index}) : kept.push(book)));
  return {books: kept, removed};
}

/** Reinserts removed books at their old positions. Books that are back already are skipped. */
export function restoreBooks(books: Book[], removed: Removal[]): Book[] {
  const out = [...books];
  const present = new Set(out.map((b) => b.id));
  for (const {book, index} of [...removed].sort((a, b) => a.index - b.index)) {
    if (present.has(book.id)) continue;
    out.splice(Math.min(index, out.length), 0, book);
  }
  return out;
}

/** Ids of the books that pass the current search and status filter: what "Select all matching" picks. */
export function matchingIds(books: Book[], q: string, status: Status | '', genres: readonly string[] | null = null): string[] {
  return books.filter((b) => matches(b, q, status, genres)).map((b) => b.id);
}
