import {describe, expect, it} from 'vitest';
import {boldLightness, themeById} from '../src/export/themes';
import type {Book} from '../src/types';
import {contrastRatio, hslToRgb, luminance} from '../src/textures/contrast';

describe('Bold theme contrast', () => {
  it('keeps white muted text at 4.5:1 on every hue, and leaves dark hues alone', () => {
    for (let h = 0; h < 360; h += 5) {
      for (const s of [50, 78]) {
        const [r, g, b] = hslToRgb(h, s, boldLightness(h, s, 40));
        const over = (v: number) => Math.round(255 * 0.85 + v * 0.15);
        expect(contrastRatio(luminance(over(r), over(g), over(b)), luminance(r, g, b))).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(boldLightness(240, 78, 40)).toBe(40);
  });
});

describe('Classic and Paper accent contrast', () => {
  const rgbOf = (css: string): [number, number, number] => {
    const m = /hsl\((\d+),(\d+)%,(\d+)%\)/.exec(css);
    if (!m) throw new Error(css);
    return hslToRgb(Number(m[1]), Number(m[2]), Number(m[3]));
  };
  const lum = (c: number[]) => luminance(c[0] as number, c[1] as number, c[2] as number);
  const book = (hue: number) => ({hue}) as Book;

  it('Classic accent text reads on the lifted background at the top of the card', () => {
    for (let h = 0; h < 360; h += 5) {
      const base = hslToRgb(h, 46, 24); // tone saturation tops out at 48, the card uses it minus 2
      const glow = hslToRgb((h + 20) % 360, 60, 60);
      const bg = base.map((v, i) => v * 0.88 + (glow[i] as number) * 0.12); // the glow is about 12% where the header text sits
      expect(contrastRatio(lum(rgbOf(themeById('classic').accent(book(h)))), lum(bg))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('Paper accent text reads on the vignetted paper', () => {
    const bg = lum([0xe8 * 0.84 + 120 * 0.16, 0xdc * 0.84 + 90 * 0.16, 0xc3 * 0.84 + 50 * 0.16]);
    for (let h = 0; h < 360; h += 5) {
      expect(contrastRatio(lum(rgbOf(themeById('paper').accent(book(h)))), bg)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
