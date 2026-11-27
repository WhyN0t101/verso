import * as THREE from 'three';
import {hash, rng} from '../util';
import {WOODS, type WoodPreset} from '../presets';
import type {WoodId} from '../types';
import {pagesCanvas} from '../textures/draw';

/** How far the photographed wood is stained towards a preset's colour: 0 keeps the photo, 1 is the preset's flat colour. */
const DEFAULT_STAIN = 0.55;
/** World units covered by one repeat of the wood grain texture. */
const WOOD_TILE = 1.9;

/** Average colour of an image, read from a tiny copy of it. */
function meanColor(img: CanvasImageSource): THREE.Color {
  const c = document.createElement('canvas');
  c.width = c.height = 8;
  const g = c.getContext('2d', {willReadFrequently: true});
  if (!g) throw new Error('2D canvas unavailable');
  g.drawImage(img, 0, 0, 8, 8);
  const px = g.getImageData(0, 0, 8, 8).data;
  let r = 0;
  let gr = 0;
  let b = 0;
  for (let i = 0; i < px.length; i += 4) {
    r += px[i] ?? 0;
    gr += px[i + 1] ?? 0;
    b += px[i + 2] ?? 0;
  }
  const n = (px.length / 4) * 255;
  return new THREE.Color().setRGB(r / n, gr / n, b / n, THREE.SRGBColorSpace);
}

/**
 * Colour multiplier that turns the photographed grain (average colour `mean`) towards a preset's wood colour.
 * `stain` is how far: part of the way keeps the photo's own depth; the dark woods go further (see WoodPreset.stain).
 */
export function stainTint(base: THREE.Color, mean: THREE.Color, stain: number): THREE.Color {
  return new THREE.Color(1, 1, 1).lerp(new THREE.Color(base.r / mean.r, base.g / mean.g, base.b / mean.b), stain);
}

/** Maps the wood texture at a fixed size per world unit, so grain is not stretched on long or tall boards. */
export function woodUV(g: THREE.BoxGeometry, w: number, h: number, d: number, upright: boolean, shiftU: number, shiftV: number): void {
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  // BoxGeometry faces in order: +x, -x, +y, -y, +z, -z, four vertices each.
  const sizes: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  sizes.forEach(([a, b], face) => {
    // Uprights have their grain along the height; the texture's lines run along u, so u and v swap on their sides.
    const swap = upright && face !== 2 && face !== 3;
    for (let i = face * 4; i < face * 4 + 4; i++) {
      const u = (uv.getX(i) * a) / WOOD_TILE + shiftU;
      const v = (uv.getY(i) * b) / WOOD_TILE + shiftV;
      if (swap) uv.setXY(i, v, u);
      else uv.setXY(i, u, v);
    }
  });
}

/** A board's geometry already placed at x, y, z, so boards of one bookcase can be merged into a single mesh. */
export function boardGeo(w: number, h: number, d: number, x: number, y: number, z: number, upright = false): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  // Each board takes its grain from a different part of the photo, so no two look cut from the same strip.
  const pick = rng(hash(`${x.toFixed(2)}|${y.toFixed(2)}|${z.toFixed(2)}`));
  woodUV(g, w, h, d, upright, pick(), pick());
  return g.translate(x, y, z);
}

function woodTexture(w: WoodPreset, maxAniso: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable');
  g.fillStyle = w.base;
  g.fillRect(0, 0, 512, 512);
  const rand = rng(7); // seeded so the grain is the same on every load
  for (let i = 0; i < 300; i++) {
    const y = rand() * 512;
    const dark = rand() < 0.65;
    g.strokeStyle = dark ? `rgba(${w.dark},${0.05 + rand() * 0.14})` : `rgba(${w.light},${0.04 + rand() * 0.08})`;
    g.lineWidth = 0.6 + rand() * 2.4;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= 512; x += 64) g.lineTo(x, y + Math.sin(x * 0.02 + i) * 3);
    g.stroke();
  }
  // A few knots, where the grain swirls round a darker core.
  for (let i = 0; i < 5; i++) {
    const kx = rand() * 512;
    const ky = rand() * 512;
    for (let ring = 5; ring > 0; ring--) {
      g.strokeStyle = `rgba(${w.dark},${0.08 + (5 - ring) * 0.035})`;
      g.lineWidth = 1.5;
      g.beginPath();
      g.ellipse(kx, ky, ring * 4.5, ring * 2.4, 0, 0, Math.PI * 2);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  return t;
}

/** Soft shadow for one row of the back panel: dark under the board above, at the sides and at the foot. */
function rowShadeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable');
  const band = (x0: number, y0: number, x1: number, y1: number, alpha: number): void => {
    const grd = g.createLinearGradient(x0, y0, x1, y1);
    grd.addColorStop(0, `rgba(0,0,0,${alpha})`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, c.width, c.height);
  };
  band(0, 0, 0, c.height * 0.45, 0.6);
  band(0, c.height, 0, c.height * 0.8, 0.3);
  band(0, 0, c.width * 0.14, 0, 0.4);
  band(c.width, 0, c.width * 0.86, 0, 0.4);
  return new THREE.CanvasTexture(c);
}

