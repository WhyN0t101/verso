import * as THREE from 'three';
import {clamp} from '../util';
import {loadCover} from '../covers';
import {caseX, snapCase} from './wall';
import type {Rig} from './camera';

/** Pixels a pointer may travel and still count as a tap rather than a drag. */
export const TAP_SLOP = 6;
/** A touch held this long on a book is a long press (it starts Select mode). */
const LONG_PRESS_MS = 500;
/** Hovering this long fetches the book's cover ahead of the click. */
const PREFETCH_MS = 150;
/** World units panned per wheel delta unit. */
const WHEEL_SPEED = 0.012;

/** World distance the wall slides for a horizontal drag of `dx` pixels (the wall follows the finger). */
export const dragPan = (dx: number, camDist: number, fovT: number, viewH: number): number => -dx * ((2 * camDist * fovT) / viewH);

/** Smoothed swipe velocity: the new sample counts 40%, so one jittery event does not decide where a swipe settles. */
export const blendVelocity = (prev: number, dw: number, dtMs: number): number => prev * 0.6 + (dw / Math.max(dtMs, 1)) * 0.4;

/** The wheel delta that drives panning: whichever axis moved more, so a trackpad swipe and a mouse wheel both work. */
export const wheelDelta = (deltaX: number, deltaY: number): number => (Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY);

export const wheelPan = (delta: number): number => delta * WHEEL_SPEED;

/** Pointer position within a rectangle as normalised device coordinates (-1..1, y up). */
export const toNdc = (clientX: number, clientY: number, rect: {left: number; top: number; width: number; height: number}): [number, number] => [
  ((clientX - rect.left) / rect.width) * 2 - 1,
  -((clientY - rect.top) / rect.height) * 2 + 1,
];

export interface PickingDeps {
  canvas: HTMLCanvasElement;
  camera: THREE.PerspectiveCamera;
  rig: Rig;
  /** Pointer position in -1..1 (x, y) and its eased value (sx, sy); the picker writes x and y. */
  pointer: {x: number; y: number};
  /** The meshes a ray may hit; each carries its book id in userData.id. */
  pickables: THREE.Mesh[];
  /** The title and cover of a book, for the hover tip and the prefetch. */
  bookOf(id: string): {title: string; cover?: string} | undefined;
  /** Where the wall stands now: bookcase spacing and count. */
  wall(): {pitch: number; caseCount: number};
  /** True while a book is open: hovering is off then. */
  selected(): boolean;
  hooks: {onPick(id: string | null): void; onHover(title: string | null, x: number, y: number): void; onLongPress(id: string): void};
  /** Wakes the frame loop. */
  wake(): void;
}

export interface Picking {
  /** The book id under the mouse, or null. */
  hover(): string | null;
}

/** Mouse and touch on the canvas: hover tip, tap to open, long press, drag and swipe to pan, wheel to pan. */
export function createPicking(d: PickingDeps): Picking {
  const {canvas, camera, rig, pointer} = d;
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let hover: string | null = null;

  function pick(ev: PointerEvent): string | null {
    ndc.set(...toNdc(ev.clientX, ev.clientY, canvas.getBoundingClientRect()));
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(d.pickables, false)[0];
    const id: unknown = hit?.object.userData.id;
    return typeof id === 'string' ? id : null;
  }

  /** Hovering a book for a moment fetches its cover ahead of the click; moving on cancels it. */
  let hoverCtl: AbortController | null = null;
  let hoverTimer = 0;
  function prefetchCover(url: string | undefined): void {
    clearTimeout(hoverTimer);
    hoverCtl?.abort();
    hoverCtl = null;
    if (!url) return;
    hoverTimer = window.setTimeout(() => {
      hoverCtl = new AbortController();
      void loadCover(url, {signal: hoverCtl.signal});
    }, PREFETCH_MS);
  }

  let down: {x: number; y: number; lx: number; lt: number; vx: number; moved: number; long: boolean} | null = null;
  let pressTimer = 0;
  canvas.addEventListener('pointerdown', (ev) => {
    d.wake();
    down = {x: ev.clientX, y: ev.clientY, lx: ev.clientX, lt: ev.timeStamp, vx: 0, moved: 0, long: false};
    clearTimeout(pressTimer);
    if (ev.pointerType !== 'mouse') {
      pressTimer = window.setTimeout(() => {
        if (!down || down.moved >= TAP_SLOP) return;
        const id = pick(ev);
        if (!id) return;
        down.long = true;
        d.hooks.onLongPress(id);
        // This runs from a timer, not an input event, and the hook changes what the shelf shows (Select mode glow): wake after it.
        d.wake();
      }, LONG_PRESS_MS);
    }
    canvas.setPointerCapture(ev.pointerId);
  });
  canvas.addEventListener('pointermove', (ev) => {
    d.wake();
    pointer.x = (ev.clientX / innerWidth) * 2 - 1;
    pointer.y = (ev.clientY / innerHeight) * 2 - 1;
    if (down) {
      const dx = ev.clientX - down.lx;
      const dt = ev.timeStamp - down.lt;
      down.lx = ev.clientX;
      down.lt = ev.timeStamp;
      down.moved = Math.max(down.moved, Math.hypot(ev.clientX - down.x, ev.clientY - down.y));
      if (down.moved > TAP_SLOP && rig.panMax > 0) {
        const dw = dragPan(dx, rig.dist, rig.fovT, innerHeight);
        rig.panTarget = clamp(rig.panTarget + dw, 0, rig.panMax);
        down.vx = blendVelocity(down.vx, dw, dt);
      }
      return;
    }
    if (d.selected() || ev.pointerType === 'touch') return;
    const id = pick(ev);
    const book = id ? d.bookOf(id) : undefined;
    if (id !== hover) prefetchCover(book?.cover);
    hover = id;
    canvas.classList.toggle('pointer', !!id);
    d.hooks.onHover(book ? book.title : null, ev.clientX + 14, ev.clientY + 14);
  });
  canvas.addEventListener('pointerup', (ev) => {
    d.wake();
    if (!down) return;
    clearTimeout(pressTimer);
    const {moved, vx, long} = down;
    down = null;
    if (long) return;
    if (moved < TAP_SLOP) d.hooks.onPick(pick(ev));
    // Touch swipes settle on a bookcase; a mouse drag stays where it was let go.
    else if (ev.pointerType !== 'mouse' && rig.panMax > 0) {
      const {pitch, caseCount} = d.wall();
      rig.panTarget = caseX(snapCase(rig.panTarget, vx, pitch, caseCount), pitch);
    }
  });
  canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
  canvas.addEventListener('pointercancel', () => {
    clearTimeout(pressTimer);
    down = null;
  });
  canvas.addEventListener('pointerleave', () => {
    d.wake();
    hover = null;
    prefetchCover(undefined);
    d.hooks.onHover(null, 0, 0);
    canvas.classList.remove('pointer');
  });
  canvas.addEventListener(
    'wheel',
    (ev) => {
      if (rig.panMax > 0) {
        d.wake();
        ev.preventDefault();
        rig.panTarget = clamp(rig.panTarget + wheelPan(wheelDelta(ev.deltaX, ev.deltaY)), 0, rig.panMax);
      }
    },
    {passive: false},
  );

  return {hover: () => hover};
}
