export type Status = 'wishlist' | 'reading' | 'finished';

/** Dominant cover colour, HSL with s/l in 0..100. */
export interface Tone {h: number; s: number; l: number}

export interface Book {
  id: string;
  title: string;
  author: string;
  genre: string;
  summary: string;
  notes: string;
  rating: number;
  /** Absent on books saved before reading status existed. */
  status?: Status;
  year?: number;
  /** Same-origin proxy path, e.g. /api/cover?id=123 */
  cover?: string;
  tone?: Tone;
  hue: number;
  pattern: number;
  w: number;
  h: number;
  d: number;
  /** Bumped when anything that affects textures changes. */
  v: number;
}

export interface BookDraft {
  title: string;
  author?: string;
  genre?: string;
  summary?: string;
  year?: number;
  cover?: string;
  tone?: Tone;
  /** Cover width / height, used to shape the 3D book. */
  aspect?: number;
}

export type WoodId = 'walnut' | 'oak' | 'ebony' | 'maple' | 'cherry';
export type LightId = 'warm' | 'neutral' | 'evening' | 'bright';
export type Background = {kind: 'preset'; id: string} | {kind: 'image'; data: string};

export interface Settings {
  wood: WoodId;
  light: LightId;
  background: Background;
  /** One labelled bookcase per genre instead of insertion order. Absent in older saves, meaning off. */
  groupByGenre?: boolean;
}
