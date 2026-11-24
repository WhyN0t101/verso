import type {Settings} from '../types';

/** The named "Study" look: honey oak under a lamp, against a blue-green wall. */
export const STUDY = {wood: 'honey', light: 'lamplit', background: {kind: 'preset', id: 'study'}} as const satisfies Pick<Settings, 'wood' | 'light' | 'background'>;

export const DEFAULT_SETTINGS: Settings = {wood: STUDY.wood, light: STUDY.light, background: {...STUDY.background}};

const WOODS = ['honey', 'walnut', 'oak', 'ebony', 'maple', 'cherry'];
const LIGHTS = ['lamplit', 'warm', 'neutral', 'evening', 'bright'];
export const BG_IDS = ['study', 'ember', 'midnight', 'forest', 'slate', 'plum'];

export function sanitizeSettings(x: unknown): Settings {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const bg = (o.background && typeof o.background === 'object' ? o.background : {}) as Record<string, unknown>;
  const background: Settings['background'] =
    bg.kind === 'image' && typeof bg.data === 'string' && bg.data.startsWith('data:image/')
      ? {kind: 'image', data: bg.data}
      : {kind: 'preset', id: BG_IDS.includes(bg.id as string) ? (bg.id as string) : 'study'};
  return {
    wood: WOODS.includes(o.wood as string) ? (o.wood as Settings['wood']) : STUDY.wood,
    light: LIGHTS.includes(o.light as string) ? (o.light as Settings['light']) : STUDY.light,
    background,
    ...(o.groupByGenre === true ? {groupByGenre: true} : {}),
  };
}
