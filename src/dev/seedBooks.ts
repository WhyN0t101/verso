import type {Book, Status} from '../types';
import {makeBook} from '../data/books';
import {GENRES} from '../../shared/genres';
import {rng} from '../util';

const WORDS = ['Silent', 'Garden', 'Winter', 'Atlas', 'Ember', 'Harbour', 'Paper', 'Iron', 'Orchard', 'Signal', 'Lantern', 'River', 'Salt', 'Glass', 'Meridian', 'Hollow', 'Archive', 'Thistle', 'Cipher', 'Tide'];
const NAMES = ['Ada Marlowe', 'Jonas Reyes', 'Mei Tanaka', 'Oskar Lind', 'Priya Nair', 'Tomás Vega', 'Hannah Okoro', 'Lev Orlov'];
const STATUSES: (Status | undefined)[] = ['wishlist', 'reading', 'finished', undefined];

/** Deterministic test shelf, so runs are comparable. Titles vary in length like real ones. */
export function generateBooks(n: number): Book[] {
  const r = rng(42);
  const pick = <T>(a: readonly T[]): T => a[Math.floor(r() * a.length)] as T;
  return Array.from({length: n}, (_, i) => {
    const words = 1 + Math.floor(r() * 5);
    const title = `${Array.from({length: words}, () => pick(WORDS)).join(' ')} ${i + 1}`;
    const b = makeBook({title, author: pick(NAMES), genre: pick(GENRES), summary: 'Generated test book.'});
    b.rating = Math.floor(r() * 6);
    const status = pick(STATUSES);
    if (status) b.status = status;
    return b;
  });
}
