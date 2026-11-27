import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createLimiter, loadCover} from '../src/covers';

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('createLimiter', () => {
  it('runs at most `max` tasks at once', async () => {
    const run = createLimiter(2);
    let active = 0;
    let peak = 0;
    const task = async () => {
      active++;
      peak = Math.max(peak, active);
      await tick();
      active--;
    };
    await Promise.all(Array.from({length: 6}, () => run(task)));
    expect(peak).toBe(2);
  });

  it('drops a waiting task whose signal aborts, without running it', async () => {
    const run = createLimiter(1);
    const ran: string[] = [];
    let release!: () => void;
    const first = run(() => new Promise<void>((r) => (release = r)));
    const ctl = new AbortController();
    const second = run(async () => void ran.push('second'), ctl.signal);
    ctl.abort();
    await expect(second).rejects.toMatchObject({name: 'AbortError'});
    release();
    await first;
    expect(ran).toEqual([]);
  });

  it('rejects at once when the signal is already aborted', async () => {
    const ctl = new AbortController();
    ctl.abort();
    await expect(createLimiter(1)(async () => 1, ctl.signal)).rejects.toMatchObject({name: 'AbortError'});
  });
});

describe('loadCover', () => {
  let n = 0;
  const url = () => `/api/cover?id=${++n}`;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // The decoder is the browser's; here every blob "decodes" to a usable image.
    vi.stubGlobal(
      'Image',
      class {
        naturalWidth = 200;
        naturalHeight = 300;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_: string) {
          queueMicrotask(() => this.onload?.());
        }
      },
    );
    fetchSpy = vi.fn((_u: string, init?: {signal?: AbortSignal}) => {
      const signal = init?.signal;
      return new Promise<Response>((resolve, reject) => {
        const t = setTimeout(() => resolve(new Response(new Blob(['x']), {status: 200})), 5);
        signal?.addEventListener('abort', () => {
          clearTimeout(t);
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    });
    vi.stubGlobal('fetch', fetchSpy);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shares one request between callers of the same url and remembers the result', async () => {
    const u = url();
    const [a, b] = await Promise.all([loadCover(u), loadCover(u)]);
    expect(a).toBe(b);
    expect(a).not.toBeNull();
    await loadCover(u);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('cancels the request once every caller has aborted, but not before', async () => {
    const u = url();
    const one = new AbortController();
    const two = new AbortController();
    const p1 = loadCover(u, {signal: one.signal});
    const p2 = loadCover(u, {signal: two.signal});
    one.abort();
    expect((await p2) && true).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await p1;

    const v = url();
    const only = new AbortController();
    const p3 = loadCover(v, {signal: only.signal});
    await tick();
    only.abort();
    expect(await p3).toBeNull();
  });

  it('does not remember a cancelled load, so it can be retried', async () => {
    const u = url();
    const ctl = new AbortController();
    const p = loadCover(u, {signal: ctl.signal});
    await tick();
    ctl.abort();
    expect(await p).toBeNull();
    expect(await loadCover(u)).not.toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('treats a 404 as a final miss, but retries after a server error', async () => {
    const miss = url();
    fetchSpy.mockImplementation(() => Promise.resolve(new Response('no', {status: 404})));
    expect(await loadCover(miss)).toBeNull();
    expect(await loadCover(miss)).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const flaky = url();
    fetchSpy.mockClear();
    fetchSpy.mockImplementationOnce(() => Promise.resolve(new Response('x', {status: 502})));
    expect(await loadCover(flaky)).toBeNull();
    fetchSpy.mockImplementation(() => Promise.resolve(new Response(new Blob(['x']), {status: 200})));
    expect(await loadCover(flaky)).not.toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('never has more than four interactive requests in flight', async () => {
    let active = 0;
    let peak = 0;
    fetchSpy.mockImplementation(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return new Response(new Blob(['x']), {status: 200});
    });
    await Promise.all(Array.from({length: 10}, () => loadCover(url())));
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1);
  });

  it('runs background loads one at a time', async () => {
    let active = 0;
    let peak = 0;
    fetchSpy.mockImplementation(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return new Response(new Blob(['x']), {status: 200});
    });
    await Promise.all(Array.from({length: 5}, () => loadCover(url(), {background: true})));
    expect(peak).toBe(1);
  });

  describe('priority', () => {
    /** Fetches stay open until released, so slot usage can be observed. */
    function gated() {
      const open = new Map<string, () => void>();
      const started: string[] = [];
      fetchSpy.mockImplementation((u: string) => {
        started.push(u);
        return new Promise<Response>((resolve) => open.set(u, () => resolve(new Response(new Blob(['x']), {status: 200}))));
      });
      return {open, started};
    }

    it('a user load does not wait for a background slot', async () => {
      const {open, started} = gated();
      const busy = url();
      const wanted = url();
      void loadCover(busy, {background: true}); // takes the only background slot
      const queued = loadCover(wanted, {background: true}); // waits behind it
      await tick();
      expect(started).toEqual([busy]);
      const user = loadCover(wanted); // the user asks for the same cover
      await tick();
      expect(started).toEqual([busy, wanted]);
      open.get(wanted)?.();
      expect(await user).not.toBeNull();
      expect(await queued).not.toBeNull(); // the queue's own caller gets the same result
      open.get(busy)?.();
      expect(started.filter((u) => u === wanted)).toHaveLength(1);
    });

    it('shares the request when the background fetch is already running', async () => {
      const {open, started} = gated();
      const u = url();
      const bg = loadCover(u, {background: true});
      await tick();
      const user = loadCover(u);
      await tick();
      expect(started).toEqual([u]);
      open.get(u)?.();
      expect(await user).toBe(await bg);
    });

    it('user loads run while the background lane is full of other work', async () => {
      const {open, started} = gated();
      const bgUrl = url();
      void loadCover(bgUrl, {background: true});
      const mine = url();
      const p = loadCover(mine);
      await tick();
      expect(started).toEqual([bgUrl, mine]);
      open.get(mine)?.();
      expect(await p).not.toBeNull();
      open.get(bgUrl)?.();
    });
  });
});

describe('anySignal', () => {
  const original = AbortSignal.any;
  afterEach(() => {
    Object.defineProperty(AbortSignal, 'any', {value: original, configurable: true, writable: true});
  });

  it('aborts when any of its inputs aborts, with the native implementation', async () => {
    const {anySignal} = await import('../src/covers');
    const a = new AbortController();
    const b = new AbortController();
    const s = anySignal([a.signal, b.signal]);
    expect(s.aborted).toBe(false);
    b.abort();
    expect(s.aborted).toBe(true);
  });

  it('still works where AbortSignal.any does not exist (Chrome before 116, Safari before 17.4)', async () => {
    Object.defineProperty(AbortSignal, 'any', {value: undefined, configurable: true, writable: true});
    const {anySignal} = await import('../src/covers');
    const a = new AbortController();
    const b = new AbortController();
    const s = anySignal([a.signal, b.signal]);
    expect(s.aborted).toBe(false);
    a.abort();
    expect(s.aborted).toBe(true);
    expect(anySignal([a.signal, b.signal]).aborted).toBe(true);
  });

  it('does not queue a cover load on a browser without AbortSignal.any', async () => {
    Object.defineProperty(AbortSignal, 'any', {value: undefined, configurable: true, writable: true});
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', {status: 404})));
    const {loadCover} = await import('../src/covers');
    await expect(loadCover('/api/cover?id=991')).resolves.toBeNull();
    vi.unstubAllGlobals();
  });
});
