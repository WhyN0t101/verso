import {describe, expect, it, vi} from 'vitest';
import {createToneQueue} from '../src/toneQueue';
import {makeBook} from '../src/data/books';
import type {Book, Tone} from '../src/types';

const img = {} as HTMLImageElement;
const tone: Tone = {h: 10, s: 20, l: 30};
const withCover = (title: string, extra: Partial<Book> = {}): Book => ({...makeBook({title, cover: `/api/cover?id=${title.length}`}), ...extra});

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return {promise, resolve};
}

describe('tone queue', () => {
  it('stores a tone on books that have a cover but none', async () => {
    const onTone = vi.fn();
    const q = createToneQueue({load: async () => img, analyse: () => tone, onTone, breathe: async () => undefined});
    const a = withCover('A');
    const plain = makeBook({title: 'No cover'});
    q.add([a, plain]);
    await q.idle();
    expect(a.tone).toEqual(tone);
    expect(plain.tone).toBeUndefined();
    expect(onTone).toHaveBeenCalledTimes(1);
  });

  it('leaves a stored tone alone and loads nothing for it', async () => {
    const load = vi.fn(async () => img);
    const q = createToneQueue({load, analyse: () => tone, onTone: vi.fn(), breathe: async () => undefined});
    const b = withCover('B', {tone: {h: 1, s: 2, l: 3}});
    q.add([b]);
    await q.idle();
    expect(load).not.toHaveBeenCalled();
    expect(b.tone).toEqual({h: 1, s: 2, l: 3});
  });

  it('never runs more than the concurrency limit at once, and caps it at 2', async () => {
    let active = 0;
    let peak = 0;
    const gates: ReturnType<typeof deferred<void>>[] = [];
    const load = async () => {
      active++;
      peak = Math.max(peak, active);
      const g = deferred<void>();
      gates.push(g);
      await g.promise;
      active--;
      return img;
    };
    const q = createToneQueue({load, analyse: () => tone, onTone: vi.fn(), concurrency: 9, breathe: async () => undefined});
    q.add(['a', 'bb', 'ccc', 'dddd', 'eeeee'].map((t) => withCover(t)));
    await Promise.resolve();
    expect(gates.length).toBe(2);
    while (gates.length) {
      gates.shift()?.resolve();
      await new Promise((r) => setTimeout(r, 0));
    }
    await q.idle();
    expect(peak).toBe(2);
  });

  it('tries a book once per queue and survives a failing load', async () => {
    const load = vi.fn(async () => {
      throw new Error('network');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const q = createToneQueue({load, analyse: () => tone, onTone: vi.fn(), breathe: async () => undefined});
    const b = withCover('C');
    q.add([b]);
    await q.idle();
    q.add([b]);
    await q.idle();
    expect(load).toHaveBeenCalledTimes(1);
    expect(b.tone).toBeUndefined();
  });

  it('lets the page breathe between jobs', async () => {
    const breathe = vi.fn(async () => undefined);
    const q = createToneQueue({load: async () => img, analyse: () => tone, onTone: vi.fn(), breathe});
    q.add([withCover('x'), withCover('yy')]);
    await q.idle();
    expect(breathe).toHaveBeenCalledTimes(2);
  });
});

describe('tone queue, more cases', () => {
  it('survives an analyser that throws and still handles the next book', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const analyse = vi.fn().mockImplementationOnce(() => { throw new Error('canvas'); }).mockReturnValue(tone);
    const q = createToneQueue({load: async () => img, analyse, onTone: vi.fn(), breathe: async () => undefined});
    const bad = withCover('bad');
    const good = withCover('good!');
    q.add([bad, good]);
    await q.idle();
    expect(bad.tone).toBeUndefined();
    expect(good.tone).toEqual(tone);
  });

  it('does not overwrite a tone the book gained while its cover was loading', async () => {
    const gate = deferred<HTMLImageElement>();
    const onTone = vi.fn();
    const q = createToneQueue({load: () => gate.promise, analyse: () => tone, onTone, breathe: async () => undefined});
    const b = withCover('Race');
    q.add([b]);
    b.tone = {h: 1, s: 1, l: 1};
    gate.resolve(img);
    await q.idle();
    expect(b.tone).toEqual({h: 1, s: 1, l: 1});
    expect(onTone).not.toHaveBeenCalled();
  });

  it('is idle at once when nothing was queued, and picks up books added while running', async () => {
    const q = createToneQueue({load: async () => img, analyse: () => tone, onTone: vi.fn(), breathe: async () => undefined});
    await q.idle();
    const a = withCover('first');
    const b = withCover('second one');
    q.add([a]);
    q.add([b]);
    await q.idle();
    expect(a.tone).toEqual(tone);
    expect(b.tone).toEqual(tone);
  });
});
