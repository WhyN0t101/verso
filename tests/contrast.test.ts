import {describe, expect, it} from 'vitest';
import {MIN_CONTRAST, contrastRatio, hslToRgb, luminance, spineScheme} from '../src/textures/contrast';
import {SPINE_LIGHT, SPINE_SAT, paletteOf, spineLightness, spineLook} from '../src/textures/draw';
import {makeBook} from '../src/data/books';

describe('contrast maths', () => {
  it('matches known WCAG values', () => {
    expect(contrastRatio(luminance(255, 255, 255), luminance(0, 0, 0))).toBeCloseTo(21, 1);
    expect(contrastRatio(luminance(119, 119, 119), luminance(255, 255, 255))).toBeCloseTo(4.48, 1);
  });
  it('converts hsl to rgb', () => {
    expect(hslToRgb(0, 100, 50)).toEqual([255, 0, 0]);
    expect(hslToRgb(120, 100, 25)).toEqual([0, 128, 0]);
    expect(hslToRgb(0, 0, 100)).toEqual([255, 255, 255]);
  });
});

describe('spine ink', () => {
  it('passes 4.5:1 on every hue, saturation and lightness a spine can have', () => {
    let worst = Infinity;
    for (let h = 0; h < 360; h += 7) for (let s = 12; s <= 62; s += 10) for (let l = 20; l <= 75; l += 1) worst = Math.min(worst, spineScheme(h, s, l).ratio);
    expect(worst).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });
  it('uses dark ink on a pale spine and light ink on a deep one', () => {
    expect(spineScheme(66, 22, 60).ink).toBe('dark');
    expect(spineScheme(220, 40, 24).ink).toBe('light');
  });
  it('keeps a spine that already passes exactly as it is', () => {
    expect(spineScheme(220, 40, 24).l).toBe(24);
  });
  it('handles The Stranger, with either of its covers', () => {
    // 66/22/62: the pale cover now on the book. 334/91/45: the pink Coles Notes cover it came with.
    for (const tone of [{h: 66, s: 22, l: 62}, {h: 334, s: 91, l: 45}]) {
      const b = makeBook({title: 'The Stranger', cover: '/api/cover?id=1', tone});
      const p = paletteOf(b);
      expect(spineScheme(p.h, p.s, spineLightness(b)).ratio).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });
});

describe('spine harmony', () => {
  const tone = (h: number, s: number, l: number) => makeBook({title: 'T', cover: '/api/cover?id=1', tone: {h, s, l}});

  it('holds saturation and lightness of any cover colour in a restrained band', () => {
    for (const [s, l] of [[100, 95], [0, 0], [100, 50], [5, 99], [100, 3]] as const) {
      const b = tone(10, s, l);
      expect(paletteOf(b).s).toBeGreaterThanOrEqual(SPINE_SAT[0]);
      expect(paletteOf(b).s).toBeLessThanOrEqual(SPINE_SAT[1]);
      expect(spineLightness(b)).toBeGreaterThanOrEqual(SPINE_LIGHT[0]);
      expect(spineLightness(b)).toBeLessThanOrEqual(SPINE_LIGHT[1]);
    }
  });

  it('still passes the ink contrast for every colour in the band', () => {
    for (let h = 0; h < 360; h += 9) for (const [s, l] of [[100, 95], [0, 0], [100, 50], [30, 40]] as const) {
      const b = tone(h, s, l);
      const p = paletteOf(b);
      expect(spineScheme(p.h, p.s, spineLightness(b)).ratio).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });

  it('keeps a shelf of books distinguishable: many different hue and lightness cells', () => {
    const cells = new Set<string>();
    for (let i = 0; i < 150; i++) {
      const b = makeBook({title: `Book number ${i}`, cover: i % 2 ? '/api/cover?id=1' : undefined, tone: i % 2 ? {h: (i * 47) % 360, s: 40 + (i % 50), l: 20 + (i % 60)} : undefined});
      const look = spineLook(b);
      cells.add(`${Math.floor(look.h / 15)}:${Math.floor(look.l / 4)}`);
    }
    expect(cells.size).toBeGreaterThanOrEqual(60);
  });
});
