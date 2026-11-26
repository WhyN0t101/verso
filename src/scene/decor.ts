import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type DecorKind = 'plant' | 'globe' | 'candle' | 'clock';
export const DECOR_KINDS: readonly DecorKind[] = ['plant', 'globe', 'candle', 'clock'];

/** Widest any object is, so a shelf needs this much free room beside the last book. */
export const DECOR_WIDTH = 0.9;

interface Part {
  geo: THREE.BufferGeometry;
  color: number;
  at: [number, number, number];
  /** Rotation about x, y, z in radians. */
  turn?: [number, number, number];
  scale?: [number, number, number];
}

/** One geometry with a colour per vertex, so an object is a single draw call whatever it is made of. */
function merge(parts: Part[]): THREE.BufferGeometry {
  const geos = parts.map(({geo, color, at, turn, scale}) => {
    if (scale) geo.scale(...scale);
    if (turn) {
      geo.rotateX(turn[0]);
      geo.rotateY(turn[1]);
      geo.rotateZ(turn[2]);
    }
    geo.translate(...at);
    const c = new THREE.Color(color);
    const n = geo.getAttribute('position').count;
    const rgb = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.toArray(rgb, i * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
    return geo;
  });
  const out = mergeGeometries(geos);
  geos.forEach((g) => g.dispose());
  if (!out) throw new Error('decor geometries do not match');
  return out;
}

const TERRACOTTA = 0xb5653a;
const BRASS = 0xc19a4b;
const WOOD = 0x4f2f1a;

function plant(): THREE.BufferGeometry {
  const parts: Part[] = [{geo: new THREE.CylinderGeometry(0.28, 0.2, 0.42, 12), color: TERRACOTTA, at: [0, 0.21, 0]}];
  parts.push({geo: new THREE.CylinderGeometry(0.3, 0.3, 0.06, 12), color: 0x9c532f, at: [0, 0.42, 0]});
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const lean = 0.35 + (i % 3) * 0.18;
    parts.push({
      geo: new THREE.ConeGeometry(0.1, 0.62 + (i % 2) * 0.18, 5),
      color: i % 2 ? 0x4f7a3a : 0x6b9a4a,
      at: [Math.cos(a) * 0.13, 0.78, Math.sin(a) * 0.13],
      turn: [Math.sin(a) * lean, 0, -Math.cos(a) * lean],
    });
  }
  return merge(parts);
}

function globe(): THREE.BufferGeometry {
  const parts: Part[] = [
    {geo: new THREE.CylinderGeometry(0.3, 0.34, 0.08, 16), color: 0x3a2414, at: [0, 0.04, 0]},
    {geo: new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8), color: BRASS, at: [0, 0.33, 0]},
    {geo: new THREE.SphereGeometry(0.38, 16, 12), color: 0x3d6a8f, at: [0, 0.85, 0]},
    {geo: new THREE.TorusGeometry(0.42, 0.022, 6, 24), color: BRASS, at: [0, 0.85, 0], turn: [0, 0, 0.4]},
  ];
  // A few land masses lying on the surface.
  for (const [x, y, z, s] of [[0.2, 0.2, 0.27, 0.16], [-0.25, -0.05, 0.27, 0.14], [0.08, -0.28, 0.24, 0.12]] as const) {
    parts.push({geo: new THREE.SphereGeometry(s, 8, 6), color: 0x6c8a4b, at: [x, 0.85 + y, z], scale: [1, 1, 0.45]});
  }
  return merge(parts);
}

function candle(): THREE.BufferGeometry {
  const parts: Part[] = [{geo: new THREE.CylinderGeometry(0.24, 0.28, 0.08, 14), color: BRASS, at: [0, 0.04, 0]}];
  for (const [x, h] of [[-0.1, 0.55], [0.12, 0.38]] as const) {
    parts.push({geo: new THREE.CylinderGeometry(0.07, 0.07, h, 10), color: 0xeee4c8, at: [x, 0.08 + h / 2, 0]});
    parts.push({geo: new THREE.SphereGeometry(0.045, 8, 6), color: 0xffd37a, at: [x, 0.08 + h + 0.06, 0], scale: [1, 1.6, 1]});
  }
  return merge(parts);
}

function clock(): THREE.BufferGeometry {
  return merge([
    {geo: new THREE.BoxGeometry(0.7, 0.8, 0.34), color: WOOD, at: [0, 0.4, 0]},
    {geo: new THREE.CylinderGeometry(0.27, 0.27, 0.04, 20), color: 0xf0e6cc, at: [0, 0.44, 0.18], turn: [Math.PI / 2, 0, 0]},
    {geo: new THREE.BoxGeometry(0.035, 0.2, 0.02), color: 0x1a1209, at: [0, 0.52, 0.21]},
    {geo: new THREE.BoxGeometry(0.15, 0.03, 0.02), color: 0x1a1209, at: [0.06, 0.44, 0.21]},
    {geo: new THREE.BoxGeometry(0.78, 0.07, 0.4), color: WOOD, at: [0, 0.835, 0]},
  ]);
}

const BUILD: Record<DecorKind, () => THREE.BufferGeometry> = {plant, globe, candle, clock};

/** A small object standing on a shelf, centred on x and z with its base at y = 0. Dispose the geometry with the mesh. */
export const buildDecor = (kind: DecorKind): THREE.BufferGeometry => BUILD[kind]();
