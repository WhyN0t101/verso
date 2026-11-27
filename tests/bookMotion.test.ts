import {describe, expect, it} from 'vitest';
import * as THREE from 'three';
import {glowFor, stepBook, type MotionContext, type MotionResult} from '../src/scene/bookMotion';
import type {Entry} from '../src/scene/entry';
import type {Book} from '../src/types';

const entry = (id = 'a'): Entry => {
  const mats = [0, 1, 2, 3].map(() => new THREE.MeshStandardMaterial({color: 0x808080}));
  const home = new THREE.Vector3(2, 1, -0.5);
  const grp = new THREE.Group();
  grp.position.copy(home);
  return {b: {id, d: 1.1} as Book, grp, mats, home, base: mats.map((m) => m.color.clone()), tint: new THREE.Color(1, 1, 1), hasSpine: false, hasCover: false, caseIndex: 0, picked: false, lean: 0, glow: 0, match: true};
};
const ctx = (over: Partial<MotionContext> = {}): MotionContext => ({dt: 1 / 60, sel: undefined, target: null, filtering: false, hover: null, pointerX: 0, pointerY: 0, picked: new Set(), ...over});
const fresh = (): MotionResult => ({moved: 0, shadow: false});

describe('glowFor', () => {
  it('lights picked books strongest, matches softly, and no match while a book is open', () => {
    expect(glowFor(true, false, false, false)).toBe(0.45);
    expect(glowFor(false, true, true, false)).toBe(0.28);
    expect(glowFor(false, true, true, true)).toBe(0);
    expect(glowFor(false, true, false, false)).toBe(0);
    expect(glowFor(false, false, true, false)).toBe(0);
  });
});

describe('stepBook', () => {
  it('leaves a book at rest where it is, and reports no movement', () => {
    const e = entry();
    const out = fresh();
    stepBook(e, ctx(), out);
    expect(out).toEqual({moved: 0, shadow: false});
    expect(e.grp.position.toArray()).toEqual([2, 1, -0.5]);
  });

  it('lifts a hovered book forward and up, and reports it moved', () => {
    const e = entry('h');
    const out = fresh();
    stepBook(e, ctx({hover: 'h'}), out);
    expect(e.grp.position.y).toBeGreaterThan(1);
    expect(e.grp.position.z).toBeGreaterThan(-0.5);
    expect(out.moved).toBeGreaterThan(0);
    expect(out.shadow).toBe(false);
  });

  it('settles on its target in a bounded time, after which it reports nothing', () => {
    const e = entry('h');
    const out = fresh();
    let frames = 0;
    do {
      out.moved = 0;
      stepBook(e, ctx({hover: 'h'}), out);
    } while (out.moved > 0 && ++frames < 2000);
    expect(frames).toBeLessThan(500);
    expect(e.grp.position.y).toBeCloseTo(1.1, 3);
  });

  it('pulls the open book to the target, asks for a shadow redraw, and dims the others', () => {
    const open = entry('o');
    const other = entry('x');
    const target = {pos: new THREE.Vector3(0, 0, 3), s: 1.5};
    const out = fresh();
    for (let i = 0; i < 5; i++) {
      stepBook(open, ctx({sel: open, target}), out);
      stepBook(other, ctx({sel: open, target}), out);
    }
    expect(open.grp.position.z).toBeGreaterThan(-0.5);
    expect(out.shadow).toBe(true);
    expect(open.tint.r).toBeCloseTo(1, 6);
    expect(other.tint.r).toBeLessThan(1);
    expect(other.mats[0]?.color.r).toBeLessThan(other.base[0]?.r ?? 0);
  });

  it('gives picked books a glow on every face except the cover, which keeps its own', () => {
    const e = entry('p');
    e.mats[0]?.emissive.setHex(0x112233);
    stepBook(e, ctx({picked: new Set(['p'])}), fresh());
    expect(e.picked).toBe(true);
    expect(e.mats[1]?.emissiveIntensity).toBe(0.45);
    expect(e.mats[0]?.emissive.getHex()).toBe(0x112233);
    stepBook(e, ctx(), fresh());
    expect(e.mats[1]?.emissiveIntensity).toBe(0);
  });
});
