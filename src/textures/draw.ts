import type {Book} from '../types';
import {TAU, clamp, hash, hsl} from '../util';
import {MIN_CONTRAST, contrastRatio, hslToRgb, luminance, spineScheme, type SpineScheme} from './contrast';

/** Literata: what a person wrote or a book owns (titles, notes, signage). Atkinson Hyperlegible Next: small interface text. */
export const SERIF = 'Literata,Georgia,serif';
export const SANS = '"Atkinson Hyperlegible Next",system-ui,sans-serif';
export const CREAM = '#f6ead4';

/** Base hue and saturation for a book: from its cover when it has one, else from the title hash. */
export interface Palette {
  h: number;
  s: number;
}
// Cover colours are pulled into a restrained band so a shelf reads as bound books, not a paint chart.
export const SPINE_SAT = [22, 48] as const;
export const SPINE_LIGHT = [28, 52] as const;
export const paletteOf = (b: Book): Palette =>
  b.tone ? {h: Math.round(b.tone.h), s: clamp(Math.round(b.tone.s), SPINE_SAT[0], SPINE_SAT[1])} : {h: b.hue, s: 40};
export const accOf = (b: Book) => hsl((paletteOf(b).h + 28) % 360, 55, 66);
/** Saturation shifted from the palette base, kept in range. */
export const sat = (p: Palette, delta: number) => clamp(p.s + delta, 0, 100);

function setLS(g: CanvasRenderingContext2D, px: number): void {
  // letterSpacing is missing in older Safari; the text just renders unspaced there.
  if ('letterSpacing' in g) g.letterSpacing = px + 'px';
}
export const letterSpacing = setLS;

export function wrapAll(g: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = String(text).replace(/\s+/g, ' ').trim().split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (!cur || g.measureText(t).width <= maxW) cur = t;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

export function wrapLines(g: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  let lines = wrapAll(g, text, maxW);
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    let last = lines[maxLines - 1] ?? '';
    while (last.length && g.measureText(last + '…').width > maxW) last = last.slice(0, -1);
    lines[maxLines - 1] = last.replace(/[\s,.;:]+$/, '') + '…';
  }
  return lines;
}

export function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function newCanvas(W: number, H: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable');
  return [c, g];
}

/** Starting lightness of a spine: the cover's own lightness, held in range, else spread by the book's pattern. */
export function spineLightness(b: Book): number {
  // A small per-book step keeps neighbours of one hue apart once the range is narrow.
  const base = b.tone ? clamp(Math.round(b.tone.l), 28, 50) + ((b.pattern % 3) - 1) * 3 : 34 + (b.pattern % 4) * 5;
  return clamp(base, SPINE_LIGHT[0], SPINE_LIGHT[1]);
}

/** Colours of a book's spine: base lightness nudged until the better of the two inks reads at 4.5:1 or more. */
export function spineLook(b: Book): {h: number; s: number} & SpineScheme {
  const p = paletteOf(b);
  return {h: p.h, s: p.s, ...spineScheme(p.h, p.s, spineLightness(b))};
}

/** Photographed book cloth (CC0, see public/textures/CREDITS.md), laid faintly over cloth and paper spines. */
const cloth = typeof Image === 'undefined' ? null : new Image();
/** Resolves once the cloth photo has loaded or failed; spines drawn before that are plain. */
export const clothReady: Promise<void> = cloth
  ? new Promise((resolve) => {
      cloth.onload = () => resolve();
      cloth.onerror = () => resolve();
      cloth.src = '/textures/cloth_diff.jpg';
    })
  : Promise.resolve();

export type BookKind = 'hardcover' | 'paperback' | 'jacket';

/** Stable per book, from its id: mostly hardcovers, some paperbacks, a few in a dust jacket. */
export function bookKind(b: Book): BookKind {
  const n = hash(b.id) % 20;
  return n < 11 ? 'hardcover' : n < 17 ? 'paperback' : 'jacket';
}

const FOIL = '#e3c26a';
const FOIL_LUM = luminance(227, 194, 106);

/** Gold foil for the lettering, only where it keeps the same 4.5:1 the ink does. The lighter end of the spine is the hard case. */
export function foilFor(look: {h: number; s: number; l: number; ink: 'light' | 'dark'}): string | null {
  if (look.ink !== 'light') return null;
  return contrastRatio(luminance(...hslToRgb(look.h, look.s, look.l)), FOIL_LUM) >= MIN_CONTRAST ? FOIL : null;
}

