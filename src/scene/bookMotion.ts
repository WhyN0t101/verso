import * as THREE from 'three';
import {SETTLE_EPS, approach, ease} from './loop';
import {tintFor} from './tint';
import {MAT, type Entry} from './entry';

/** What the frame knows when it moves the books. */
export interface MotionContext {
  dt: number;
  /** The open book, if any. */
  sel: Entry | undefined;
  /** Where the open book comes to rest and how big it grows; null when none is open. */
  target: {pos: THREE.Vector3; s: number} | null;
  /** A search, status filter or genre section is active. */
  filtering: boolean;
  /** The book id under the mouse. */
  hover: string | null;
  /** Eased pointer position, -1..1: the open book turns a little towards it. */
  pointerX: number;
  pointerY: number;
  /** Ids picked in Select mode. */
  picked: ReadonlySet<string>;
}

/** What stepping the books found: how much changed, and whether the shadow map needs a redraw. */
export interface MotionResult {
  moved: number;
  shadow: boolean;
}

/** Strength of the warm glow on a book's faces: chosen in Select mode, or (softer) found by a search or filter while no book is open. */
export const glowFor = (picked: boolean, filtering: boolean, match: boolean, anySelected: boolean): number => (picked ? 0.45 : filtering && match && !anySelected ? 0.28 : 0);

const tmpC = new THREE.Color();

/**
 * One frame of one book: its glow, its easing towards where it should be (home, lifted by hover or a match,
 * or pulled out to the open-book spot) and its dimming. Adds to `out` what changed.
 */
export function stepBook(e: Entry, c: MotionContext, out: MotionResult): void {
  const {dt, sel, target: st, filtering} = c;
  const isSel = sel === e;
  const match = e.match;
  const picked = c.picked.has(e.b.id);
  const glow = glowFor(picked, filtering, match, !!sel);
  if (picked !== e.picked || glow !== e.glow) {
    e.picked = picked;
    e.glow = glow;
    e.mats.forEach((m, i) => {
      if (i === MAT.cover) return; // the cover face keeps its own glow
      m.emissive.setHex(glow ? 0xf2b650 : 0x000000);
      m.emissiveIntensity = glow;
    });
    out.moved++;
  }
  const p = e.grp.position;
  let tx = e.home.x;
  let ty = e.home.y;
  let tz = e.home.z;
  let rY = 0;
  let rX = 0;
  let sc = 1;
  let rxy: number;
  let rz: number;
  if (isSel && st) {
    const clear = p.z - e.b.d / 2 > 0.65;
    tx = st.pos.x;
    ty = st.pos.y;
    tz = st.pos.z;
    if (clear) {
      sc = st.s;
      rY = -Math.PI / 2 + c.pointerX * 0.3;
      rX = c.pointerY * 0.15;
    }
    rz = 7;
    rxy = clear ? 6 : 1.0;
  } else {
    if (!sel && c.hover === e.b.id) {
      ty += 0.1;
      tz += 0.18;
    } else if (!sel && ((filtering && match) || e.picked)) {
      ty += 0.1;
      tz += 0.32;
    }
    const far = p.z > e.home.z + 0.5;
    rxy = far ? 9 : 10;
    rz = far ? 3.5 : 10;
  }
  // Every component eases and snaps to its own target, and any change counts as movement. A summed test let
  // opposite movements cancel, so the loop could sleep while the book was still short of where it belongs.
  const rot = e.grp.rotation;
  const sx = e.grp.scale.x;
  const px = p.x;
  const py = p.y;
  const pz = p.z;
  const rx = rot.x;
  const ry = rot.y;
  const rzz = rot.z;
  p.x = approach(p.x, tx, rxy, dt, SETTLE_EPS);
  p.y = approach(p.y, ty, rxy, dt, SETTLE_EPS);
  p.z = approach(p.z, tz, rz, dt, SETTLE_EPS);
  rot.y = approach(rot.y, rY, 6, dt, SETTLE_EPS);
  rot.x = approach(rot.x, rX, 6, dt, SETTLE_EPS);
  rot.z = approach(rot.z, isSel ? 0 : e.lean, 6, dt, SETTLE_EPS);
  const scale = approach(sx, sc, 6, dt, SETTLE_EPS);
  e.grp.scale.setScalar(scale);
  if (p.x !== px || p.y !== py || p.z !== pz || rot.x !== rx || rot.y !== ry || rot.z !== rzz || scale !== sx) {
    out.moved++;
    // A hover or search lift is too small to be worth redrawing every book into the shadow map.
    if (isSel) out.shadow = true;
  }
  tmpC.setHex(tintFor({isSelected: isSel, anySelected: !!sel, filtering, matches: match}));
  const diff = Math.abs(e.tint.r - tmpC.r) + Math.abs(e.tint.g - tmpC.g) + Math.abs(e.tint.b - tmpC.b);
  if (diff === 0) return;
  // Snap the last sliver so the easing ends and the loop can go idle.
  if (diff < 0.002) e.tint.copy(tmpC);
  else e.tint.lerp(tmpC, ease(dt, 8));
  out.moved++;
  for (let i = 0; i < e.mats.length; i++) e.mats[i]?.color.copy(e.base[i] as THREE.Color).multiply(e.tint);
}
