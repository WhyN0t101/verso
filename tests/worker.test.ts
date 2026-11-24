import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import worker, {type Env} from '../src/worker';

/** In-memory stand-in for the Workers Cache API (`caches.default`). */
function fakeCache() {
  const store = new Map<string, Response>();
  return {
    store,
    match: async (req: Request) => store.get(req.url)?.clone(),
    put: async (req: Request, res: Response) => void store.set(req.url, res),
  };
}

let cache: ReturnType<typeof fakeCache>;
beforeEach(() => {
  cache = fakeCache();
  vi.stubGlobal('caches', {default: cache});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const assets = {fetch: async () => new Response('asset')};
const pending: Promise<unknown>[] = [];
const ctx = {waitUntil: (p: Promise<unknown>) => void pending.push(p)};

async function call(path: string, env: Partial<Env> = {}) {
  const res = await worker.fetch(new Request('https://verso.test' + path), {ASSETS: assets, ...env}, ctx);
  await Promise.all(pending.splice(0));
  return {status: res.status, body: (res.headers.get('Content-Type') ?? '').includes('json') ? await res.clone().json() : null, headers: res.headers, res};
}

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), {status}));

describe('/api/search work mode', () => {
  /** Open Library mock: a work with no description, plus its author record. */
  const olNoDescription = (u: string) =>
    u.includes('/works/') ? json({title: 'Real Title', subjects: ['Fantasy'], authors: [{author: {key: '/authors/OL1A'}}]}) : u.includes('/authors/') ? json({name: 'Real Author'}) : null;

  it('takes title and author for Google from the Open Library record, and caches the result per work', async () => {
    const urls: string[] = [];
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((u) => {
      urls.push(String(u));
      return olNoDescription(String(u)) ?? json({items: [{volumeInfo: {description: 'From Google.'}}]});
    });
    const env = {GOOGLE_BOOKS_API_KEY: 'test-key'};
    const a = await call('/api/search?work=OL1111W&title=Wrong&author=Attacker', env);
    expect(a.body).toEqual({summary: 'From Google.', genre: 'Fantasy', source: 'google'});
    const google = urls.find((u) => u.includes('googleapis.com')) ?? '';
    expect(google).toContain('intitle%3AReal%20Title');
    expect(google).toContain('inauthor%3AReal%20Author');
    expect(google).not.toMatch(/Wrong|Attacker/);
    expect(google).toContain('key=test-key');
    expect(a.headers.get('Cache-Control')).toContain('s-maxage=86400');
    expect(cache.store.size).toBe(1);
    // Same work with different (ignored) params is a cache hit: no further upstream calls.
    const calls = spy.mock.calls.length;
    const b = await call('/api/search?work=OL1111W&title=Other', env);
    expect(b.body).toEqual(a.body);
    expect(spy.mock.calls.length).toBe(calls);
  });

  it('still searches Google by title when the author lookup fails', async () => {
    const urls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((u) => {
      urls.push(String(u));
      if (String(u).includes('/authors/')) return json({}, 500);
      return olNoDescription(String(u)) ?? json({items: [{volumeInfo: {description: 'Title only.'}}]});
    });
    const r = await call('/api/search?work=OL5555W', {GOOGLE_BOOKS_API_KEY: 'k'});
    expect(r.body).toMatchObject({summary: 'Title only.', source: 'google'});
    expect(urls.find((u) => u.includes('googleapis.com'))).not.toContain('inauthor');
  });

  it('skips Google Books quietly when no key is configured', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((u) => olNoDescription(String(u)) ?? json({}));
    const r = await call('/api/search?work=OL3333W');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({summary: '', genre: 'Fantasy', source: null});
    expect(spy.mock.calls.every(([u]) => String(u).includes('openlibrary.org'))).toBe(true);
    expect(r.headers.get('Cache-Control')).toContain('s-maxage=3600');
  });

  it('still answers when Google Books fails (quota)', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((u) => olNoDescription(String(u)) ?? json({error: 'quota'}, 429));
    const r = await call('/api/search?work=OL2222W', {GOOGLE_BOOKS_API_KEY: 'k'});
    expect(r.status).toBe(200);
    expect(r.body).toEqual({summary: '', genre: 'Fantasy', source: null});
  });

  it('rejects malformed work ids and short queries', async () => {
    expect((await call('/api/search?work=../etc')).status).toBe(400);
    expect((await call('/api/search?q=x')).status).toBe(400);
    expect((await call(`/api/search?q=${'a'.repeat(121)}`)).status).toBe(400);
    expect((await call(`/api/search?work=OL1W&junk=${'a'.repeat(500)}`)).status).toBe(414);
  });

  it('serves repeat queries from the Cache API with CDN headers', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => json({docs: [{key: '/works/OL9W', title: 'Cached', author_name: ['Z'], subject: ['Poetry']}]}));
    const a = await call('/api/search?q=cache%20me');
    const b = await call('/api/search?q=Cache%20Me');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(b.body).toEqual(a.body);
    expect(b.headers.get('Cache-Control')).toContain('s-maxage');
    expect(cache.store.size).toBe(1);
  });

  it('does not cache upstream failures', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => json({}, 500));
    const r = await call('/api/search?q=broken%20upstream');
    expect(r.status).toBe(502);
    expect(cache.store.size).toBe(0);
  });
});

