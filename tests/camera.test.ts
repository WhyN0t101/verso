import {afterEach, describe, expect, it, vi} from 'vitest';
import * as THREE from 'three';
import {createRig, frameFor, placeRig, selectionTarget, stepRig, type FrameSpace} from '../src/scene/camera';

afterEach(() => vi.unstubAllGlobals());

const rigOf = (reduced = false) => createRig(new THREE.PerspectiveCamera(38, 1.6, 0.1, 120), reduced);
const space: FrameSpace = {wallW: 5, depth: 1.7, viewW: 1600, viewH: 900, topInset: 64, bottomInset: 8};
const framing = (i: number) => ({dist: 10 + i, cy: i});

describe('frameFor', () => {
  it('backs off further for a taller bookcase, and for a narrower window that must fit the width', () => {
    const rig = rigOf();
    const short = frameFor({cy: 0, h: 8}, space, rig.fovT).dist;
    const tall = frameFor({cy: 0, h: 12}, space, rig.fovT).dist;
    expect(tall).toBeGreaterThan(short);
    const narrow = frameFor({cy: 0, h: 8}, {...space, viewW: 300}, rig.fovT).dist;
    expect(narrow).toBeGreaterThan(short);
  });

  it('shifts the centre down when the header covers more of the canvas than the bottom does', () => {
    const rig = rigOf();
    expect(frameFor({cy: 3, h: 8}, space, rig.fovT).cy).toBeGreaterThan(3);
    expect(frameFor({cy: 3, h: 8}, {...space, topInset: 8}, rig.fovT).cy).toBeCloseTo(3, 6);
  });
});

describe('placeRig', () => {
  it('clamps the pan target to the wall, snaps on the first placement, and eases otherwise', () => {
    const rig = rigOf();
    rig.panTarget = 99;
    placeRig(rig, false, 3, 5, framing);
    expect(rig.panMax).toBe(10);
    expect(rig.panTarget).toBe(10);
    expect(rig.framedCase).toBe(2);
    expect(rig.dist).toBe(12);
    expect(rig.distT).toBe(12);
    placeRig(rig, true, 3, 5, framing);
    expect([rig.panTarget, rig.panCur, rig.dist]).toEqual([0, 0, 10]);
  });

  it('jumps straight to the framing when motion is reduced', () => {
    const rig = rigOf(true);
    rig.panTarget = 5;
    placeRig(rig, false, 3, 5, framing);
    expect(rig.dist).toBe(11);
  });
});

describe('stepRig', () => {
  it('eases to its targets, reports movement while it does, and exactly 0 once it has arrived', () => {
    const rig = rigOf();
    placeRig(rig, true, 3, 5, framing);
    rig.panTarget = 5;
    let frames = 0;
    let moved = stepRig(rig, 1 / 60, 3, 5, framing);
    expect(moved).toBeGreaterThan(0);
    while (moved > 0 && frames++ < 1000) moved = stepRig(rig, 1 / 60, 3, 5, framing);
    expect(moved).toBe(0);
    expect(rig.panCur).toBe(5);
    expect(rig.dist).toBe(11);
    expect(frames).toBeLessThan(400);
  });

  it('reframes when the bookcase being headed for changes', () => {
    const rig = rigOf();
    placeRig(rig, true, 3, 5, framing);
    rig.panTarget = 10;
    stepRig(rig, 1 / 60, 3, 5, framing);
    expect(rig.framedCase).toBe(2);
    expect(rig.distT).toBe(12);
  });
});

describe('selectionTarget', () => {
  it('scales the pulled-out book to the free area, within limits, and reuses its result object', () => {
    vi.stubGlobal('innerWidth', 1600);
    vi.stubGlobal('innerHeight', 900);
    vi.stubGlobal('document', {getElementById: () => ({getBoundingClientRect: () => ({height: 64})})});
    const rig = rigOf();
    rig.dist = 12;
    rig.camera.position.set(0, 0, 12);
    rig.camera.updateMatrixWorld();
    const a = selectionTarget(rig, 2, 1.2);
    const s1 = a.s;
    const b = selectionTarget(rig, 4, 1.2);
    expect(b).toBe(a);
    expect(s1).toBeGreaterThanOrEqual(0.6);
    expect(s1).toBeLessThanOrEqual(2.4);
    expect(b.s).toBeLessThan(s1);
  });
});
