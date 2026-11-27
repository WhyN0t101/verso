import {describe, expect, it} from 'vitest';
import {BoxGeometry} from 'three';
import {packBookFaces} from '../src/scene/faces';

const box = () => new BoxGeometry(1, 2, 0.5, 2, 2, 2).toNonIndexed();

describe('packBookFaces', () => {
  it('turns six face groups into four slots covering every vertex once', () => {
    const g = box();
    const before = g.getAttribute('position').count;
    const sorted = (a: ArrayLike<number>) => Array.from(a, (v) => v + 0).sort((x, y) => x - y); // +0 folds -0 into 0
    const xs = sorted(g.getAttribute('position').array);
    packBookFaces(g);
    expect(g.groups.map((x) => x.materialIndex)).toEqual([0, 1, 2, 3]);
    expect(g.groups.reduce((n, x) => n + x.count, 0)).toBe(before);
    expect(g.groups[3]?.count).toBe((before / 6) * 3);
    expect(sorted(g.getAttribute('position').array)).toEqual(xs);
    expect(g.getAttribute('uv').count).toBe(before);
  });

  it('puts the +x face (the cover) first', () => {
    const g = box();
    packBookFaces(g);
    const p = g.getAttribute('position');
    for (let i = 0; i < (g.groups[0]?.count ?? 0); i++) expect(p.getX(i)).toBeCloseTo(0.5);
  });

  it('rejects geometry without the six box groups', () => {
    expect(() => packBookFaces(new BoxGeometry())).toThrow();
  });
});