describe('/api/cover', () => {
  it('accepts only numeric Open Library ids', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    for (const id of ['abc', '1/../2', '12345678901234', '']) expect((await call(`/api/cover?id=${encodeURIComponent(id)}`)).status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });

  it('streams the image (medium by default) with long cache headers and passes 404 through', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((u) =>
      Promise.resolve(String(u).includes('-M.jpg?default=false') && String(u).includes('/42-') ? new Response(new Uint8Array([1, 2, 3]), {headers: {'Content-Type': 'image/jpeg'}}) : new Response('no', {status: 404})),
    );
    const ok = await call('/api/cover?id=42');
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Content-Type')).toBe('image/jpeg');
    expect(ok.headers.get('Cache-Control')).toContain('immutable');
    expect(new Uint8Array(await ok.res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect((await call('/api/cover?id=43')).status).toBe(404);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe('router', () => {
  it('serves assets for non-api paths and 404s unknown api paths', async () => {
    expect(await (await worker.fetch(new Request('https://verso.test/'), {ASSETS: assets}, ctx)).text()).toBe('asset');
    expect((await call('/api/nope')).status).toBe(404);
  });
  it('rejects non-GET methods on the api', async () => {
    const res = await worker.fetch(new Request('https://verso.test/api/search?q=dune', {method: 'POST'}), {ASSETS: assets}, ctx);
    expect(res.status).toBe(405);
  });
});

describe('upstream retry', () => {
  const ok = () => json({docs: [{key: '/works/OL1W', title: 'T', author_name: ['A']}]});

  it('retries once after a network error or 5xx, then succeeds', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('timeout'))
      .mockImplementationOnce(() => json({}, 503))
      .mockImplementation(ok);
    expect((await call('/api/search?q=retry-a')).status).toBe(502);
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockClear();
    spy.mockRejectedValueOnce(new Error('timeout')).mockImplementation(ok);
    expect((await call('/api/search?q=retry-b')).status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('does not retry a 4xx', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => json({}, 404));
    expect((await call('/api/cover?id=999')).status).toBe(404);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('/api/cover caching', () => {
  const jpeg = () => Promise.resolve(new Response(new Uint8Array([1, 2, 3]), {status: 200, headers: {'Content-Type': 'image/jpeg'}}));

  it('marks a successful cover immutable for a year and stores it in the Cache API', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(jpeg);
    const r = await call('/api/cover?id=123');
    expect(r.status).toBe(200);
    expect(r.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    expect(cache.store.size).toBe(1);
  });

  it('shares one cache entry between spellings of the same id', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(jpeg);
    await call('/api/cover?id=00123&size=m');
    await call('/api/cover?id=123');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0]![0])).toContain('/b/id/123-M.jpg');
  });

  it('defaults to the medium size and only allows S, M or L', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(jpeg);
    await call('/api/cover?id=5');
    await call('/api/cover?id=6&size=L');
    await call('/api/cover?id=7&size=XL');
    expect(spy.mock.calls.map(([u]) => String(u).match(/-([SML])\.jpg/)?.[1])).toEqual(['M', 'L', 'M']);
  });

  it('never gives errors the long immutable header and does not store them', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => json({}, 404));
    const miss = await call('/api/cover?id=9');
    expect(miss.status).toBe(404);
    expect(miss.headers.get('Cache-Control')).not.toMatch(/immutable|31536000/);
    expect(miss.headers.get('Cache-Control')).toContain('max-age=300');
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(new Response('x', {status: 503})));
    const down = await call('/api/cover?id=10');
    expect(down.status).toBe(502);
    expect(down.headers.get('Cache-Control')).toBe('no-store');
    expect((await call('/api/cover?id=abc')).headers.get('Cache-Control')).toBe('no-store');
    expect(cache.store.size).toBe(0);
  });
});

