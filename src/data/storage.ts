import type {Book, Settings} from '../types';
import {sanitizeBooks, makeBook} from './books';
import {SEED} from './seed';
import {sanitizeSettings, DEFAULT_SETTINGS} from './settings';

export const STORAGE_KEY = 'verso.v1';
const KEY = STORAGE_KEY;
const LEGACY_KEY = 'myshelf.v1';

export interface Stored {
  books: Book[];
  settings: Settings;
  /** True while the books are the untouched demo seed (nothing saved yet). */
  seeded?: boolean;
}

let memory: Stored | null = null;

function readKey(key: string): unknown {
  try {
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : null;
  } catch (err) {
    console.warn(`could not read ${key}`, err);
    return null;
  }
}

export function load(): Stored {
  const cur = readKey(KEY) as {books?: unknown[]; settings?: unknown} | null;
  if (cur && Array.isArray(cur.books)) {
    return {books: sanitizeBooks(cur.books), settings: sanitizeSettings(cur.settings)};
  }
  // The prototype stored a bare array under another key; carry that shelf over.
  const legacy = readKey(LEGACY_KEY);
  if (Array.isArray(legacy)) {
    const books = sanitizeBooks(legacy);
    if (books.length) return {books, settings: {...DEFAULT_SETTINGS}};
  }
  if (memory) return memory;
  return {books: SEED.map(makeBook), settings: {...DEFAULT_SETTINGS}, seeded: true};
}

/** Returns false when the browser refused the write (private mode, quota). */
export function save(data: Stored): boolean {
  memory = data;
  try {
    // `seeded` is a runtime flag; spreading the whole object would write it into the saved shelf.
    localStorage.setItem(KEY, JSON.stringify({version: 1, books: data.books, settings: data.settings}));
    return true;
  } catch (err) {
    console.warn('could not save to localStorage', err);
    return false;
  }
}
