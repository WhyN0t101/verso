import type {LightId, WoodId} from './types';

export interface WoodPreset {
  label: string;
  /** Base fill of the grain texture. */
  base: string;
  /** rgb triplets for dark and light grain strokes. */
  dark: string;
  light: string;
}

export const WOODS: Record<WoodId, WoodPreset> = {
  walnut: {label: 'Walnut', base: '#5b3b25', dark: '25,12,5', light: '150,100,60'},
  oak: {label: 'Oak', base: '#a37a4b', dark: '70,42,18', light: '215,176,120'},
  ebony: {label: 'Ebony', base: '#2a211c', dark: '8,5,4', light: '90,72,60'},
  maple: {label: 'Maple', base: '#c9a06a', dark: '110,72,34', light: '240,215,170'},
  cherry: {label: 'Cherry', base: '#7a3b27', dark: '40,12,6', light: '176,92,64'},
};

export interface LightPreset {
  label: string;
  hemiSky: number;
  hemiGround: number;
  hemi: number;
  key: number;
  keyColor: number;
  fill: number;
  fillColor: number;
}

/** Intensities are in the prototype's units; the scene multiplies by pi for current three. */
export const LIGHTS: Record<LightId, LightPreset> = {
  warm: {label: 'Warm', hemiSky: 0xfff0dc, hemiGround: 0x2b1e14, hemi: 0.9, key: 0.85, keyColor: 0xffe3bd, fill: 0.16, fillColor: 0x9fb4ff},
  neutral: {label: 'Neutral', hemiSky: 0xffffff, hemiGround: 0x30303a, hemi: 0.95, key: 0.85, keyColor: 0xffffff, fill: 0.2, fillColor: 0xcfd8ff},
  evening: {label: 'Evening', hemiSky: 0xffb98a, hemiGround: 0x1a1220, hemi: 0.5, key: 1.0, keyColor: 0xff9a52, fill: 0.22, fillColor: 0x6a7bd6},
  bright: {label: 'Bright', hemiSky: 0xffffff, hemiGround: 0x4a4038, hemi: 1.25, key: 1.0, keyColor: 0xfff4e0, fill: 0.2, fillColor: 0xcfd8ff},
};

export interface BackgroundPreset {
  id: string;
  label: string;
  css: string;
}

export const BACKGROUNDS: BackgroundPreset[] = [
  {id: 'ember', label: 'Ember', css: 'radial-gradient(ellipse at 50% 30%,#4a3322 0%,#24170f 55%,#0f0a07 100%)'},
  {id: 'midnight', label: 'Midnight', css: 'radial-gradient(ellipse at 50% 30%,#26385f 0%,#121a30 55%,#070a14 100%)'},
  {id: 'forest', label: 'Forest', css: 'radial-gradient(ellipse at 50% 30%,#2f4a36 0%,#16261b 55%,#080f0a 100%)'},
  {id: 'slate', label: 'Slate', css: 'radial-gradient(ellipse at 50% 30%,#4a4f58 0%,#24272d 55%,#0d0e11 100%)'},
  {id: 'plum', label: 'Plum', css: 'radial-gradient(ellipse at 50% 30%,#4f2c4d 0%,#26142a 55%,#0e0610 100%)'},
];

/** The dark scrim keeps the cream UI text readable over any uploaded photo. */
export const imageBackgroundCss = (dataUrl: string): string =>
  `linear-gradient(rgba(10,6,4,.4),rgba(10,6,4,.62)), url("${dataUrl}") center / cover no-repeat`;
