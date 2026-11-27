import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import * as THREE from 'three';

const loaderBuilt = vi.fn();
const loadAsync = vi.fn();
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    constructor() {
      loaderBuilt();
    }
    setMeshoptDecoder() {
      return this;
    }
    loadAsync(url: string) {
      return loadAsync(url);
    }
  },
}));
vi.mock('three/examples/jsm/libs/meshopt_decoder.module.js', () => ({MeshoptDecoder: {}}));

const scene = () => {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial()));
  return {scene: g};
};

beforeEach(() => {
  vi.resetModules();
  loaderBuilt.mockClear();
  loadAsync.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe('model loader', () => {
  it('does not fetch the glTF loader until a model is asked for', async () => {
    await import('../src/scene/assets');
    await new Promise((r) => setTimeout(r, 0));
    expect(loaderBuilt).not.toHaveBeenCalled();
  });

  it('stands a model on y = 0, scaled to the height, and shares one file between copies', async () => {
    loadAsync.mockResolvedValue(scene());
    const {loadModel} = await import('../src/scene/assets');
    const a = await loadModel('vase', 4);
    await loadModel('vase', 4);
    expect(loadAsync).toHaveBeenCalledTimes(1);
    expect(loadAsync).toHaveBeenCalledWith('/models/vase.glb');
    const box = new THREE.Box3().setFromObject(a);
    expect(box.min.y).toBeCloseTo(0);
    expect(box.max.y).toBeCloseTo(4);
  });

  it('does not remember a failed load, so the next call tries again', async () => {
    loadAsync.mockRejectedValueOnce(new Error('network')).mockResolvedValue(scene());
    const {loadModel} = await import('../src/scene/assets');
    await expect(loadModel('plant', 1)).rejects.toThrow('network');
    await expect(loadModel('plant', 1)).resolves.toBeInstanceOf(THREE.Group);
    expect(loadAsync).toHaveBeenCalledTimes(2);
  });
});
