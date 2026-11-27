import type {Book, Status} from '../types';
import {makeBook} from '../data/books';
import {GENRES} from '../../shared/genres';
import {rng} from '../util';

const WORDS = ['Silent', 'Garden', 'Winter', 'Atlas', 'Ember', 'Harbour', 'Paper', 'Iron', 'Orchard', 'Signal', 'Lantern', 'River', 'Salt', 'Glass', 'Meridian', 'Hollow', 'Archive', 'Thistle', 'Cipher', 'Tide'];
const NAMES = ['Ada Marlowe', 'Jonas Reyes', 'Mei Tanaka', 'Oskar Lind', 'Priya Nair', 'Tomás Vega', 'Hannah Okoro', 'Lev Orlov'];
const COVER_IDS = [14627509, 14627060, 14625765, 14627042, 11481354, 980253, 6976407, 284530, 14348537, 9278312, 9278292, 12824691, 9267242, 11261770, 7282177, 10524365];
const STATUSES: (Status | undefined)[] = ['wishlist', 'reading', 'finished', undefined];

/** Deterministic test shelf, so runs are comparable. Titles vary in length like real ones. */
export function generateBooks(n: number, withCovers = false): Book[] {
  const r = rng(42);
  // Dev only, and every list passed in is non-empty, so the index is always in range.
  const pick = <T>(a: readonly T[]): T => a[Math.floor(r() * a.length)] as T;
  return Array.from({length: n}, (_, i) => {
    const words = 1 + Math.floor(r() * 5);
    const title = `${Array.from({length: words}, () => pick(WORDS)).join(' ')} ${i + 1}`;
    const b = makeBook({title, author: pick(NAMES), genre: pick(GENRES), summary: 'Generated test book.'});
    b.rating = Math.floor(r() * 6);
    // Real Open Library ids, but no stored tone: this is what an imported shelf looks like.
    if (withCovers) b.cover = `/api/cover?id=${pick(COVER_IDS)}`;
    const status = pick(STATUSES);
    if (status) b.status = status;
    return b;
  });
}
