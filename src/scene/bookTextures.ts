import * as THREE from 'three';
import type {Book} from '../types';
import {hsl} from '../util';
import {drawCover, paletteOf, sat, spineCanvas, spineLook} from '../textures/draw';
import {largeCover, loadCover} from '../covers';
import {caseX} from './wall';
import {MAT, type Entry} from './entry';

// The cover face gets part of its brightness from the picture itself (emissive) so the lamp's warmth and
// angle cannot wash it out: albedo * light + glow comes to about the picture's own brightness.
const FACE_ALBEDO = 0.4;
const FACE_GLOW = 0.72;
/** Milliseconds per frame spent drawing spine textures; the nearest bookcase is done first. */
const SPINE_BUDGET_MS = 8;
/** Time between releases of far-away spines. Time, not frames: a loop that sleeps draws too few frames to count. */
const SWEEP_MS = 2000;
const FADE_S = 0.4;

/** Cache key of one of a book's textures: the id and version tell when it is out of date. */
export const textureKey = (b: Book, kind: 'spine' | 'cover'): string => `${b.id}:${b.v}:${kind}`;
/** The id-and-version part of a cache key, shared by all textures of one version of a book. */
const versionPrefix = (key: string): string => key.slice(0, key.lastIndexOf(':') + 1);

/** Cache keys that no live book version owns: deleted books and old versions of edited ones. */
export function staleKeys(keys: Iterable<string>, books: readonly Book[]): string[] {
  const live = new Set(books.map((b) => `${b.id}:${b.v}:`));
  return [...keys].filter((k) => !live.has(versionPrefix(k)));
}

/** How far from the camera (in world x) a bookcase may be and still get spine textures. */
export const spineReach = (camDist: number, fovT: number, aspect: number, pitch: number): number => camDist * fovT * aspect + pitch * 0.6;

/** Books whose spine is missing and whose bookcase is within `reach` of the camera, nearest bookcase first. Null when none, so an idle shelf allocates nothing. */
export function spinesToDraw<T extends {caseIndex: number; hasSpine: boolean}>(entries: Iterable<T>, panCur: number, pitch: number, reach: number): T[] | null {
  let todo: {e: T; d: number}[] | null = null;
  for (const e of entries) {
    const d = Math.abs(caseX(e.caseIndex, pitch) - panCur);
    if (e.hasSpine || d > reach) continue;
    (todo ??= []).push({e, d});
  }
  return todo ? todo.sort((a, c) => a.d - c.d).map((x) => x.e) : null;
}

/** Whether the interval since the last release of far spines has passed. */
export const sweepDue = (now: number, last: number, interval: number): boolean => now - last >= interval;

/** Drawn spines (other than the open book's) whose bookcase is far beyond the view: their textures can go. */
export function farSpines<T extends {caseIndex: number; hasSpine: boolean}>(entries: Iterable<T>, sel: T | undefined, pitch: number, panCur: number, reach: number): T[] {
  const out: T[] = [];
  for (const e of entries) if (e.hasSpine && e !== sel && isFarSpine(e.caseIndex, pitch, panCur, reach)) out.push(e);
  return out;
}

/** Whether a drawn spine is so far from the camera that its texture should be released. */
export const isFarSpine = (caseIndex: number, pitch: number, panCur: number, reach: number): boolean => Math.abs(caseX(caseIndex, pitch) - panCur) > reach * 3;

/** Flat colours of the cover, back board and spine before (or without) a texture. */
export const faceColors = (b: Book): [THREE.Color, THREE.Color, THREE.Color] => {
  const p = paletteOf(b);
  const spine = spineLook(b);
  return [new THREE.Color(hsl(p.h, sat(p, 0), 28)), new THREE.Color(hsl(p.h, sat(p, 0), 22)), new THREE.Color(hsl(spine.h, spine.s, spine.l))];
};

/** Puts a picture on a cover-face material, with the glow that keeps it true to the picture. */
function faceLook(m: THREE.MeshStandardMaterial, tex: THREE.Texture): void {
  m.map = tex;
  m.emissiveMap = tex;
  m.emissive.setHex(0xffffff);
  m.emissiveIntensity = FACE_GLOW;
  m.needsUpdate = true;
}

interface Fade {
  e: Entry;
  plane: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  tex: THREE.Texture;
  generated: THREE.Texture | undefined;
  t: number;
}

