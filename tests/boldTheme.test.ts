import {describe, expect, it} from 'vitest';
import {BOLD_MUTE_ALPHA, CLASSIC_BASE, CLASSIC_GLOW, PAPER, boldLightness, classicGlowAt, themeById} from '../src/export/themes';
import {CARD_PAD, SIZES} from '../src/export/card';
import {SPINE_SAT} from '../src/textures/draw';
import {makeBook} from '../src/data/books';
import {contrastRatio, hslToRgb, luminance} from '../src/textures/contrast';

const lum = (c: readonly number[]) => luminance(c[0] as number, c[1] as number, c[2] as number);
const mix = (top: readonly number[], under: readonly number[], alpha: number) => top.map((v, i) => v * alpha + (under[i] as number) * (1 - alpha));
const bookOfHue = (hue: number) => ({...makeBook({title: 't'}), hue});
const rgbOf = (css: string): [number, number, number] => {
  const m = /hsl\((\d+),(\d+)%,(\d+)%\)/.exec(css);
  if (!m) throw new Error(css);
  return hslToRgb(Number(m[1]), Number(m[2]), Number(m[3]));
};
/** Header text spans the card's width at this baseline and cap height; the genre label can start at the middle. */
const headerPoints = (W: number): [number, number][] => {
  const pts: [number, number][] = [];
  for (let x = CARD_PAD; x <= W - CARD_PAD; x += 54) for (const y of [CARD_PAD - 20, CARD_PAD + 8]) pts.push([x, y]);
  return pts;
};

describe('Bold theme contrast', () => {
  it('keeps white muted text at 4.5:1 on every hue, and leaves dark hues alone', () => {
    for (let h = 0; h < 360; h += 5) {
      for (const s of [50, 78]) {
        const [r, g, b] = hslToRgb(h, s, boldLightness(h, s, 40));
        const over = mix([255, 255, 255], [r, g, b], BOLD_MUTE_ALPHA).map(Math.round);
        expect(contrastRatio(lum(over), luminance(r, g, b))).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(boldLightness(240, 78, 40)).toBe(40);
  });
});

describe('Classic and Paper accent contrast', () => {
  it('Classic accent text reads on the glowing background anywhere in the header, in every format', () => {
    const topSat = SPINE_SAT[1] + CLASSIC_BASE.satDelta;
    for (const [W, H] of Object.values(SIZES)) {
      for (let h = 0; h < 360; h += 5) {
        const base = hslToRgb(h, topSat, CLASSIC_BASE.light);
        const glow = hslToRgb((h + CLASSIC_GLOW.hueShift) % 360, CLASSIC_GLOW.sat, CLASSIC_GLOW.light);
        const accent = lum(rgbOf(themeById('classic').accent(bookOfHue(h))));
        for (const [x, y] of headerPoints(W)) {
          const bg = mix(glow, base, classicGlowAt(x, y, W, H));
          expect(contrastRatio(accent, lum(bg))).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it('Paper accent text reads on the page colour with the full vignette on top (the worst case)', () => {
    const bg = lum(mix(PAPER.vignette, PAPER.bottom, PAPER.vignetteAlpha));
    for (let h = 0; h < 360; h += 5) {
      expect(contrastRatio(lum(rgbOf(themeById('paper').accent(bookOfHue(h)))), bg)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