export interface Wood {
  /** Boards, sides, fascia and mouldings. */
  woodMat: THREE.MeshStandardMaterial;
  /** The back panel of a bookcase. */
  backMat: THREE.MeshStandardMaterial;
  /** Soft shade strips on the back panel. */
  rowShade: THREE.MeshBasicMaterial;
  /** The paper texture shared by every book's page faces. */
  pagesTex: THREE.CanvasTexture;
  /** Re-reads the finish: stains the photographed grain, or paints the stand-in grain until the photo has loaded. */
  apply(woodId: WoodId): void;
}

/**
 * The wood of the bookcases: materials, the painted stand-in grain, and the photographed grain (CC0, see
 * public/textures/CREDITS.md) that replaces it once loaded. `onPhoto` runs then, so the owner can re-apply the settings.
 */
export function createWood(maxAniso: number, onPhoto: () => void): Wood {
  let wood: THREE.CanvasTexture | null = woodTexture(WOODS.walnut, maxAniso);
  const woodMat = new THREE.MeshStandardMaterial({map: wood, bumpMap: wood, bumpScale: 0.8, roughness: 0.72, metalness: 0});
  const backMat = new THREE.MeshStandardMaterial({map: wood, color: 0x7a6050, roughness: 0.9});
  const pagesTex = new THREE.CanvasTexture(pagesCanvas());
  pagesTex.colorSpace = THREE.SRGBColorSpace;
  pagesTex.anisotropy = maxAniso;
  const rowShade = new THREE.MeshBasicMaterial({map: rowShadeTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1});

  let photo: {map: THREE.Texture; normal: THREE.Texture; mean: THREE.Color} | null = null;
  const textures = new THREE.TextureLoader();
  void Promise.all([textures.loadAsync('/textures/wood_diff.jpg'), textures.loadAsync('/textures/wood_nor.jpg')])
    .then(([map, normal]) => {
      for (const t of [map, normal]) {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = maxAniso;
      }
      map.colorSpace = THREE.SRGBColorSpace;
      photo = {map, normal, mean: meanColor(map.image as CanvasImageSource)};
      woodMat.normalScale.set(1, 1);
      onPhoto();
    })
    .catch((err: unknown) => console.warn('wood photo unavailable', err));

  return {
    woodMat,
    backMat,
    rowShade,
    pagesTex,
    apply(woodId) {
      if (photo) {
        // The photographed grain is tinted so its average colour becomes the preset's wood colour.
        const tint = stainTint(new THREE.Color(WOODS[woodId].base), photo.mean, WOODS[woodId].stain ?? DEFAULT_STAIN);
        woodMat.map = photo.map;
        woodMat.normalMap = photo.normal;
        woodMat.bumpMap = null;
        woodMat.color.copy(tint);
        backMat.map = photo.map;
        backMat.color.copy(tint).multiplyScalar(0.5);
        // The painted stand-in is no longer used by any material; free its texture.
        wood?.dispose();
        wood = null;
      } else {
        const old = wood;
        wood = woodTexture(WOODS[woodId], maxAniso);
        woodMat.map = wood;
        woodMat.bumpMap = wood;
        backMat.map = wood;
        old?.dispose();
      }
      woodMat.needsUpdate = backMat.needsUpdate = true;
    },
  };
}