/** What is drawn at the head and foot of a spine, by how the book is bound. The fill is already set. */
function spineDecor(g: CanvasRenderingContext2D, W: number, H: number, b: Book, kind: BookKind): void {
  const top = H * 0.05;
  const foot = H * 0.95;
  if (kind === 'hardcover') return spineOrnament(g, W, H, b.pattern);
  if (kind === 'paperback') {
    // A publisher's strip at the head and nothing else: paperbacks are plain.
    g.fillRect(0, top - 4, W, 4);
    return;
  }
  // Dust jacket: a printed band, a pair of rules and a round imprint at the foot.
  g.fillRect(0, H * 0.035, W, H * 0.028);
  g.fillRect(0, H * 0.075, W, 2);
  g.fillRect(0, foot - 12, W, 2);
  g.beginPath();
  g.arc(W / 2, foot + 2, Math.min(W * 0.16, 12), 0, TAU);
  g.lineWidth = 3;
  g.strokeStyle = g.fillStyle;
  g.stroke();
}

/** Thin dark grooves just inside each edge, where the cover board meets the spine. */
function hingeGrooves(g: CanvasRenderingContext2D, W: number, H: number, gap: number, style: string): void {
  g.fillStyle = style;
  g.fillRect(gap + W * 0.07, 0, 2, H);
  g.fillRect(W - gap - W * 0.07 - 2, 0, 2, H);
}

/**
 * Rules and a small emblem at the head and foot of a spine, one of four styles by the book's pattern.
 * They stay in the top and bottom tenth, clear of the title and author, so contrast is unaffected.
 */
function spineOrnament(g: CanvasRenderingContext2D, W: number, H: number, pattern: number): void {
  const rule = (y: number, t: number): void => g.fillRect(0, y, W, t);
  const top = H * 0.05;
  const foot = H * 0.95;
  const r = Math.min(W * 0.09, 8);
  switch (pattern) {
    case 1:
      rule(top, 7);
      for (const dy of [-18, -9, 0]) rule(foot + dy, 2);
      break;
    case 2:
      g.beginPath();
      g.moveTo(W / 2, top - r * 1.6);
      g.lineTo(W / 2 + r * 1.2, top);
      g.lineTo(W / 2, top + r * 1.6);
      g.lineTo(W / 2 - r * 1.2, top);
      g.closePath();
      g.fill();
      rule(foot - 6, 5);
      rule(foot - 16, 2);
      break;
    case 3:
      rule(top - 8, 2);
      rule(top, 5);
      rule(top + 10, 2);
      for (const dx of [-3, 0, 3]) {
        g.beginPath();
        g.arc(W / 2 + dx * r, foot - 6, r * 0.5, 0, TAU);
        g.fill();
      }
      break;
    default:
      rule(top, 5);
      rule(top + 12, 2);
      rule(foot - 6, 5);
      rule(foot - 16, 2);
  }
}

