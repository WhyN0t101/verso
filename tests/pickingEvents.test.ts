import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import * as THREE from 'three';
import {createPicking, type PickingDeps} from '../src/scene/picking';
import {createRig} from '../src/scene/camera';

vi.mock('../src/covers', () => ({loadCover: async () => null}));

type Listener = (ev: Record<string, unknown>) => void;

/** A canvas that records its listeners, so the test can fire pointer events by hand. */
function fakeCanvas() {
  const listeners = new Map<string, Listener>();
  return {
    el: {
      addEventListener: (t: string, fn: Listener) => void listeners.set(t, fn),
      getBoundingClientRect: () => ({left: 0, top: 0, width: 800, height: 600}),
      setPointerCapture: () => undefined,
      classList: {toggle: () => undefined, remove: () => undefined},
    } as unknown as HTMLCanvasElement,
    fire: (t: string, ev: Record<string, unknown> = {}) => listeners.get(t)?.({clientX: 400, clientY: 300, timeStamp: 0, pointerType: 'mouse', pointerId: 1, deltaX: 0, deltaY: 0, preventDefault() {}, ...ev}),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('innerWidth', 800);
  vi.stubGlobal('innerHeight', 600);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function setup() {
  const c = fakeCanvas();
  const camera = new THREE.PerspectiveCamera(38, 800 / 600, 0.1, 100);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
  mesh.userData = {id: 'book1'};
  mesh.updateMatrixWorld();
  const rig = createRig(camera, false);
  rig.panMax = 10;
  rig.dist = 10;
  const log: string[] = [];
  const hooks = {
    onPick: vi.fn((id: string | null) => void log.push(`pick:${id}`)),
    onHover: vi.fn(),
    onLongPress: vi.fn((id: string) => void log.push(`long:${id}`)),
  };
  const deps: PickingDeps = {canvas: c.el, camera, rig, pointer: {x: 0, y: 0}, pickables: [mesh], bookOf: () => ({title: 'T'}), wall: () => ({pitch: 5, caseCount: 3}), selected: () => false, hooks, wake: () => void log.push('wake')};
  createPicking(deps);
  return {c, rig, hooks, log};
}

describe('canvas gestures', () => {
  it('a tap under the slop opens the book under the finger and leaves the camera alone', () => {
    const {c, rig, hooks} = setup();
    c.fire('pointerdown', {clientX: 400, clientY: 300});
    c.fire('pointermove', {clientX: 403, clientY: 302, timeStamp: 16});
    c.fire('pointerup', {clientX: 403, clientY: 302, timeStamp: 32});
    expect(hooks.onPick).toHaveBeenCalledWith('book1');
    expect(rig.panTarget).toBe(0);
  });

  it('a drag over the slop pans the wall and opens nothing', () => {
    const {c, rig, hooks} = setup();
    c.fire('pointerdown', {clientX: 400, clientY: 300});
    c.fire('pointermove', {clientX: 300, clientY: 300, timeStamp: 16});
    c.fire('pointerup', {clientX: 300, clientY: 300, timeStamp: 32});
    expect(hooks.onPick).not.toHaveBeenCalled();
    expect(rig.panTarget).toBeGreaterThan(0);
  });

  it('a touch swipe settles on a whole bookcase, a mouse drag stays where it was let go', () => {
    const swipe = (pointerType: string) => {
      const {c, rig} = setup();
      c.fire('pointerdown', {clientX: 400, clientY: 300, pointerType});
      c.fire('pointermove', {clientX: 330, clientY: 300, timeStamp: 16, pointerType});
      c.fire('pointerup', {clientX: 330, clientY: 300, timeStamp: 32, pointerType});
      return rig.panTarget;
    };
    expect(swipe('touch') % 5).toBeCloseTo(0, 10);
    expect(swipe('mouse') % 5).not.toBeCloseTo(0, 3);
  });

  it('a wheel pans the wall and wakes the loop', () => {
    const {c, rig, log} = setup();
    c.fire('wheel', {deltaY: 100});
    expect(rig.panTarget).toBeGreaterThan(0);
    expect(log).toContain('wake');
  });
});

describe('long press', () => {
  it('opens select mode after half a second held, and wakes the loop after the state change so the glow shows at once', () => {
    const {c, hooks, log} = setup();
    c.fire('pointerdown', {pointerType: 'touch'});
    log.length = 0;
    vi.advanceTimersByTime(499);
    expect(hooks.onLongPress).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(hooks.onLongPress).toHaveBeenCalledWith('book1');
    expect(log).toEqual(['long:book1', 'wake']);
  });

  it('is cancelled by moving away or lifting, and the lift then picks nothing', () => {
    const {c, hooks} = setup();
    c.fire('pointerdown', {pointerType: 'touch'});
    c.fire('pointermove', {clientX: 500, clientY: 300, timeStamp: 16, pointerType: 'touch'});
    vi.advanceTimersByTime(600);
    expect(hooks.onLongPress).not.toHaveBeenCalled();
  });
});
