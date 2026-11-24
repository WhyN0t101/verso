import type {Tone} from './types';
import {clamp} from './util';

const MIN_SIDE = 60;
const cache = new Map<string, Promise<HTMLImageElement | null>>();

/**
 * Loads a cover from our own /api/cover proxy (same origin, so canvases stay untainted).
 * Resolves null when the cover is missing or is a placeholder-sized image, so callers use the generated cover.
 */
export function loadCover(url: string): Promise<HTMLImageElement | null> {
  let p = cache.get(url);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img.naturalWidth >= MIN_SIDE && img.naturalHeight >= MIN_SIDE ? img : null);
      img.onerror = () => resolve(null);
      img.src = url;
    });
    cache.set(url, p);
  }
  return p;
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