/** Paper edge for the top, bottom and fore-edge of a book: fine sheet lines, darker where the cover boards overhang. */
export function pagesCanvas(): HTMLCanvasElement {
  const S = 128;
  const [c, g] = newCanvas(S, S);
  g.fillStyle = '#efe6d0';
  g.fillRect(0, 0, S, S);
  // Sheets are stacked across the book's thickness (u), so the lines run along v.
  for (let x = 0; x < S; x += 2) {
    g.fillStyle = `rgba(110,90,60,${x % 6 === 0 ? 0.2 : 0.1})`;
    g.fillRect(x, 0, 1, S);
  }
  const shade = (x0: number, y0: number, x1: number, y1: number): void => {
    const grd = g.createLinearGradient(x0, y0, x1, y1);
    grd.addColorStop(0, 'rgba(40,26,12,.55)');
    grd.addColorStop(1, 'rgba(40,26,12,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
  };
  shade(0, 0, S * 0.12, 0);
  shade(S, 0, S * 0.88, 0);
  shade(0, 0, 0, S * 0.1);
  shade(0, S, 0, S * 0.9);
  return c;
}

export function spineCanvas(b: Book): HTMLCanvasElement {
  const S = 400;
  const W = Math.round(b.w * S);
  const H = Math.round(b.h * S);
  const [c, g] = newCanvas(W, H);
  const look = spineLook(b);
  // The gradient moves away from the ink's colour, so shading never costs contrast.
  const drift = look.ink === 'light' ? -9 : 9;
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, hsl(look.h, look.s, look.l));
  grd.addColorStop(1, hsl(look.h, look.s, look.l + drift));
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  const kind = bookKind(b);
  const weave = cloth?.complete && cloth.naturalWidth && kind !== 'jacket' ? g.createPattern(cloth, 'repeat') : null;
  if (weave) {
    g.save();
    g.filter = 'grayscale(1)';
    g.globalCompositeOperation = 'soft-light';
    g.globalAlpha = 0.7;
    g.scale(0.4, 0.4);
    g.fillStyle = weave;
    g.fillRect(0, 0, W / 0.4, H / 0.4);
    g.restore();
  }
  // Gold foil lettering on some hardcovers, where it reads as well as the ink would.
  // A label panel on some hardcovers, shaded away from the ink so the lettering only gains contrast.
  if (kind === 'hardcover' && b.pattern === 3) {
    g.fillStyle = hsl(look.h, look.s, look.l + (look.ink === 'light' ? -12 : 12));
    g.globalAlpha = 0.55;
    g.fillRect(W * 0.14, H * 0.085, W * 0.72, H * 0.64);
    g.globalAlpha = 0.5;
    g.strokeStyle = look.inkCss;
    g.lineWidth = 2;
    g.strokeRect(W * 0.14 + 4, H * 0.085 + 4, W * 0.72 - 8, H * 0.64 - 8);
    g.globalAlpha = 1;
  }
  const foil = kind === 'hardcover' && hash(b.id + 'foil') % 3 === 0 ? foilFor(look) : null;
  g.fillStyle = foil ?? look.inkCss;
  g.globalAlpha = 0.85;
  spineDecor(g, W, H, b, kind);
  g.globalAlpha = 1;
  g.textBaseline = 'middle';
  let fs = Math.min(W * 0.52, 76);
  g.font = `700 ${fs}px ${SERIF}`;
  const maxT = H * 0.62;
  while (g.measureText(b.title).width > maxT && fs > 14) {
    fs -= 2;
    g.font = `700 ${fs}px ${SERIF}`;
  }
  g.save();
  g.translate(W / 2, H * 0.1);
  g.rotate(Math.PI / 2);
  g.textAlign = 'left';
  g.fillText(b.title, 0, 0);
  g.restore();
  if (b.author) {
    let f2 = Math.min(W * 0.34, 34);
    g.font = `500 ${f2}px ${SANS}`;
    const maxA = H * 0.2;
    while (g.measureText(b.author).width > maxA && f2 > 11) {
      f2 -= 1;
      g.font = `500 ${f2}px ${SANS}`;
    }
    g.save();
    g.translate(W / 2, H * 0.9);
    g.rotate(Math.PI / 2);
    g.textAlign = 'right';
    g.fillText(b.author, 0, 0);
    g.restore();
  }
  // Dark gaps and a lit edge so each spine reads as its own object against its neighbours and the wood.
  const gap = Math.max(6, Math.round(W * 0.05));
  g.fillStyle = 'rgba(8,6,4,.7)';
  g.fillRect(0, 0, gap, H);
  g.fillRect(W - gap, 0, gap, H);
  g.fillStyle = 'rgba(255,255,255,.22)';
  g.fillRect(gap, 0, 2, H);
  if (kind !== 'paperback') hingeGrooves(g, W, H, gap, 'rgba(0,0,0,.28)');
  // The spine is rounded: dark towards both edges, lit in the middle.
  const round = g.createLinearGradient(0, 0, W, 0);
  round.addColorStop(0, 'rgba(0,0,0,.42)');
  round.addColorStop(0.35, 'rgba(255,240,210,' + (kind === 'jacket' ? '.2' : '.1') + ')');
  round.addColorStop(0.65, 'rgba(255,240,210,0)');
  round.addColorStop(1, 'rgba(0,0,0,.45)');
  g.fillStyle = round;
  g.fillRect(0, 0, W, H);
  // Wear: the head is sun-faded, and the corners are rubbed lighter where a book is pulled off the shelf.
  const fade = g.createLinearGradient(0, 0, 0, H * 0.3);
  fade.addColorStop(0, 'rgba(255,236,190,.12)');
  fade.addColorStop(1, 'rgba(255,236,190,0)');
  g.fillStyle = fade;
  g.fillRect(gap, 0, W - 2 * gap, H * 0.3);
  g.fillStyle = 'rgba(255,255,255,.07)';
  g.fillRect(gap, 0, W - 2 * gap, H * 0.012);
  g.fillRect(gap, H * 0.988, W - 2 * gap, H * 0.012);
  if (kind === 'paperback') {
    // Soft vertical creases and two stress cracks across the spine.
    g.fillStyle = 'rgba(255,255,255,.13)';
    g.fillRect(W * 0.34, 0, 1.5, H);
    g.fillRect(W * 0.64, 0, 1.5, H);
    g.fillStyle = 'rgba(255,255,255,.2)';
    g.fillRect(W * 0.3, H * 0.41, W * 0.4, 1.5);
    g.fillRect(W * 0.35, H * 0.64, W * 0.3, 1.5);
  }
  return c;
}

