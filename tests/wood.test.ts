import {describe, expect, it} from 'vitest';
import * as THREE from 'three';
import {boardGeo, stainTint, woodUV} from '../src/scene/wood';

const uvOf = (g: THREE.BufferGeometry, i: number) => {
  const uv = g.getAttribute('uv');
  return [uv.getX(i), uv.getY(i)];
};

describe('stainTint', () => {
  it('leaves the photo alone when it already has the preset colour, and goes further with a higher stain', () => {
    const c = new THREE.Color(0.4, 0.3, 0.2);
    const same = stainTint(c, c, 0.55);
    expect([same.r, same.g, same.b].map((v) => +v.toFixed(6))).toEqual([1, 1, 1]);
    const dark = new THREE.Color(0.1, 0.05, 0.02);
    const mild = stainTint(dark, c, 0.3);
    const strong = stainTint(dark, c, 0.9);
    expect(strong.r).toBeLessThan(mild.r);
    expect(strong.r).toBeCloseTo(1 + (0.1 / 0.4 - 1) * 0.9, 6);
  });
});

describe('woodUV', () => {
  it('scales the grain by board size, so a long board repeats it instead of stretching it', () => {
    const short = new THREE.BoxGeometry(1, 1, 1);
    const long = new THREE.BoxGeometry(4, 1, 1);
    woodUV(short, 1, 1, 1, false, 0, 0);
    woodUV(long, 4, 1, 1, false, 0, 0);
    // Face 4 (+z) is w by h: its u range is the board width over one tile.
    const span = (g: THREE.BufferGeometry) => Math.max(...[16, 17, 18, 19].map((i) => uvOf(g, i)[0] ?? 0)) - Math.min(...[16, 17, 18, 19].map((i) => uvOf(g, i)[0] ?? 0));
    expect(span(long) / span(short)).toBeCloseTo(4, 6);
  });

  it('swaps u and v on the sides of an upright, and applies the shift', () => {
    const flat = new THREE.BoxGeometry(1, 2, 1);
    const upright = new THREE.BoxGeometry(1, 2, 1);
    woodUV(flat, 1, 2, 1, false, 0.25, 0.5);
    woodUV(upright, 1, 2, 1, true, 0.25, 0.5);
    const [fu, fv] = uvOf(flat, 0);
    const [uu, uvv] = uvOf(upright, 0);
    expect([uu, uvv]).toEqual([fv, fu]);
    // The top face (2) is not swapped, even on an upright.
    expect(uvOf(upright, 8)).toEqual(uvOf(flat, 8));
  });
});

describe('boardGeo', () => {
  it('is placed at its position and takes the same grain every time it is built', () => {
    const a = boardGeo(1, 1, 1, 3, 2, 1);
    const b = boardGeo(1, 1, 1, 3, 2, 1);
    a.computeBoundingBox();
    expect(a.boundingBox?.getCenter(new THREE.Vector3()).toArray()).toEqual([3, 2, 1]);
    expect(Array.from(a.getAttribute('uv').array)).toEqual(Array.from(b.getAttribute('uv').array));
    const other = boardGeo(1, 1, 1, 4, 2, 1);
    expect(Array.from(a.getAttribute('uv').array)).not.toEqual(Array.from(other.getAttribute('uv').array));
  });
});
