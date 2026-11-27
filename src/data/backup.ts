import type {Book, Settings} from '../types';
import {sanitizeBooks} from './books';
import {sanitizeSettings} from './settings';

const APP = 'verso';
const VERSION = 1;

export function buildBackup(books: Book[], settings: Settings): string {
  return JSON.stringify({app: APP, version: VERSION, exportedAt: new Date().toISOString(), books, settings}, null, 2);
}

export interface ParsedBackup {
  books: Book[];
  /** Null when the file carried no settings, so the current ones are kept. */
  settings: Settings | null;
  skipped: number;
}

/** Validates a backup file. Throws an Error whose message is safe to show the user. */
export function parseBackup(text: string): ParsedBackup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  const o = data as {app?: unknown; version?: unknown; books?: unknown; settings?: unknown} | null;
  if (!o || typeof o !== 'object' || o.app !== APP || !Array.isArray(o.books)) throw new Error('That file is not a Verso backup.');
  if (typeof o.version === 'number' && o.version > VERSION) throw new Error('That backup was made by a newer version of Verso.');
  const books = sanitizeBooks(o.books);
  return {books, settings: o.settings ? sanitizeSettings(o.settings) : null, skipped: o.books.length - books.length};
}

/** Adds new books and overwrites books with the same id. Overwritten books get a new `v` so cached textures are rebuilt. */
export function mergeBooks(current: Book[], incoming: Book[]): {books: Book[]; added: number; updated: number} {
  const byId = new Map(current.map((b) => [b.id, b]));
  let added = 0;
  let updated = 0;
  for (const b of incoming) {
    const old = byId.get(b.id);
    if (old) {
      b.v = old.v + 1;
      updated++;
    } else added++;
    byId.set(b.id, b);
  }
  return {books: [...byId.values()], added, updated};
}
