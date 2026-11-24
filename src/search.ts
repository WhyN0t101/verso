import type {Book, Status} from './types';

/** `q` must already be trimmed and lower case. Every word must appear in title, author or genre; `status` '' means any. */
export function matches(b: Book, q: string, status: Status | '' = ''): boolean {
  if (status && b.status !== status) return false;
  if (!q) return true;
  const hay = `${b.title} ${b.author} ${b.genre}`.toLowerCase();
  return q.split(/\s+/).every((t) => hay.includes(t));
}