export interface BookTextures {
  /** Drops the textures of deleted books and of old versions of edited ones. */
  prune(books: readonly Book[]): void;
  /** The book's stored tone changed: recolour it and forget its textures, so they are made again. */
  retone(e: Entry): void;
  /** Called every frame: the open book's cover, spines near the camera (within a time budget) and the release of far ones. */
  update(sel: Entry | undefined, camDist: number, fovT: number, aspect: number, pitch: number, panCur: number): void;
  /** Releases the textures of spines far from the camera now. The frame loop calls it when it goes to sleep, so a pan that ends does not leave them behind. */
  release(sel: Entry | undefined, camDist: number, fovT: number, aspect: number, pitch: number, panCur: number): void;
  /** A book that was open was put back before its cover arrived: stop the request, and start over next time. */
  cancelCover(e: Entry): void;
  /** Advances the cover cross-fades by `dt` seconds. Returns how many ran, so the loop knows to keep drawing. */
  stepFades(dt: number): number;
}

export interface BookTexturesDeps {
  maxAniso: number;
  entries: ReadonlyMap<string, Entry>;
  /** Something on screen changed: draw once more. */
  dirty(): void;
}

/**
 * Textures of the books: generated spines and covers on demand, the real cover that fades in over the generated
 * one, and the release of what is no longer needed. Owns the cache; the entries hold only the materials.
 */
