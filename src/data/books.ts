import type {Book, BookDraft, Status, Tone} from '../types';
import {clamp, hash, rng} from '../util';

export const UNSORTED = 'Unsorted';

export const STATUS_LABELS: Record<Status, string> = {wishlist: 'Wishlist', reading: 'Reading', finished: 'Finished'};
export const isStatus = (v: unknown): v is Status => typeof v === 'string' && Object.hasOwn(STATUS_LABELS, v);

export function makeBook(d: BookDraft): Book {
  const title = d.title.trim();
  const author = (d.author ?? '').trim();
  const r = rng(hash(title + '|' + author));
  const book: Book = {
    id: 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title,
    author,
    genre: (d.genre ?? '').trim() || UNSORTED,
    summary: (d.summary ?? '').trim(),
    notes: '',
    rating: 0,
    hue: Math.floor(r() * 360),
    pattern: Math.floor(r() * 4),
    w: 0.27 + (Math.min(title.length, 36) / 36) * 0.1 + r() * 0.18,
    h: 1.55 + r() * 0.65,
    d: 1.0 + r() * 0.35,
    v: 1,
  };
  applyDraftExtras(book, d);
  return book;
}

/** Updates the user-editable fields. Bumps `v` so textures rebuild. */
export function updateBook(b: Book, d: BookDraft): void {
  b.title = d.title.trim();
  b.author = (d.author ?? '').trim();
  b.genre = (d.genre ?? '').trim() || UNSORTED;
  b.summary = (d.summary ?? '').trim();
  applyDraftExtras(b, d);
  b.v++;
}

function applyDraftExtras(b: Book, d: BookDraft): void {
  if (d.year) b.year = d.year;
  else delete b.year;
  if (d.cover) {
    b.cover = d.cover;
    if (d.tone) b.tone = d.tone;
    // Shape the 3D book to the real cover so the image is not stretched.
    if (d.aspect) b.d = clamp(b.h * d.aspect, 0.9, 1.5);
  } else {
    delete b.cover;
    delete b.tone;
  }
}

const num = (v: unknown, fallback: number, lo: number, hi: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : fallback;
const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');

function sanitizeTone(v: unknown): Tone | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const t = v as Record<string, unknown>;
  if (typeof t.h !== 'number' || typeof t.s !== 'number' || typeof t.l !== 'number') return undefined;
  return {h: num(t.h, 0, 0, 360), s: num(t.s, 0, 0, 100), l: num(t.l, 0, 0, 100)};
}

/** Coerces untrusted JSON (localStorage, backup file) into a valid Book, or null when unusable. */
export function sanitizeBook(x: unknown): Book | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  const title = str(o.title, 200).trim();
  if (!title) return null;
  const book: Book = {
    id: str(o.id, 40) || 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title,
    author: str(o.author, 200),
    genre: str(o.genre, 60) || UNSORTED,
    summary: str(o.summary, 2000),
    notes: str(o.notes, 20000),
    rating: Math.round(num(o.rating, 0, 0, 5)),
    hue: num(o.hue, 0, 0, 360),
    pattern: Math.round(num(o.pattern, 0, 0, 3)),
    w: num(o.w, 0.4, 0.2, 0.8),
    h: num(o.h, 1.8, 1.2, 2.6),
    d: num(o.d, 1.1, 0.8, 1.6),
    v: 1,
  };
  if (isStatus(o.status)) book.status = o.status;
  if (typeof o.year === 'number' && Number.isFinite(o.year)) book.year = Math.round(o.year);
  // Only same-origin proxy paths are accepted so an imported file cannot point the canvas at foreign images.
  if (typeof o.cover === 'string' && o.cover.startsWith('/api/cover?')) book.cover = o.cover;
  const tone = sanitizeTone(o.tone);
  if (tone) book.tone = tone;
  return book;
}
