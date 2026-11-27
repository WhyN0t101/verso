import {describe, expect, it} from 'vitest';
import {boldLightness} from '../src/export/themes';
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
