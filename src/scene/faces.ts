import * as THREE from 'three';

/** Face groups of a box, in BoxGeometry order, listed per material slot: cover, back board, spine, pages. */
const SLOTS = [[0], [1], [4], [2, 3, 5]];

/**
 * Regroups a non-indexed box geometry with six face groups (+x, -x, +y, -y, +z, -z, as RoundedBoxGeometry makes)
 * into four material slots: 0 cover (+x), 1 back board (-x), 2 spine (+z), 3 pages (+y, -y, -z). The three paper
 * faces share one material, so a book costs four draw calls instead of six.
 */
export function packBookFaces(g: THREE.BufferGeometry): void {
  if (g.getIndex() || g.groups.length !== 6) throw new Error('expected a non-indexed box with six face groups');
  const faces = [...g.groups];
  for (const name of Object.keys(g.attributes)) {
    const a = g.getAttribute(name);
    if (!(a instanceof THREE.BufferAttribute)) continue;
    const parts = SLOTS.flat().map((f) => {
      const {start, count} = faces[f] as THREE.GeometryGroup;
      return a.array.slice(start * a.itemSize, (start + count) * a.itemSize);
    });
    // Safe: `a.array.constructor` is the typed-array class of this very attribute, so the copy keeps its element type (Float32 for position, uv, normal).
    const packed = new (a.array.constructor as new (n: number) => typeof a.array)(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) {
      packed.set(p, at);
      at += p.length;
    }
    g.setAttribute(name, new THREE.BufferAttribute(packed, a.itemSize, a.normalized));
  }
  g.clearGroups();
  let start = 0;
  SLOTS.forEach((slot, material) => {
    const count = slot.reduce((n, f) => n + (faces[f] as THREE.GeometryGroup).count, 0);
    g.addGroup(start, count, material);
    start += count;
  });
}
