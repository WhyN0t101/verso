import {afterEach, describe, expect, it, vi} from 'vitest';
import {WorkerDownError, searchBooks} from '../src/api';

afterEach(() => vi.unstubAllGlobals());

const reply = (status: number, body: unknown) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), {status})));

describe('api client in dev', () => {
  it('says the Worker is not running when the dev proxy reports it', async () => {
    reply(503, {error: 'worker-down'});
    const err = await searchBooks('dune', new AbortController().signal).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WorkerDownError);
    expect((err as Error).message).toMatch(/npm run dev/);
  });
  it('keeps other failures generic', async () => {
    reply(502, {error: 'upstream unavailable'});
    const err = await searchBooks('dune', new AbortController().signal).catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(WorkerDownError);
    expect((err as Error).message).toContain('502');
  });
  it('returns results on success', async () => {
    reply(200, {results: [{work: 'OL1W', title: 'Dune'}]});
    expect(await searchBooks('dune', new AbortController().signal)).toHaveLength(1);
  });
});

describe('api client requests', () => {
  it('sends the right path and parameters for work and cover lookups, and passes the abort signal', async () => {
    const calls: [string, AbortSignal | undefined][] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: string, init?: RequestInit) => {
      calls.push([u, init?.signal ?? undefined]);
      return new Response(JSON.stringify({summary: 's', genre: 'g', source: null, choices: []}), {status: 200});
    }));
    const {fetchWork, fetchCoverChoices} = await import('../src/api');
    const ctl = new AbortController();
    await fetchWork({work: 'OL1W', title: 't', author: 'a', year: null, genre: '', cover: null}, ctl.signal);
    await fetchCoverChoices('The Stranger', 'Camus', ctl.signal);
    expect(calls[0]?.[0]).toBe('/api/search?work=OL1W');
    expect(calls[1]?.[0]).toBe('/api/covers?title=The+Stranger&author=Camus');
    expect(calls.every(([, s]) => s === ctl.signal)).toBe(true);
  });

  it('throws on a 200 that is not JSON instead of returning garbage', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', {status: 200})));
    await expect(searchBooks('dune', new AbortController().signal)).rejects.toThrow();
  });
});
