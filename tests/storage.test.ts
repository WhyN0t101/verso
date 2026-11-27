import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {STORAGE_KEY, load, save} from '../src/data/storage';
import {DEFAULT_SETTINGS, MAX_IMAGE_CHARS, encodeWithinLimit, sanitizeSettings} from '../src/data/settings';

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

describe('room props setting', () => {
  it('is kept only when exactly true', () => {
    expect(sanitizeSettings({props: true}).props).toBe(true);
    expect(sanitizeSettings({props: 'yes'})).not.toHaveProperty('props');
    expect(sanitizeSettings(undefined)).not.toHaveProperty('props');
  });
});

describe('encodeWithinLimit', () => {
  it('lowers the quality until the image fits what sanitizeSettings will accept', () => {
    const tried: number[] = [];
    const data = encodeWithinLimit((q) => (tried.push(q), q > 0.6 ? 'x'.repeat(MAX_IMAGE_CHARS + 1) : 'ok'));
    expect(data).toBe('ok');
    expect(tried).toEqual([0.82, 0.7, 0.55]);
  });
  it('gives up with an error when even the lowest quality is too big', () => {
    expect(() => encodeWithinLimit(() => 'x'.repeat(MAX_IMAGE_CHARS + 1))).toThrow(/too large/);
  });
});

describe('storage under bad conditions', () => {
  // `memory` in storage.ts lives for the whole module, so each test gets a fresh copy.
  const fresh = async () => {
    vi.resetModules();
    return import('../src/data/storage');
  };

  it('falls back to the demo shelf when the stored JSON is corrupt or the wrong shape', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    for (const raw of ['{not json', '"text"', '{"books":"nope"}', 'null']) {
      store.set('verso.v1', raw);
      const s = (await fresh()).load();
      expect(s.seeded).toBe(true);
      expect(s.books.length).toBeGreaterThan(0);
    }
    warn.mockRestore();
  });

  it('drops unusable entries but keeps the rest, and keeps working when reading throws', async () => {
    store.set('verso.v1', JSON.stringify({version: 1, books: [{title: 'Keep'}, 5, null, {title: ''}, {author: 'no title'}]}));
    expect((await fresh()).load().books.map((b) => b.title)).toEqual(['Keep']);
    vi.stubGlobal('localStorage', {getItem: () => { throw new Error('blocked'); }, setItem: () => undefined});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect((await fresh()).load().seeded).toBe(true);
    warn.mockRestore();
  });

  it('reports a refused write and then serves what it was given from memory', async () => {
    const {load, save} = await fresh();
    vi.stubGlobal('localStorage', {getItem: () => null, setItem: () => { throw new DOMException('full', 'QuotaExceededError'); }});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const mine = load();
    mine.books = mine.books.slice(0, 2);
    expect(save({books: mine.books, settings: mine.settings})).toBe(false);
    expect(load().books).toHaveLength(2);
    warn.mockRestore();
  });

  it('never writes the demo-seed flag to disk', async () => {
    const {load, save} = await fresh();
    save(load());
    expect(JSON.parse(store.get('verso.v1') ?? '{}')).not.toHaveProperty('seeded');
  });
});
