import type {Tone} from './types';
import {clamp} from './util';

const MIN_SIDE = 60;
const INTERACTIVE_SLOTS = 4;
const BACKGROUND_SLOTS = 1;

const abortError = (): DOMException => new DOMException('aborted', 'AbortError');

/** Runs tasks at most `max` at a time. A task still waiting for a slot is dropped when its signal aborts. */
export function createLimiter(max: number): <T>(task: () => Promise<T>, signal?: AbortSignal) => Promise<T> {
  let active = 0;
  const waiting: (() => void)[] = [];
  const next = (): void => {
    while (active < max && waiting.length) waiting.shift()?.();
  };
  return (task, signal) =>
    new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(abortError());
      const start = (): void => {
        signal?.removeEventListener('abort', onAbort);
        active++;
        task()
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      };
      const onAbort = (): void => {
        const at = waiting.indexOf(start);
        if (at < 0) return;
        waiting.splice(at, 1);
        reject(abortError());
      };
      signal?.addEventListener('abort', onAbort, {once: true});
      waiting.push(start);
      next();
    });
}

const interactive = createLimiter(INTERACTIVE_SLOTS);
const background = createLimiter(BACKGROUND_SLOTS);

type Outcome = {img: HTMLImageElement | null; final: boolean};

/** Fetches (cancellably) and decodes a cover. `final` is false for transient failures, which must not be remembered. */
async function fetchImage(url: string, signal: AbortSignal): Promise<Outcome> {
  const r = await fetch(url, {signal});
  if (!r.ok) return {img: null, final: r.status < 500};
  const objectUrl = URL.createObjectURL(await r.blob());
  try {
    const img = await new Promise<HTMLImageElement | null>((resolve) => {
      const el = new Image();
      el.onload = () => resolve(el.naturalWidth >= MIN_SIDE && el.naturalHeight >= MIN_SIDE ? el : null);
      el.onerror = () => resolve(null);
      el.src = objectUrl;
    });
    return {img, final: true};
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

interface InFlight {
  promise: Promise<HTMLImageElement | null>;
  ctl: AbortController;
  /** Callers still interested. Callers without a signal never leave. */
  users: number;
}
const inflight = new Map<string, InFlight>();
const settled = new Map<string, HTMLImageElement | null>();

export interface LoadOptions {
  /** Aborting drops this caller; the request itself stops once no caller is left. */
  signal?: AbortSignal;
  /** Low priority lane for work nobody is waiting on (tone extraction). */
  background?: boolean;
}

/**
 * Loads a cover from our own /api/cover proxy (same origin, so canvases stay untainted). Identical urls share
 * one request. Resolves null when the cover is missing, unusable, cancelled or failed, so callers use the
 * generated cover; only definitive answers are remembered, so a cancelled or failed load can be retried.
 */
export function loadCover(url: string, opts: LoadOptions = {}): Promise<HTMLImageElement | null> {
  if (opts.signal?.aborted) return Promise.resolve(null);
  if (settled.has(url)) return Promise.resolve(settled.get(url) ?? null);
  let entry = inflight.get(url);
  if (!entry) {
    const ctl = new AbortController();
    const lane = opts.background ? background : interactive;
    const promise = lane(() => fetchImage(url, ctl.signal), ctl.signal)
      .then((o) => {
        if (o.final) settled.set(url, o.img);
        return o.img;
      })
      .catch((err: unknown) => {
        if (!(err instanceof DOMException && err.name === 'AbortError')) console.warn('cover failed', url, err);
        return null;
      })
      .finally(() => {
        if (inflight.get(url)?.ctl === ctl) inflight.delete(url);
      });
    entry = {promise, ctl, users: 0};
    inflight.set(url, entry);
  }
  entry.users++;
  const e = entry;
  opts.signal?.addEventListener(
    'abort',
    () => {
      if (--e.users <= 0) {
        e.ctl.abort();
        if (inflight.get(url) === e) inflight.delete(url);
      }
    },
    {once: true},
  );
  return e.promise;
}

/** The proxy serves medium by default; the export card draws the cover large and asks for L. */
export const largeCover = (url: string): string => (/[?&]size=/.test(url) ? url.replace(/size=[A-Za-z]/, 'size=L') : `${url}&size=L`);

const BINS = 24;

/**
 * Dominant colour of an image: hue histogram weighted by saturation and mid lightness, so a red cover with a
 * big white title block still reads red. Greyscale covers return a low-saturation tone.
 */
export function dominantTone(img: HTMLImageElement): Tone {
  const S = 48;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d', {willReadFrequently: true});
  if (!g) throw new Error('2D canvas unavailable');
  g.drawImage(img, 0, 0, S, S);
  const px = g.getImageData(0, 0, S, S).data;
  const weight = new Float64Array(BINS);
  const sx = new Float64Array(BINS);
  const sy = new Float64Array(BINS);
  const sSum = new Float64Array(BINS);
  const lSum = new Float64Array(BINS);
  let grey = 0;
  let greyL = 0;
  for (let i = 0; i < px.length; i += 4) {
    const [h, s, l] = rgbToHsl(px[i] ?? 0, px[i + 1] ?? 0, px[i + 2] ?? 0);
    grey += 1;
    greyL += l;
    const w = s * (1 - Math.abs(2 * l - 1)) ** 2;
    if (w < 0.02) continue;
    const bin = Math.min(BINS - 1, Math.floor((h / 360) * BINS));
    weight[bin] = (weight[bin] ?? 0) + w;
    sx[bin] = (sx[bin] ?? 0) + Math.cos((h * Math.PI) / 180) * w;
    sy[bin] = (sy[bin] ?? 0) + Math.sin((h * Math.PI) / 180) * w;
    sSum[bin] = (sSum[bin] ?? 0) + s * w;
    lSum[bin] = (lSum[bin] ?? 0) + l * w;
  }
  let best = -1;
  let bestW = 0;
  for (let b = 0; b < BINS; b++) {
    if ((weight[b] ?? 0) > bestW) {
      bestW = weight[b] ?? 0;
      best = b;
    }
  }
  if (best < 0) return {h: 30, s: 6, l: clamp(Math.round((greyL / Math.max(grey, 1)) * 100), 0, 100)};
  const w = weight[best] as number;
  const h = (Math.atan2((sy[best] as number) / w, (sx[best] as number) / w) * 180) / Math.PI;
  return {h: Math.round((h + 360) % 360), s: Math.round(((sSum[best] as number) / w) * 100), l: Math.round(((lSum[best] as number) / w) * 100)};
}

function rgbToHsl(r8: number, g8: number, b8: number): [number, number, number] {
  const r = r8 / 255;
  const g = g8 / 255;
  const b = b8 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}
