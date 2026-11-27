import type * as THREE from 'three';
import type {Book} from '../types';

/** Material slots of a book mesh, following packBookFaces: cover, back board, spine, then one for all three paper faces. */
export const MAT = {cover: 0, back: 1, spine: 2} as const;

/** One book standing on the wall: its model, its materials and the state the frame loop and the textures keep on it. */
export interface Entry {
  b: Book;
  grp: THREE.Group;
  mats: THREE.MeshStandardMaterial[];
  home: THREE.Vector3;
  base: THREE.Color[];
  tint: THREE.Color;
  hasSpine: boolean;
  hasCover: boolean;
  /** Aborts the real cover's request when the book is put back before it arrived. */
  coverCtl?: AbortController;
  coverPending?: boolean;
  caseIndex: number;
  picked: boolean;
  /** Resting tilt in radians; a book at the end of a half-empty row leans on its neighbour. */
  lean: number;
  /** Strength of the warm glow now on the book's faces. */
  glow: number;
  /** Result of the search and status filter, refreshed only when they change. */
  match: boolean;
}
