import {afterEach, describe, expect, it, vi} from 'vitest';
import handler from '../api/search';
import type {ApiRes} from '../api/_lib/http';

function call(query: Record<string, string>) {
  const out: {status: number; body: unknown; headers: Record<string, string>} = {status: 0, body: null, headers: {}};
  const res: ApiRes = {
    status(c) { out.status = c; return res; },
    setHeader(k, v) { out.headers[k] = v; },
    json(b) { out.body = b; },
    send() {},
  };
  return handler({query}, res).then(() => out);
}

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), {status}));

afterEach(() => vi.restoreAllMocks());

describe('/api/search work mode', () => {
  it('falls back to Google Books, with the server-side key, when Open Library has no description', async () => {
    process.env.GOOGLE_BOOKS_API_KEY = 'test-key';
    const urls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((u) => {
      urls.push(String(u));
      return String(u).includes('openlibrary.org') ? json({subjects: ['Fantasy']}) : json({items: [{volumeInfo: {description: 'From Google.'}}]});
    });
    const r = await call({work: 'OL1111W', title: 'Fallback Title', author: 'A. Person'});
    expect(r.body).toEqual({summary: 'From Google.', genre: 'Fantasy', source: 'google'});
    expect(urls.some((u) => u.includes('key=test-key'))).toBe(true);
  });

  it('still answers when Google Books fails (quota)', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((u) => (String(u).includes('openlibrary.org') ? json({}) : json({error: 'quota'}, 429)));
    const r = await call({work: 'OL2222W', title: 'No Summary Anywhere'});
    expect(r.status).toBe(200);
    expect(r.body).toEqual({summary: '', genre: '', source: null});
  });

  it('rejects malformed work ids and short queries', async () => {
    expect((await call({work: '../etc'})).status).toBe(400);
    expect((await call({q: 'x'})).status).toBe(400);
  });

  it('serves repeat queries from cache with CDN headers', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => json({docs: [{key: '/works/OL9W', title: 'Cached', author_name: ['Z'], subject: ['Poetry']}]}));
    const a = await call({q: 'cache me'});
    const b = await call({q: 'cache me'});
    expect(spy).toHaveBeenCalledTimes(1);
    expect(b.body).toEqual(a.body);
    expect(b.headers['Cache-Control']).toContain('s-maxage');
  });
});