/** Generated cover, used when a book has no real cover image. */
export function drawCover(b: Book, W: number, H: number): HTMLCanvasElement {
  const [c, g] = newCanvas(W, H);
  const p = paletteOf(b);
  const grd = g.createLinearGradient(0, 0, W, H);
  grd.addColorStop(0, hsl(p.h, sat(p, 2), 32));
  grd.addColorStop(1, hsl(p.h, sat(p, 10), 15));
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  const acc = accOf(b);
  g.save();
  g.strokeStyle = acc;
  g.fillStyle = acc;
  g.globalAlpha = 0.22;
  g.lineWidth = Math.max(1.5, W * 0.006);
  if (b.pattern === 0) {
    for (let i = 1; i < 8; i++) {
      g.beginPath();
      g.arc(W * 0.85, H * 0.92, i * W * 0.13, 0, TAU);
      g.stroke();
    }
  } else if (b.pattern === 1) {
    for (let x = -H; x < W + H; x += W * 0.07) {
      g.beginPath();
      g.moveTo(x, H);
      g.lineTo(x + H, 0);
      g.stroke();
    }
  } else if (b.pattern === 2) {
    g.beginPath();
    g.arc(W * 0.5, H * 0.6, W * 0.27, 0, TAU);
    g.fill();
  } else {
    for (let y = H * 0.55; y < H; y += W * 0.09)
      for (let x = W * 0.06; x < W; x += W * 0.09) {
        g.beginPath();
        g.arc(x, y, W * 0.012, 0, TAU);
        g.fill();
      }
  }
  g.restore();
  g.strokeStyle = acc;
  g.globalAlpha = 0.55;
  g.lineWidth = Math.max(2, W * 0.008);
  g.strokeRect(W * 0.055, W * 0.055, W * 0.89, H - W * 0.11);
  g.globalAlpha = 1;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = acc;
  g.font = `500 ${W * 0.045}px ${SANS}`;
  setLS(g, W * 0.01);
  g.fillText(b.genre.toUpperCase(), W / 2, H * 0.1, W * 0.8);
  setLS(g, 0);
  let fs = W * 0.125;
  let lines: string[] = [];
  for (; fs > W * 0.05; fs -= 2) {
    g.font = `700 ${fs}px ${SERIF}`;
    lines = wrapAll(g, b.title, W * 0.76);
    if (lines.length * fs * 1.15 <= H * 0.46) break;
  }
  const lh = fs * 1.15;
  const y0 = H * 0.42 - ((lines.length - 1) * lh) / 2;
  g.fillStyle = CREAM;
  lines.forEach((l, i) => g.fillText(l, W / 2, y0 + i * lh));
  g.fillStyle = acc;
  g.fillRect(W * 0.44, H * 0.8, W * 0.12, Math.max(2, W * 0.006));
  if (b.author) {
    g.fillStyle = CREAM;
    g.font = `500 ${W * 0.06}px ${SANS}`;
    wrapLines(g, b.author, W * 0.74, 2).forEach((l, i) => g.fillText(l, W / 2, H * 0.865 + i * W * 0.075));
  }
  return c;
}
