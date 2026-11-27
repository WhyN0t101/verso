import {afterEach, describe, expect, it, vi} from 'vitest';
import * as THREE from 'three';
import {createWood} from '../src/scene/wood';

/** A 2D context where every drawing call does nothing; reading pixels gives mid grey. */
const context = new Proxy(
  {},
  {
    get: (_t, prop) => {
      if (prop === 'getImageData') return () => ({data: new Uint8ClampedArray(8 * 8 * 4).fill(128)});
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => ({addColorStop: () => undefined});
      return () => undefined;
    },
  },
);

function stubBrowser(): {photoLoaded: Promise<void>; resolve: () => void} {
  vi.stubGlobal('document', {createElement: () => ({width: 0, height: 0, getContext: () => context})});
  let resolve!: () => void;
  const gate = new Promise<void>((r) => (resolve = r));
  vi.spyOn(THREE.TextureLoader.prototype, 'loadAsync').mockImplementation(async () => {
    await gate;
    // The loader's result is only read for its (stubbed) pixels, so an empty image stands in for it.
    return new THREE.Texture({} as HTMLImageElement) as THREE.Texture<HTMLImageElement>;
  });
  return {photoLoaded: gate, resolve};
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('createWood painted stand-in', () => {
  it('is freed once, when the wood photo takes over, and not before', async () => {
    const dispose = vi.spyOn(THREE.CanvasTexture.prototype, 'dispose');
    const gate = stubBrowser();
    let photoArrived = false;
    const wood = createWood(1, () => {
      photoArrived = true;
    });
    wood.apply('walnut');
    // Painting the stand-in again replaces the previous painted texture: one dispose, for the old one.
    expect(dispose).toHaveBeenCalledTimes(1);
    dispose.mockClear();

    gate.resolve();
    await vi.waitFor(() => expect(photoArrived).toBe(true));
    wood.apply('walnut');
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(wood.woodMat.bumpMap).toBeNull();
    dispose.mockClear();

    wood.apply('ebony');
    expect(dispose).not.toHaveBeenCalled();
  });
});
