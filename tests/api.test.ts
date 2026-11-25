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
