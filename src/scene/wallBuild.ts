import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type {Book} from '../types';
import {hash, rng} from '../util';
import {SERIF, bookKind, type BookKind} from '../textures/draw';
import {contactShadow, loadModel, type ModelName} from './assets';
import {packBookFaces} from './faces';
import {layoutPlate} from './plate';
import {CASE_ROWS, caseX, fasciaText, layoutWall, type Wall} from './wall';
import {faceColors} from './bookTextures';
import type {Entry} from './entry';
import {boardGeo, type Wood} from './wood';

const ROW_H = 2.55;
const BOARD = 0.16;
const SIDE = 0.22;
export const DEPTH = 1.7;
const WIDTHS = [3.6, 4.2, 4.8];
const FASCIA_H = 0.6;
/** Crown moulding above the fascia: two stepped slabs. */
const CORNICE_H = 0.14;
export const PLINTH_H = 0.3;
/** Empty space around the framed bookcase: room for the lamp above and the floor below. */
const VIEW_MARGIN = 0.6;
/** How a binding looks and feels: corner radius, and how glossy the spine is. Paperbacks are soft and matt, jackets glossy. */
const BINDING: Record<BookKind, {radius: number; gloss: number}> = {
  hardcover: {radius: 0.016, gloss: 0.55},
  paperback: {radius: 0.034, gloss: 0.85},
  jacket: {radius: 0.02, gloss: 0.3},
};
/** Objects standing on the free end of a shelf: at most this many per bookcase. */
const MAX_DECOR = 3;
/** What stands on a shelf, and how tall in world units. Real models, loaded on demand. */
const DECOR: {name: ModelName; height: number}[] = [
  {name: 'vase', height: 1.2},
  {name: 'plant', height: 1.3},
];
/** Free width a shelf needs beside its last book for one of them. */
const DECOR_WIDTH = 0.9;
/** A book may stand this far out of line with its row, so spines are not a ruled edge. */
const MAX_PULL = 0.09;
const MAX_LEAN = 0.14;

/** Which bookcase width suits the window: narrow windows get a narrower case, so fewer books per row. */
export const widthBucket = (aspect: number): number => (aspect < 0.75 ? 0 : aspect < 1.15 ? 1 : 2);
/** Inside width of a bookcase for a width bucket (before the first resize, the middle one). */
export const innerWidthFor = (bucket: number): number => WIDTHS[bucket < 0 ? 1 : bucket] ?? 4.2;

/**
 * Where a book stands and how it leans. Seeded by id, so a book stands the same way after every rebuild.
 * A book at the end of a half-empty row may lean on its neighbour, if there is room for its high corner.
 */
export function standBook(b: Book, bx: number, at: number, rowLength: number, ox: number, floor: number, innerW: number): {home: [number, number, number]; lean: number} {
  const r = rng(hash(b.id));
  const pull = r() * MAX_PULL;
  const angle = 0.06 + r() * (MAX_LEAN - 0.06);
  const lean = at > 0 && at === rowLength - 1 && r() < 0.75 && innerW - 0.1 - (bx + b.w) > 2 * (b.h / 2) * Math.sin(angle) + 0.06 ? angle : 0;
  // A leaning book keeps its low corner on the board and its high corner clear of the book it rests against.
  return {
    home: [
      ox - innerW / 2 + 0.06 + bx + b.w / 2 + (b.h / 2) * Math.sin(lean),
      floor + (b.h / 2) * Math.cos(lean) + (b.w / 2) * Math.sin(lean),
      -DEPTH / 2 + 0.1 + pull + b.d / 2,
    ],
    lean,
  };
}

/** A mesh's materials as a list, whether it has one or several. */
const materialsOf = (m: THREE.Mesh): THREE.Material[] => (Array.isArray(m.material) ? m.material : [m.material]);

function shadowed(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}

