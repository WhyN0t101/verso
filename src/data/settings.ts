import type {Settings} from '../types';

export const DEFAULT_SETTINGS: Settings = {wood: 'walnut', light: 'warm', background: {kind: 'preset', id: 'ember'}};

const WOODS = ['walnut', 'oak', 'ebony', 'maple', 'cherry'];
const LIGHTS = ['warm', 'neutral', 'evening', 'bright'];
export const BG_IDS = ['ember', 'midnight', 'forest', 'slate', 'plum'];

export function sanitizeSettings(x: unknown): Settings {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const bg = (o.background && typeof o.background === 'object' ? o.background : {}) as Record<string, unknown>;
  const background: Settings['background'] =
    bg.kind === 'image' && typeof bg.data === 'string' && bg.data.startsWith('data:image/')
      ? {kind: 'image', data: bg.data}
      : {kind: 'preset', id: BG_IDS.includes(bg.id as string) ? (bg.id as string) : 'ember'};
  return {
    wood: WOODS.includes(o.wood as string) ? (o.wood as Settings['wood']) : 'walnut',
    light: LIGHTS.includes(o.light as string) ? (o.light as Settings['light']) : 'warm',
    background,
  };
}
