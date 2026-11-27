import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import * as THREE from 'three';

vi.mock('../src/scene/assets', () => ({loadModel: () => new Promise(() => undefined), contactShadow: () => new THREE.Object3D()}));

/** A 2D context that accepts every drawing call and does nothing. */
const fakeContext = (): CanvasRenderingContext2D =>
  new Proxy({}, {get: (_t, k) => (k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({addColorStop() {}}) : k === 'measureText' ? () => ({width: 10}) : () => undefined), set: () => true}) as unknown as CanvasRenderingContext2D;

beforeEach(() => {
  vi.stubGlobal('document', {createElement: () => ({width: 0, height: 0, getContext: fakeContext})});
});
afterEach(() => vi.unstubAllGlobals());

describe('room rebuild', () => {
  it('does not free the geometry that every sprite shares', async () => {
    const {createRoom} = await import('../src/scene/room');
    const scene = new THREE.Scene();
    const room = createRoom(scene, 1);
    const layout = {pitch: 5, count: 3, floorY: -5, tops: [4, 4, 4], depth: 1.7};
    room.layout(layout);
    const sprite = scene.children.flatMap((g) => g.children).find((o): o is THREE.Sprite => o instanceof THREE.Sprite);
    expect(sprite).toBeDefined();
    const disposed = vi.fn();
    sprite?.geometry.addEventListener('dispose', disposed);
    room.layout(layout);
    room.layout({...layout, count: 2, tops: [4, 4]});
    expect(disposed).not.toHaveBeenCalled();
  });

  it('frees the floor plane it made, so a rebuild does not leak one per call', async () => {
    const {createRoom} = await import('../src/scene/room');
    const scene = new THREE.Scene();
    const room = createRoom(scene, 1);
    const layout = {pitch: 5, count: 2, floorY: -5, tops: [4, 4], depth: 1.7};
    room.layout(layout);
    const plane = scene.children.flatMap((g) => g.children).find((o): o is THREE.Mesh => o instanceof THREE.Mesh && o.geometry instanceof THREE.PlaneGeometry);
    expect(plane).toBeDefined();
    const disposed = vi.fn();
    plane?.geometry.addEventListener('dispose', disposed);
    room.layout(layout);
    expect(disposed).toHaveBeenCalledTimes(1);
  });
});
