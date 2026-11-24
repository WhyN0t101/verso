import type {Book} from '../types';
import {hsl} from '../util';
import {CREAM, SANS, SERIF, accOf, drawCover, letterSpacing, paletteOf, roundRect, sat, wrapAll, wrapLines} from '../textures/draw';

export type CardFormat = 'post' | 'story' | 'square';
const SIZES: Record<CardFormat, [number, number]> = {post: [1080, 1350], story: [1080, 1920], square: [1080, 1080]};

/** Draws the shareable card. Fonts must already be loaded; `cover` must be same-origin so the canvas stays untainted. */
export function drawCard(b: Book, fmt: CardFormat, cover: HTMLImageElement | null): HTMLCanvasElement {
  const [W, H] = SIZES[fmt];
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable');
  const p = paletteOf(b);
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, hsl(p.h, sat(p, -2), 24));
  bg.addColorStop(1, hsl(p.h, sat(p, 2), 7));
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  const gl = g.createRadialGradient(W * 0.5, H * 0.3, 20, W * 0.5, H * 0.3, W * 0.85);
  gl.addColorStop(0, hsl((p.h + 20) % 360, 60, 60, 0.28));
  gl.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gl;
  g.fillRect(0, 0, W, H);
  const acc = accOf(b);
  const pad = 84;
  g.textBaseline = 'alphabetic';
  g.font = `600 24px ${SANS}`;
  letterSpacing(g, 6);
  g.fillStyle = acc;
  g.textAlign = 'left';
  g.fillText('VERSO', pad, pad + 8);
  g.textAlign = 'right';
  g.fillText(b.genre.toUpperCase(), W - pad, pad + 8, W / 2 - pad);
  letterSpacing(g, 0);

  const square = fmt === 'square';
  const ch = fmt === 'story' ? 820 : square ? 700 : 540;
  const aspect = cover ? cover.naturalWidth / cover.naturalHeight : b.d / b.h;
  const face = cover ?? drawCover(b, Math.round(b.d * 520), Math.round(b.h * 520));
  const cw = Math.min(ch * aspect, W - pad * 2);
  const cx = square ? pad : (W - cw) / 2;
  const cy = fmt === 'story' ? 200 : square ? 175 : 150;
  g.save();
  g.shadowColor = 'rgba(0,0,0,.6)';
  g.shadowBlur = 60;
  g.shadowOffsetY = 30;
  roundRect(g, cx, cy, cw, ch, 10);
  g.fillStyle = '#000';
  g.fill();
  g.restore();
  g.save();
  roundRect(g, cx, cy, cw, ch, 10);
  g.clip();
  g.drawImage(face, cx, cy, cw, ch);
  const hg = g.createLinearGradient(cx, 0, cx + cw * 0.1, 0);
  hg.addColorStop(0, 'rgba(0,0,0,.35)');
  hg.addColorStop(0.35, 'rgba(255,255,255,.16)');
  hg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hg;
  g.fillRect(cx, cy, cw * 0.1, ch);
  g.restore();

  const align: CanvasTextAlign = square ? 'left' : 'center';
  const tx = square ? cx + cw + 64 : W / 2;
  const tw = square ? W - pad - tx : W - pad * 2;
  let y = square ? cy + 40 : cy + ch + 78;
  const bottom = H - pad - 54;
  g.textAlign = align;

  if (b.rating > 0) {
    g.font = `40px ${SANS}`;
    const sw = 48;
    const startX = align === 'center' ? tx - (sw * 5) / 2 : tx;
    g.textAlign = 'left';
    for (let i = 0; i < 5; i++) {
      g.fillStyle = acc;
      g.globalAlpha = i < b.rating ? 1 : 0.22;
      g.fillText('★', startX + i * sw, y);
    }
    g.globalAlpha = 1;
    g.textAlign = align;
    y += square ? 66 : 70;
  }
  let tfs = square ? 54 : fmt === 'story' ? 72 : 64;
  g.font = `700 ${tfs}px ${SERIF}`;
  const maxTL = square ? 4 : 2;
  while (wrapAll(g, b.title, tw).length > maxTL && tfs > 34) {
    tfs -= 2;
    g.font = `700 ${tfs}px ${SERIF}`;
  }
  g.fillStyle = CREAM;
  wrapLines(g, b.title, tw, maxTL).forEach((l) => {
    g.fillText(l, tx, y);
    y += tfs * 1.14;
  });
  y += 6;
  if (b.author) {
    g.font = `500 ${square ? 30 : 34}px ${SANS}`;
    g.fillStyle = 'rgba(246,234,212,.74)';
    wrapLines(g, 'by ' + b.author, tw, 2).forEach((l) => {
      g.fillText(l, tx, y + 10);
      y += square ? 40 : 44;
    });
  }
  y += 22;
  g.fillStyle = acc;
  g.fillRect(align === 'center' ? tx - 30 : tx, y, 60, 4);
  y += 62;
  const text = b.notes.trim() || b.summary.trim();
  if (text) {
    const quote = b.notes.trim() ? `“${text}”` : text;
    const nfs = square ? 32 : fmt === 'story' ? 42 : 38;
    const nlh = nfs * 1.38;
    g.font = `italic 400 ${nfs}px ${SERIF}`;
    g.fillStyle = CREAM;
    const maxL = Math.floor((bottom - y) / nlh);
    if (maxL >= 1)
      wrapLines(g, quote, tw, Math.min(maxL, fmt === 'story' ? 10 : 7)).forEach((l) => {
        g.fillText(l, tx, y);
        y += nlh;
      });
  }
  g.textAlign = 'center';
  g.font = `500 22px ${SANS}`;
  letterSpacing(g, 3);
  g.fillStyle = 'rgba(246,234,212,.5)';
  g.fillText('SHELVED WITH VERSO', W / 2, H - pad + 6);
  letterSpacing(g, 0);
  return c;
}
