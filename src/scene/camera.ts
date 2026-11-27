import * as THREE from 'three';
import {clamp} from '../util';
import {SETTLE_EPS, approach} from './loop';
import {nearestCase} from './wall';

/** Height of the section bar plus its gap on screens narrower than the rail breakpoint. */
const NARROW_BAR_PX = 64;

export const isMobile = (): boolean => innerWidth <= 760;
/** Height in pixels of the top bar, which covers part of the canvas. */
export const headerPx = (): number => document.getElementById('bar')?.getBoundingClientRect().height ?? 64;

/**
 * The camera and where it is heading. Panning slides along the wall (x); distance and height frame the
 * current bookcase. Everything eases towards its target; `pan*` are world x positions.
 */
export interface Rig {
  camera: THREE.PerspectiveCamera;
  /** tan(fov / 2): converts a distance to the visible half height. */
  fovT: number;
  panTarget: number;
  panCur: number;
  panMax: number;
  dist: number;
  cy: number;
  distT: number;
  cyT: number;
  /** The bookcase whose framing distT and cyT hold. */
  framedCase: number;
  reducedMotion: boolean;
}

export function createRig(camera: THREE.PerspectiveCamera, reducedMotion: boolean): Rig {
  return {camera, fovT: Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), panTarget: 0, panCur: 0, panMax: 0, dist: 12, cy: 0, distT: 12, cyT: 0, framedCase: -1, reducedMotion};
}

/** What framing a bookcase depends on, apart from the case itself. */
export interface FrameSpace {
  /** Width of one bookcase, so the whole width fits on narrow screens. */
  wallW: number;
  depth: number;
  viewW: number;
  viewH: number;
  /** Pixels at the top and bottom of the canvas that other interface covers. */
  topInset: number;
  bottomInset: number;
}

/** The space the browser window gives: the header, and on narrow screens the section bar. */
export function frameSpace(wallW: number, depth: number): FrameSpace {
  return {wallW, depth, viewW: innerWidth, viewH: innerHeight, topInset: headerPx(), bottomInset: innerWidth <= 1000 ? NARROW_BAR_PX : 8};
}

/** Camera distance and height that frame a bookcase (centre `cy`, height `h`) so it fills the free band of the viewport. */
export function frameFor(v: {cy: number; h: number}, sp: FrameSpace, fovT: number): {dist: number; cy: number} {
  const H = sp.viewH;
  const aspect = sp.viewW / H;
  const free = Math.max(H - sp.topInset - sp.bottomInset, H * 0.5);
  const dist = Math.max(((v.h * H) / free / 2) / fovT, sp.wallW / 2 / (fovT * aspect)) * 1.06 + sp.depth / 2;
  // Content sits lower than the screen centre when the top inset is larger than the bottom one.
  const worldPerPx = (2 * dist * fovT) / H;
  return {dist, cy: v.cy + ((sp.topInset - sp.bottomInset) / 2) * worldPerPx};
}

/** Re-aims the framing at the bookcase the pan target is on; it eases there unless `snap` or reduced motion. */
export function placeRig(rig: Rig, snap: boolean, caseCount: number, pitch: number, framing: (index: number) => {dist: number; cy: number}): void {
  rig.panMax = (caseCount - 1) * pitch;
  if (snap) rig.panTarget = rig.panCur = 0;
  rig.panTarget = clamp(rig.panTarget, 0, rig.panMax);
  rig.framedCase = nearestCase(rig.panTarget, pitch, caseCount);
  const f = framing(rig.framedCase);
  rig.distT = f.dist;
  rig.cyT = f.cy;
  if (snap || rig.reducedMotion) {
    rig.dist = f.dist;
    rig.cy = f.cy;
  }
}

/**
 * One easing step of pan, distance and height; reframes when the bookcase being headed for changed (its rows
 * were trimmed or added). Returns how far things moved, which is 0 once everything has arrived.
 */
export function stepRig(rig: Rig, dt: number, caseCount: number, pitch: number, framing: (index: number) => {dist: number; cy: number}): number {
  const pc = rig.panCur;
  rig.panCur = rig.reducedMotion ? rig.panTarget : approach(rig.panCur, rig.panTarget, 10, dt, SETTLE_EPS);
  const heading = nearestCase(rig.panTarget, pitch, caseCount);
  if (heading !== rig.framedCase) {
    rig.framedCase = heading;
    const f = framing(heading);
    rig.distT = f.dist;
    rig.cyT = f.cy;
  }
  const cd = rig.dist;
  const cc = rig.cy;
  rig.dist = rig.reducedMotion ? rig.distT : approach(rig.dist, rig.distT, 5, dt, SETTLE_EPS);
  rig.cy = rig.reducedMotion ? rig.cyT : approach(rig.cy, rig.cyT, 5, dt, SETTLE_EPS);
  return Math.abs(rig.panCur - pc) + Math.abs(rig.dist - cd) + Math.abs(rig.cy - cc);
}

/** Puts the camera where the rig says, leaning a little towards the pointer (`px`, `py` in -1..1). */
export function aimCamera(rig: Rig, px: number, py: number): void {
  const camY = rig.cy + 2 * rig.dist * rig.fovT * 0.035;
  rig.camera.position.set(rig.panCur + px * 0.5, camY - py * 0.3, rig.dist);
  rig.camera.lookAt(rig.panCur + px * 0.15, camY, 0);
  rig.camera.updateMatrixWorld();
}

/** Scratch for selectionTarget, which runs every frame while a book is open. The result is only read within that frame. */
const selPos = new THREE.Vector3();
const selDir = new THREE.Vector3();
const selResult = {pos: selPos, s: 1};

/** Where the pulled-out book rests: centred in the area the detail panel leaves free, and how big it grows there. */
export function selectionTarget(rig: Rig, bookH: number, bookD: number): {pos: THREE.Vector3; s: number} {
  const dist = rig.dist * 0.5;
  const w = innerWidth;
  const h = innerHeight;
  const mob = isMobile();
  const pw = mob ? 0 : Math.min(400, w * 0.92);
  const top = headerPx();
  const bot = mob ? h * 0.48 : h;
  const fx = mob ? w / 2 : (w - pw) / 2;
  const fy = (top + bot) / 2;
  const freeW = mob ? w : w - pw;
  const freeH = bot - top;
  const v = selDir.set((fx / w) * 2 - 1, 1 - (fy / h) * 2, 0.5).unproject(rig.camera).sub(rig.camera.position).normalize();
  selPos.copy(rig.camera.position).addScaledVector(v, dist);
  const unit = (2 * dist * rig.fovT) / h;
  selResult.s = clamp(Math.min((0.68 * freeH * unit) / bookH, (0.72 * freeW * unit) / bookD), 0.6, 2.4);
  return selResult;
}
