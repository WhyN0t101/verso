/** WCAG relative luminance of an sRGB colour, channels 0..255. */
export function luminance(r: number, g: number, b: number): number {
  const lin = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: number, b: number): number {
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** h 0..360, s and l 0..100 to sRGB 0..255. */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const S = s / 100;
  const L = l / 100;
  const k = (n: number): number => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n: number): number => Math.round(255 * (L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return [f(0), f(8), f(4)];
}

export const INK_LIGHT = {css: '#fff8ec', rgb: [255, 248, 236] as const};
export const INK_DARK = {css: '#1a1209', rgb: [26, 18, 9] as const};
export const MIN_CONTRAST = 4.5;

export interface SpineScheme {
  /** Lightness of the spine, nudged when neither ink reached the minimum. */
  l: number;
  ink: 'light' | 'dark';
  inkCss: string;
  ratio: number;
}

const inkLum = {light: luminance(...INK_LIGHT.rgb), dark: luminance(...INK_DARK.rgb)};

function ratioFor(h: number, s: number, l: number, ink: 'light' | 'dark'): number {
  return contrastRatio(luminance(...hslToRgb(h, s, l)), inkLum[ink]);
}

/**
 * Chooses light or dark ink for a spine colour. When neither reaches 4.5:1 (mid lightness with some hues)
 * the spine is darkened or lightened a point at a time until the better ink passes.
 */
export function spineScheme(h: number, s: number, l: number): SpineScheme {
  let lightness = Math.min(100, Math.max(0, l));
  let ink: 'light' | 'dark' = ratioFor(h, s, lightness, 'light') >= ratioFor(h, s, lightness, 'dark') ? 'light' : 'dark';
  for (let i = 0; i < 100 && ratioFor(h, s, lightness, ink) < MIN_CONTRAST; i++) lightness += ink === 'light' ? -1 : 1;
  return {l: lightness, ink, inkCss: ink === 'light' ? INK_LIGHT.css : INK_DARK.css, ratio: ratioFor(h, s, lightness, ink)};
}