export function createBookTextures(d: BookTexturesDeps): BookTextures {
  const texCache = new Map<string, THREE.Texture>();
  /** Cover textures whose real image has been requested, so each is fetched once. */
  const realCovers = new Set<string>();
  const fades = new Set<Fade>();
  let lastSweep = performance.now();

  function getTex(b: Book, kind: 'spine' | 'cover'): THREE.Texture {
    const k = textureKey(b, kind);
    const hit = texCache.get(k);
    if (hit) return hit;
    const cv = kind === 'spine' ? spineCanvas(b) : drawCover(b, Math.round(b.d * 260), Math.round(b.h * 260));
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = d.maxAniso;
    texCache.set(k, t);
    return t;
  }

  function drop(k: string): void {
    texCache.get(k)?.dispose();
    texCache.delete(k);
    realCovers.delete(k);
  }

  function applySpine(e: Entry): void {
    const m = e.mats[MAT.spine];
    if (!m) return;
    m.map = getTex(e.b, 'spine');
    m.needsUpdate = true;
    e.base[MAT.spine]?.set(0xffffff);
    e.hasSpine = true;
    d.dirty();
  }

  /** Gives a spine back its flat colour and frees its texture, once its bookcase is far from the camera. */
  function evictSpine(e: Entry): void {
    const m = e.mats[MAT.spine];
    const k = textureKey(e.b, 'spine');
    texCache.get(k)?.dispose();
    texCache.delete(k);
    if (m) {
      m.map = null;
      m.needsUpdate = true;
      e.base[MAT.spine]?.copy(faceColors(e.b)[2]);
      m.color.copy(e.base[MAT.spine] as THREE.Color).multiply(e.tint);
    }
    e.hasSpine = false;
  }

  function endFade(f: Fade): void {
    fades.delete(f);
    f.plane.parent?.remove(f.plane);
    f.plane.geometry.dispose();
    f.mat.dispose();
    // The box face takes over the real texture; the generated one is no longer shown anywhere.
    const m = f.e.mats[MAT.cover];
    if (m && d.entries.get(f.e.b.id) === f.e) faceLook(m, f.tex);
    f.generated?.dispose();
    d.dirty();
  }

  function startFade(e: Entry, tex: THREE.Texture, generated: THREE.Texture | undefined): void {
    // A newer cover arriving mid-fade: let the running one finish at once so two overlays never stack.
    for (const f of [...fades]) if (f.e === e) endFade(f);
    const host = e.grp.children[0] as THREE.Mesh;
    const mat = new THREE.MeshStandardMaterial({map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: FACE_GLOW, roughness: 0.6, transparent: true, opacity: 0, depthWrite: false});
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(e.b.d, e.b.h), mat);
    // Same orientation as the box's +x face, a hair in front of it.
    plane.rotation.y = Math.PI / 2;
    plane.position.x = e.b.w / 2 + 0.002;
    host.add(plane);
    fades.add({e, plane, mat, tex, generated, t: 0});
    d.dirty();
  }

  /** The cover face only shows on the pulled-out book, so its texture is made on first selection. */
  function applyCover(e: Entry): void {
    const m = e.mats[MAT.cover];
    if (!m) return;
    faceLook(m, getTex(e.b, 'cover'));
    e.base[MAT.cover]?.setScalar(FACE_ALBEDO);
    e.hasCover = true;
    d.dirty();
    const b = e.b;
    const k = textureKey(b, 'cover');
    if (!b.cover || realCovers.has(k)) return;
    realCovers.add(k);
    const ctl = (e.coverCtl = new AbortController());
    e.coverPending = true;
    // The generated cover shows immediately. The medium cover fades in over it, then the large one over that.
    const show = (img: HTMLImageElement): void => {
      if (!texCache.has(k) || d.entries.get(b.id) !== e) return;
      const t = new THREE.Texture(img);
      t.colorSpace = THREE.SRGBColorSpace;
      // The cover is shown near its own size, so mipmaps would only cost a generation pass on upload.
      t.generateMipmaps = false;
      t.minFilter = THREE.LinearFilter;
      t.needsUpdate = true;
      const previous = texCache.get(k);
      texCache.set(k, t);
      startFade(e, t, previous);
    };
    void loadCover(b.cover, {signal: ctl.signal})
      .then((img) => {
        if (img) show(img);
        // The large cover waits for the medium fade to end, so two texture uploads never land in one frame.
        return new Promise<void>((done) => setTimeout(done, FADE_S * 1000 + 100)).then(() => loadCover(largeCover(b.cover as string), {signal: ctl.signal}));
      })
      .then((img) => {
        if (img) show(img);
      })
      .finally(() => {
        e.coverPending = false;
      });
  }

  return {
    prune(books) {
      for (const k of staleKeys(texCache.keys(), books)) drop(k);
    },

    retone(e) {
      const b = e.b;
      const prefix = `${b.id}:${b.v}:`;
      for (const k of [...texCache.keys()]) if (k.startsWith(prefix)) drop(k);
      b.v++;
      const [cover, back, spine] = faceColors(b);
      e.base[MAT.cover]?.copy(cover);
      e.base[MAT.back]?.copy(back);
      e.base[MAT.spine]?.copy(spine);
      for (const i of [MAT.cover, MAT.spine]) {
        const m = e.mats[i];
        if (m) {
          m.map = null;
          m.emissiveMap = null;
          m.emissive.setHex(0x000000);
          m.emissiveIntensity = 0;
          m.needsUpdate = true;
        }
      }
      e.hasSpine = false;
      e.hasCover = false;
      d.dirty();
    },

    update(sel, camDist, fovT, aspect, pitch, panCur) {
      if (sel && !sel.hasCover) applyCover(sel);
      // Only books in bookcases near the camera get a spine texture, within a time budget per frame, so 100+ books do not stall startup.
      const reach = spineReach(camDist, fovT, aspect, pitch);
      // Every couple of seconds, spines far beyond the view are released, so panning a big wall does not keep them all in memory.
      const now = performance.now();
      if (sweepDue(now, lastSweep, SWEEP_MS)) {
        lastSweep = now;
        for (const e of farSpines(d.entries.values(), sel, pitch, panCur, reach)) evictSpine(e);
      }
      // Nearest bookcases first, so what is on screen gets its spine before what is merely close; a time budget keeps frames smooth.
      const todo = spinesToDraw(d.entries.values(), panCur, pitch, reach);
      if (!todo) return;
      const start = performance.now();
      for (const e of todo) {
        applySpine(e);
        if (performance.now() - start > SPINE_BUDGET_MS) break;
      }
    },

    release(sel, camDist, fovT, aspect, pitch, panCur) {
      lastSweep = performance.now();
      for (const e of farSpines(d.entries.values(), sel, pitch, panCur, spineReach(camDist, fovT, aspect, pitch))) evictSpine(e);
    },

    cancelCover(e) {
      if (!e.coverPending) return;
      e.coverPending = false;
      e.coverCtl?.abort();
      e.hasCover = false;
      realCovers.delete(textureKey(e.b, 'cover'));
    },

    stepFades(dt) {
      let running = 0;
      for (const f of fades) {
        f.t += dt / FADE_S;
        f.mat.opacity = Math.min(f.t, 1);
        f.mat.color.copy(f.e.base[MAT.cover] ?? f.e.tint).multiply(f.e.tint);
        running++;
        if (f.t >= 1 || d.entries.get(f.e.b.id) !== f.e) endFade(f);
      }
      return running;
    },
  };
}