/** Brass plate on the fascia naming the sections of a bookcase. */
function fasciaPlate(text: string, ox: number, y: number, wallW: number, maxAniso: number): THREE.Mesh {
  const w = wallW * 0.94;
  const h = FASCIA_H * 0.78;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = Math.round((1024 * h) / w);
  const g = c.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable');
  const brass = g.createLinearGradient(0, 0, 0, c.height);
  brass.addColorStop(0, '#d6b36a');
  brass.addColorStop(1, '#a8823d');
  g.fillStyle = brass;
  g.fillRect(0, 0, c.width, c.height);
  // Brushed grain, a bevelled rim and a screw at each end, so the plate reads as metal fixed to the wood.
  const grain = rng(hash('plate' + text));
  for (let i = 0; i < 260; i++) {
    g.fillStyle = grain() < 0.5 ? 'rgba(255,240,200,.07)' : 'rgba(60,35,10,.07)';
    g.fillRect(0, grain() * c.height, c.width, 1);
  }
  g.lineWidth = 3;
  g.strokeStyle = 'rgba(255,240,200,.55)';
  g.strokeRect(2, 2, c.width - 4, c.height - 4);
  g.strokeStyle = 'rgba(70,45,12,.55)';
  g.beginPath();
  g.moveTo(c.width - 1.5, 3);
  g.lineTo(c.width - 1.5, c.height - 1.5);
  g.lineTo(3, c.height - 1.5);
  g.stroke();
  for (const sx of [c.height * 0.5, c.width - c.height * 0.5]) {
    g.fillStyle = 'rgba(70,45,12,.75)';
    g.beginPath();
    g.arc(sx, c.height / 2, c.height * 0.1, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#c9a65a';
    g.beginPath();
    g.arc(sx - 1, c.height / 2 - 1, c.height * 0.085, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(60,38,10,.8)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(sx - c.height * 0.06, c.height / 2 + c.height * 0.04);
    g.lineTo(sx + c.height * 0.06, c.height / 2 - c.height * 0.04);
    g.stroke();
  }
  // Dark ink on brass: about 7:1, readable at a glance.
  g.fillStyle = '#2a1b0c';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  // Long names wrap onto two lines instead of shrinking until they cannot be read.
  const {lines, fontSize} = layoutPlate(text, c.width - c.height * 1.3, c.height, (s, size) => {
    g.font = `600 ${size}px ${SERIF}`;
    return g.measureText(s).width;
  });
  g.font = `600 ${fontSize}px ${SERIF}`;
  const leading = fontSize * 1.08;
  lines.forEach((line, i) => g.fillText(line, c.width / 2, c.height / 2 + (i - (lines.length - 1) / 2) * leading + fontSize * 0.04));
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = maxAniso;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({map}));
  m.position.set(ox, y, DEPTH / 2 + 0.095);
  m.userData.plate = true;
  return m;
}

/** What a build leaves behind for the rest of the shelf. */
export interface WallBuild {
  wall: Wall;
  innerW: number;
  /** Total height of a full bookcase. */
  Hs: number;
  /** Total width of a bookcase, sides included. */
  Wtot: number;
  /** Spacing between bookcase centres. */
  pitch: number;
  /** World y of the floor of the lowest shelf's board. */
  baseY: number;
  /** Per bookcase: centre height and the height to frame. */
  caseView: {cy: number; h: number}[];
  /** Per bookcase: world y of the top edge, fascia and cornice included. */
  tops: number[];
  /** What the jump list shows, as a string, so a frame only compares two strings. */
  sectionsKey: string;
  /** True when no book stood on the wall before this build (the first one). */
  first: boolean;
}

export interface WallBuilderDeps {
  frame: THREE.Group;
  bookRoot: THREE.Group;
  /** Shelf objects: copies of shared models, so clearing them frees nothing. */
  decorRoot: THREE.Group;
  entries: Map<string, Entry>;
  pickables: THREE.Mesh[];
  wood: Wood;
  maxAniso: number;
  /** Something on screen changed: draw once more. */
  dirty(): void;
}

export interface WallBuilder {
  /** Rebuilds bookcases and books from the list. Books keep their pose, so edits do not make them jump. */
  build(books: readonly Book[], groupByGenre: boolean, innerW: number): WallBuild;
}

export function createWallBuilder(d: WallBuilderDeps): WallBuilder {
  const {frame, bookRoot, decorRoot, entries, pickables} = d;
  const {woodMat, backMat, rowShade, pagesTex} = d.wood;
  let buildNo = 0;

  function clearFrame(): void {
    for (const m of frame.children.slice()) {
      if (m instanceof THREE.Mesh) {
        m.geometry.dispose();
        // Genre plates own their texture and material; the shared wood material is left alone.
        if (m.userData.plate) for (const mat of materialsOf(m)) {
          if (mat instanceof THREE.MeshBasicMaterial) mat.map?.dispose();
          mat.dispose();
        }
      }
      frame.remove(m);
    }
  }

  function clearBooks(): void {
    for (const grp of bookRoot.children.slice()) {
      grp.children.forEach((m) => {
        if (!(m instanceof THREE.Mesh)) return;
        m.geometry.dispose();
        // The three paper faces share one material: a Set disposes it once.
        new Set(materialsOf(m)).forEach((x) => x.dispose());
      });
      bookRoot.remove(grp);
    }
    entries.clear();
    pickables.length = 0;
  }

  return {
    build(books, groupByGenre, innerW) {
      const build = ++buildNo;
      decorRoot.clear();
      const prev = new Map<string, {p: THREE.Vector3; r: THREE.Euler; s: number}>();
      entries.forEach((e, id) => prev.set(id, {p: e.grp.position.clone(), r: e.grp.rotation.clone(), s: e.grp.scale.x}));
      clearFrame();
      clearBooks();
      const wall = layoutWall([...books], innerW, groupByGenre);
      const sectionsKey = wall.sections.map((x) => `${x.name}:${x.count}:${x.firstCase}:${x.contains?.length ?? 0}`).join(',');
      const Hs = CASE_ROWS * ROW_H + BOARD;
      const Wtot = innerW + 2 * SIDE;
      const pitch = Wtot + 0.24;
      // Cases stand on one floor; a shorter last case simply ends lower.
      const baseY = -Hs / 2;
      const caseView: {cy: number; h: number}[] = [];
      const tops: number[] = [];
      for (const c of wall.cases) {
        const rows = c.rows.length;
        const Hc = rows * ROW_H + BOARD;
        const yc = baseY + Hc / 2;
        const ox = caseX(c.index, pitch);
        // Every wooden part of a bookcase is merged into one mesh (and the shade strips into another): a case costs a few draws, not twenty.
        const wood: THREE.BufferGeometry[] = [];
        const shades: THREE.BufferGeometry[] = [];
        wood.push(boardGeo(SIDE, Hc, DEPTH, ox - (innerW / 2 + SIDE / 2), yc, 0, true));
        wood.push(boardGeo(SIDE, Hc, DEPTH, ox + innerW / 2 + SIDE / 2, yc, 0, true));
        frame.add(shadowed(boardGeo(Wtot, Hc, 0.08, ox, yc, -DEPTH / 2 + 0.04), backMat));
        for (let i = 0; i <= rows; i++) wood.push(boardGeo(innerW, BOARD, DEPTH, ox, baseY + BOARD / 2 + i * ROW_H, 0));
        for (let i = 0; i < rows; i++) {
          shades.push(new THREE.PlaneGeometry(innerW, ROW_H - BOARD).translate(ox, baseY + BOARD + (i + 0.5) * ROW_H - BOARD / 2, -DEPTH / 2 + 0.085));
        }
        wood.push(boardGeo(Wtot + 0.24, FASCIA_H, DEPTH + 0.12, ox, baseY + Hc + FASCIA_H / 2, 0.03));
        const crown = baseY + Hc + FASCIA_H;
        wood.push(boardGeo(Wtot + 0.3, CORNICE_H * 0.45, DEPTH + 0.2, ox, crown + CORNICE_H * 0.225, 0.05));
        wood.push(boardGeo(Wtot + 0.46, CORNICE_H * 0.55, DEPTH + 0.3, ox, crown + CORNICE_H * 0.725, 0.08));
        wood.push(boardGeo(Wtot + 0.12, PLINTH_H, DEPTH + 0.06, ox, baseY - PLINTH_H / 2, 0.02));
        const sign = fasciaText(c.sections);
        if (sign) frame.add(fasciaPlate(sign, ox, baseY + Hc + FASCIA_H / 2, Wtot, d.maxAniso));
        for (const bk of c.bookends) {
          const shelf = baseY + BOARD + (rows - 1 - bk.row) * ROW_H;
          wood.push(boardGeo(0.05, 1.1, 0.8, ox - innerW / 2 + 0.06 + bk.x + 0.025, shelf + 0.55, -DEPTH / 2 + 0.5));
        }
        const merged = mergeGeometries(wood);
        const shadeMerged = mergeGeometries(shades);
        wood.forEach((g) => g.dispose());
        shades.forEach((g) => g.dispose());
        if (merged) frame.add(shadowed(merged, woodMat));
        if (shadeMerged) frame.add(new THREE.Mesh(shadeMerged, rowShade));
        // A vase or plant where a shelf has room beside its last book. Seeded by the case, so they stay put.
        const choose = rng(hash('decor' + c.index));
        let placed = 0;
        c.rows.forEach((row, k) => {
          if (choose() > 0.55 || placed >= MAX_DECOR) return;
          const last = row[row.length - 1];
          if (innerW - (last ? last.x + last.b.w : 0) < DECOR_WIDTH + 0.8) return;
          const kind = DECOR[Math.floor(choose() * DECOR.length)] ?? DECOR[0];
          const x = ox + innerW / 2 - 0.6;
          const y = baseY + BOARD + (rows - 1 - k) * ROW_H;
          const turn = (choose() - 0.5) * 0.9;
          if (kind) {
            loadModel(kind.name, kind.height).then(
              (m) => {
                if (build !== buildNo) return;
                m.position.set(x, y, -DEPTH / 2 + 0.65);
                m.rotation.y = turn;
                decorRoot.add(m, contactShadow(kind.height * 0.8, kind.height * 0.8, m.position.x, y + 0.02, m.position.z));
                d.dirty();
              },
              (err: unknown) => console.warn(`model ${kind.name} unavailable`, err),
            );
          }
          placed++;
        });
        const top = baseY + Hc + FASCIA_H + CORNICE_H;
        const bottom = baseY - PLINTH_H;
        tops.push(top);
        caseView.push({cy: (top + bottom) / 2, h: top - bottom + VIEW_MARGIN});
      }
      wall.cases.forEach((c) =>
        c.rows.forEach((row, k) => {
          const i = c.rows.length - 1 - k;
          const ox = caseX(c.index, pitch);
          const floor = baseY + BOARD + i * ROW_H;
          row.forEach(({b, x: bx}, at) => {
            // Older books have yellowed pages; the tint multiplies the paper texture.
            const paper = new THREE.Color(0xffffff).lerp(new THREE.Color(0xe3cf9c), rng(hash(b.id + 'age'))() * 0.9);
            const pages = new THREE.MeshStandardMaterial({map: pagesTex, color: paper, roughness: 0.95});
            const binding = BINDING[bookKind(b)];
            const colors = faceColors(b);
            const {home: h, lean} = standBook(b, bx, at, row.length, ox, floor, innerW);
            // Slots follow packBookFaces: cover, back board, spine, then one material for all three paper faces.
            const mats = [
              new THREE.MeshStandardMaterial({color: colors[0], roughness: 0.6}),
              new THREE.MeshStandardMaterial({color: colors[1], roughness: 0.7}),
              new THREE.MeshStandardMaterial({color: colors[2], roughness: binding.gloss}),
              pages,
            ];
            const geo = new RoundedBoxGeometry(b.w, b.h, b.d, 2, binding.radius);
            packBookFaces(geo);
            const mesh = new THREE.Mesh(geo, mats);
            mesh.castShadow = mesh.receiveShadow = true;
            mesh.userData = {id: b.id};
            const grp = new THREE.Group();
            grp.add(mesh);
            const home = new THREE.Vector3(...h);
            grp.position.copy(home);
            grp.rotation.z = lean;
            const pv = prev.get(b.id);
            if (pv) {
              grp.position.copy(pv.p);
              grp.rotation.copy(pv.r);
              grp.scale.setScalar(pv.s);
            }
            bookRoot.add(grp);
            entries.set(b.id, {b, grp, mats, home, base: mats.map((m) => m.color.clone()), tint: new THREE.Color(1, 1, 1), hasSpine: false, hasCover: false, caseIndex: c.index, picked: false, lean, glow: 0, match: true});
            pickables.push(mesh);
          });
        }),
      );
      return {wall, innerW, Hs, Wtot, pitch, baseY, caseView, tops, sectionsKey, first: prev.size === 0};
    },
  };
}
