import type {Book} from '../types';
import {paletteOf, sat} from '../textures/draw';
import {contrastRatio, hslToRgb, luminance} from '../textures/contrast';
import {clamp, hsl} from '../util';

export type ThemeId = 'classic' | 'paper' | 'bold' | 'minimal' | 'shelf';

export interface Theme {
  id: ThemeId;
  label: string;
  ink: string;
  mute: string;
  /** Rule, stars and header text. */
  accent: (b: Book) => string;
  /** The cover stands on a wooden plank. */
  plank?: boolean;
  /** Soft drop shadow under the cover. */
  shadow: number;
  paint: (g: CanvasRenderingContext2D, W: number, H: number, b: Book) => void;
}

function vertical(g: CanvasRenderingContext2D, H: number, top: string, bottom: string): void {
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bottom);
  g.fillStyle = grad;
}

/** The Bold theme's muted text is white at this opacity (see its `mute`). */
const BOLD_MUTE_ALPHA = 0.85;

/** Lightness at or below `l` where the Bold theme's muted white text still reaches 4.5:1 on the hue. */
export function boldLightness(h: number, s: number, l: number): number {
  for (let at = l; at > 4; at--) {
    const [r, g, b] = hslToRgb(h, s, at);
    const over = (v: number) => Math.round(255 * BOLD_MUTE_ALPHA + v * (1 - BOLD_MUTE_ALPHA));
    if (contrastRatio(luminance(over(r), over(g), over(b)), luminance(r, g, b)) >= 4.5) return at;
  }
  return 4;
}

export const THEMES: Theme[] = [
  {
    id: 'classic',
    label: 'Classic',
    ink: '#f6ead4',
    mute: 'rgba(246,234,212,.74)',
    // Lighter than the spine accent: it must read as text on the glow behind the header.
    accent: (b) => hsl((paletteOf(b).h + 28) % 360, 60, 86),
    shadow: 60,
    paint(g, W, H, b) {
      const p = paletteOf(b);
      vertical(g, H, hsl(p.h, sat(p, -2), 24), hsl(p.h, sat(p, 2), 7));
      g.fillRect(0, 0, W, H);
      const gl = g.createRadialGradient(W * 0.5, H * 0.3, 20, W * 0.5, H * 0.3, W * 0.85);
      gl.addColorStop(0, hsl((p.h + 20) % 360, 60, 60, 0.28));
      gl.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gl;
      g.fillRect(0, 0, W, H);
    },
  },
  {
    id: 'paper',
    label: 'Paper',
    ink: '#2a2118',
    mute: 'rgba(42,33,24,.72)',
    accent: (b) => hsl(paletteOf(b).h, 50, 22),
    shadow: 34,
    paint(g, W, H) {
      vertical(g, H, '#f6eedf', '#e8dcc3');
      g.fillRect(0, 0, W, H);
      const v = g.createRadialGradient(W / 2, H / 2, W * 0.4, W / 2, H / 2, H * 0.8);
      v.addColorStop(0, 'rgba(120,90,50,0)');
      v.addColorStop(1, 'rgba(120,90,50,.16)');
      g.fillStyle = v;
      g.fillRect(0, 0, W, H);
    },
  },
  {
    id: 'bold',
    label: 'Bold',
    ink: '#ffffff',
    mute: 'rgba(255,255,255,.85)',
    accent: () => '#ffffff',
    shadow: 50,
    paint(g, W, H, b) {
      const p = paletteOf(b);
      const s = clamp(p.s + 28, 50, 78);
      const h2 = (p.h + 16) % 360;
      // Yellows and greens are bright at any saturation, so lightness is lowered per hue until white text reads.
      vertical(g, H, hsl(p.h, s, boldLightness(p.h, s, 40)), hsl(h2, s, boldLightness(h2, s, 28)));
      g.fillRect(0, 0, W, H);
    },
  },
  {
    id: 'minimal',
    label: 'Minimal',
    ink: '#141414',
    mute: 'rgba(20,20,20,.68)',
    accent: () => '#141414',
    shadow: 24,
    paint(g, W, H) {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, W, H);
    },
  },
  {
    id: 'shelf',
    label: 'Spine shelf',
    ink: '#f6ead4',
    mute: 'rgba(246,234,212,.78)',
    accent: () => '#f2b650',
    plank: true,
    shadow: 40,
    paint(g, W, H, b) {
      vertical(g, H, '#3b2718', '#170e08');
      g.fillRect(0, 0, W, H);
      // Faint grain: fixed per book so the same card renders the same each time.
      let seed = b.hue + 7;
      for (let i = 0; i < 70; i++) {
        seed = (seed * 9301 + 49297) % 233280;
        const x = (seed / 233280) * W;
        g.fillStyle = `rgba(0,0,0,${0.04 + (i % 5) * 0.012})`;
        g.fillRect(x, 0, 2 + (i % 3), H);
      }
    },
  },
];

export const themeById = (id: ThemeId): Theme => THEMES.find((t) => t.id === id) ?? THEMES[0]!;

