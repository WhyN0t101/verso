import type {Book} from './types';

/** `q` must already be trimmed and lower case. Every word must appear in title, author or genre. */
export function matches(b: Book, q: string): boolean {
  if (!q) return true;
  const hay = `${b.title} ${b.author} ${b.genre}`.toLowerCase();
  return q.split(/\s+/).every((t) => hay.includes(t));
}