describe('cover choices', () => {
  const ed = (title: string, covers: number[], publish_date = '1999') => ({title, covers, publish_date});

  it('puts exact title matches first and study guides and notes editions last', async () => {
    const {rankCovers} = await import('../src/worker');
    const ranked = rankCovers(
      [
        ed('The Stranger: SparkNotes study guide', [1]),
        ed('The Stranger and other stories', [2]),
        ed('The Stranger', [3]),
        ed('L’Étranger', [4]),
        ed('Cliffs Notes on The Stranger', [5]),
      ],
      'The Stranger',
    );
    expect(ranked.map((c) => c.id)).toEqual([3, 2, 4, 1, 5]);
  });

  it('does not demote a book whose real title contains a guide word', async () => {
    const {rankCovers} = await import('../src/worker');
    const ranked = rankCovers([ed('Notes from Underground: a reader’s guide', [1]), ed('Notes from Underground', [2])], 'Notes from Underground');
    expect(ranked.map((c) => c.id)).toEqual([2, 1]);
  });

  it('keeps at most 8 unique, positive, numeric ids', async () => {
    const {rankCovers} = await import('../src/worker');
    const eds = [ed('Dune', [-1]), ed('Dune', [7]), ed('Dune', [7]), ed('Dune', [1.5]), ed('Dune', []), ...Array.from({length: 12}, (_, i) => ed('Dune', [100 + i]))];
    const ids = rankCovers(eds, 'Dune').map((c) => c.id);
    expect(ids).toHaveLength(8);
    expect(new Set(ids).size).toBe(8);
    expect(ids.every((n) => Number.isInteger(n) && n > 0)).toBe(true);
  });

  it('answers through the proxy path, caches, and rejects bad input', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((u) =>
      String(u).includes('search.json') ? json({docs: [{key: '/works/OL9W'}]}) : json({entries: [ed('Dune', [11], '1965'), ed('Dune study guide', [12])]}),
    );
    const r = await call('/api/covers?title=Dune&author=Herbert');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({choices: [{id: 11, title: 'Dune', year: 1965, cover: '/api/cover?id=11'}, {id: 12, title: 'Dune study guide', year: 1999, cover: '/api/cover?id=12'}]});
    expect(cache.store.size).toBe(1);
    const calls = spy.mock.calls.length;
    await call('/api/covers?title=dune&author=herbert');
    expect(spy.mock.calls.length).toBe(calls);
    expect((await call('/api/covers?title=x')).status).toBe(400);
  });
});
