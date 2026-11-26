import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {STORAGE_KEY, load, save} from '../src/data/storage';
import {DEFAULT_SETTINGS, sanitizeSettings} from '../src/data/settings';

let store: Map<string, string>;
beforeEach(() => {
  store = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('storage', () => {
  it('keeps the verso.v1 key', () => {
    expect(STORAGE_KEY).toBe('verso.v1');
  });

  it('loads what save wrote', () => {
    const first = load();
    expect(first.seeded).toBe(true);
    expect(save({books: first.books, settings: first.settings})).toBe(true);
    const again = load();
    expect(again.seeded).toBeUndefined();
    expect(again.books.map((b) => b.title)).toEqual(first.books.map((b) => b.title));
  });

  it('carries over a shelf stored by the prototype under the old key', () => {
    store.set('myshelf.v1', JSON.stringify([{title: 'Old Book', author: 'Someone'}]));
    const s = load();
    expect(s.books.map((b) => b.title)).toEqual(['Old Book']);
    expect(s.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('prefers the current key over the old one', () => {
    store.set('myshelf.v1', JSON.stringify([{title: 'Old Book'}]));
    store.set(STORAGE_KEY, JSON.stringify({version: 1, books: [{title: 'New Book'}], settings: {}}));
    expect(load().books.map((b) => b.title)).toEqual(['New Book']);
  });
});

describe('background image in settings', () => {
  const bg = (data: string) => sanitizeSettings({background: {kind: 'image', data}}).background;

  it('keeps a plain base64 image', () => {
    const data = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
    expect(bg(data)).toEqual({kind: 'image', data});
  });

  it('drops a value that breaks out of the CSS url()', () => {
    expect(bg('data:image/png;base64,AA"), url("https://evil.example/p.png')).toEqual({kind: 'preset', id: 'study'});
  });

  it('drops an image above the size cap and non-raster types', () => {
    expect(bg('data:image/png;base64,' + 'A'.repeat(1_600_000))).toEqual({kind: 'preset', id: 'study'});
    expect(bg('data:image/svg+xml;base64,AAAA')).toEqual({kind: 'preset', id: 'study'});
  });
});
