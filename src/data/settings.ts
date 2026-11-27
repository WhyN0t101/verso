import type {Settings} from '../types';
import {asRecord} from '../../shared/untrusted';
import {BACKGROUNDS, isLightId, isWoodId} from '../presets';

/** The named "Study" look: honey oak under a lamp, against a blue-green wall. */
export const STUDY = {wood: 'honey', light: 'lamplit', background: {kind: 'preset', id: 'study'}} as const satisfies Pick<Settings, 'wood' | 'light' | 'background'>;

export const DEFAULT_SETTINGS: Settings = {wood: STUDY.wood, light: STUDY.light, background: {...STUDY.background}};

const BG_IDS: readonly unknown[] = BACKGROUNDS.map((b) => b.id);
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
  const o = asRecord(x);
  const bg = asRecord(o.background);
  const background: Settings['background'] =
    bg.kind === 'image' && typeof bg.data === 'string' && bg.data.length <= MAX_IMAGE_CHARS && IMAGE_DATA.test(bg.data)
      ? {kind: 'image', data: bg.data}
      : {kind: 'preset', id: typeof bg.id === 'string' && BG_IDS.includes(bg.id) ? bg.id : 'study'};
  return {
    wood: isWoodId(o.wood) ? o.wood : STUDY.wood,
    light: isLightId(o.light) ? o.light : STUDY.light,
    background,
    ...(o.groupByGenre === true ? {groupByGenre: true} : {}),
    ...(o.props === true ? {props: true} : {}),
  };
}
