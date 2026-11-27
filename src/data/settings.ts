import type {Settings} from '../types';
import {BACKGROUNDS, LIGHTS, WOODS} from '../presets';

/** The named "Study" look: honey oak under a lamp, against a blue-green wall. */
export const STUDY = {wood: 'honey', light: 'lamplit', background: {kind: 'preset', id: 'study'}} as const satisfies Pick<Settings, 'wood' | 'light' | 'background'>;

export const DEFAULT_SETTINGS: Settings = {wood: STUDY.wood, light: STUDY.light, background: {...STUDY.background}};

const WOOD_IDS = Object.keys(WOODS);
const LIGHT_IDS = Object.keys(LIGHTS);
const BG_IDS = BACKGROUNDS.map((b) => b.id);
// The image goes into a CSS url("…"), so only plain base64 is accepted; anything else could add a second url().
const IMAGE_DATA = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
/** A 1600 px JPEG from the style dialog is well under this; it keeps an import from filling localStorage. */
export const MAX_IMAGE_CHARS = 1_500_000;
const JPEG_QUALITIES = [0.82, 0.7, 0.55, 0.4, 0.25];

/**
 * Encodes an uploaded background at the best quality that still fits MAX_IMAGE_CHARS. Without this a busy photo
 * saves fine, then sanitizeSettings drops it on the next load and the background silently reverts.
 */
export function encodeWithinLimit(encode: (quality: number) => string): string {
  for (const q of JPEG_QUALITIES) {
    const data = encode(q);
    if (data.length <= MAX_IMAGE_CHARS) return data;
  }
  throw new Error('image too large to store');
}

export function sanitizeSettings(x: unknown): Settings {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const bg = (o.background && typeof o.background === 'object' ? o.background : {}) as Record<string, unknown>;
  const background: Settings['background'] =
    bg.kind === 'image' && typeof bg.data === 'string' && bg.data.length <= MAX_IMAGE_CHARS && IMAGE_DATA.test(bg.data)
      ? {kind: 'image', data: bg.data}
      : {kind: 'preset', id: BG_IDS.includes(bg.id as string) ? (bg.id as string) : 'study'};
  return {
    wood: WOOD_IDS.includes(o.wood as string) ? (o.wood as Settings['wood']) : STUDY.wood,
    light: LIGHT_IDS.includes(o.light as string) ? (o.light as Settings['light']) : STUDY.light,
    background,
    ...(o.groupByGenre === true ? {groupByGenre: true} : {}),
    ...(o.props === true ? {props: true} : {}),
  };
}
