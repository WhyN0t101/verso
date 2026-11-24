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

  it('streams the image with long cache headers and passes 404 through', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((u) =>
      Promise.resolve(String(u).includes('-L.jpg?default=false') && String(u).includes('/42-') ? new Response(new Uint8Array([1, 2, 3]), {headers: {'Content-Type': 'image/jpeg'}}) : new Response('no', {status: 404})),
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
