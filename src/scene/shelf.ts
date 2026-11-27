import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type {Book} from '../types';
import {state} from '../state';
import {matches} from '../search';
import {hash, rng} from '../util';
import {LIGHTS} from '../presets';
import {SERIF, bookKind, type BookKind} from '../textures/draw';
import {createRoom} from './room';
import {contactShadow, loadModel, type ModelName} from './assets';
import {packBookFaces} from './faces';
import {layoutPlate} from './plate';
import {tintFor} from './tint';
import {boardGeo, createWood} from './wood';
import {createPicking} from './picking';
import {createBookTextures, faceColors} from './bookTextures';
import {MAT, type Entry} from './entry';
import {SETTLE_EPS, aimCamera, createRig, frameFor, frameSpace, isMobile, placeRig, selectionTarget, stepRig} from './camera';
import {approach, createFrameLoop, ease, needsAnotherFrame} from './loop';
import {CASE_ROWS, caseX, clampCase, fasciaText, firstMatchCase, layoutWall, nearestCase, type SectionInfo, type Wall} from './wall';

export interface ShelfHooks {
  /** Book id picked by a click, or null for a click on empty space. */
  onPick(id: string | null): void;
  onHover(title: string | null, x: number, y: number): void;
  /** A touch held on a book for about half a second. */
  onLongPress(id: string): void;
  /** The bookcase the camera is heading for changed, or the wall itself did. */
  onView(view: WallView): void;
}

export interface WallView {
  caseIndex: number;
  caseCount: number;
  /** Jump list: genres when grouped, otherwise one entry per bookcase. */
  sections: SectionInfo[];
  /** What the current bookcase holds, worded like its fascia. */
  current: string;
  /** Jump-list entries that have books on the current bookcase. */
  here: string[];
}

export interface Shelf {
  /** Re-read wood and lighting presets from state.settings. */
  applySettings(): void;
  /** Rebuild geometry from state.books (add, edit, delete). */
  rebuild(): void;
  /** Pan to the bookcase holding this book. */
  focusBook(id: string): void;
  /** Pan to the bookcase of the first book matching the current search and filter, if any. */
  revealMatch(): void;
  /** The book's stored tone changed: recolour its spine and rebuild its textures, without rebuilding the shelf. */
  retone(b: Book): void;
  /** Pan to a bookcase by index. */
  focusCase(index: number): void;
  /** Starts the frame loop if it is asleep. Call after changing state the shelf reads (selection, search, filter, picks). */
  wake(): void;
  setVisible(on: boolean): void;
}

const ROW_H = 2.55;
const BOARD = 0.16;
const SIDE = 0.22;
const DEPTH = 1.7;
const WIDTHS = [3.6, 4.2, 4.8];
const FASCIA_H = 0.6;
/** Crown moulding above the fascia: two stepped slabs. */
const CORNICE_H = 0.14;
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
const PLINTH_H = 0.3;
/** Empty space around the framed bookcase: room for the lamp above and the floor below. */
const VIEW_MARGIN = 0.6;
// Lights lost an implicit factor of pi when three dropped "legacy" units; this keeps the prototype's look.
const LIGHT_UNIT = Math.PI;

export function createShelf(canvas: HTMLCanvasElement, hooks: ShelfHooks): Shelf | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: true});
  } catch (err) {
    console.warn('WebGL unavailable', err);
    return null;
  }
  // Phones have the densest screens and the weakest GPUs; 1.5 is sharp enough for a shelf.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile() ? 1.5 : 2));
  // Filmic tone mapping that keeps hues: lamp light rolls off into highlights instead of clipping flat.
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  // Books rarely move, and the shadow pass redraws every book, so it only runs when something changed.
  renderer.shadowMap.autoUpdate = false;

  /** Set whenever something outside the animation loop changes what is on screen. */
  let force = true;
  let last = performance.now();
  // The loop sleeps when the picture is final and wakes on input or any change; see tick().
  const loop = createFrameLoop(() => tick());
  /** Starts the loop if it sleeps. The clock restarts so the first frame after a rest is not one long step. */
  function wake(): void {
    if (!loop.running()) last = performance.now();
    loop.wake();
  }
  /** Something changed what is on screen: draw once more, and make sure the loop is awake to do it. */
  function dirty(): void {
    force = true;
    wake();
  }
  let filterKey = '';
  let shadowDirty = false;
  let prevSel: Entry | undefined;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 120);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const rig = createRig(camera, matchMedia('(prefers-reduced-motion: reduce)').matches);

  const hemi = new THREE.HemisphereLight(0xfff0dc, 0x2b1e14, 0.9 * LIGHT_UNIT);
  const key = new THREE.DirectionalLight(0xffe3bd, 0.85 * LIGHT_UNIT);
  key.position.set(-5, 9, 13);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  const fillL = new THREE.DirectionalLight(0x9fb4ff, 0.16 * LIGHT_UNIT);
  fillL.position.set(7, 3, 8);
  scene.add(hemi, key, key.target, fillL);
  // A faint image-based light gives covers and wood a soft sheen the three lamps alone cannot.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.3;
  pmrem.dispose();

  const {woodMat, backMat, rowShade, pagesTex, apply: applyWood} = createWood(maxAniso, () => applySettings());

  function applySettings(): void {
    dirty();
    const {wood: woodId, light: lightId} = state.settings;
    applyWood(woodId);
    const L = LIGHTS[lightId];
    hemi.color.setHex(L.hemiSky);
    hemi.groundColor.setHex(L.hemiGround);
    hemi.intensity = L.hemi * LIGHT_UNIT;
    key.color.setHex(L.keyColor);
    key.intensity = L.key * LIGHT_UNIT;
    fillL.color.setHex(L.fillColor);
    fillL.intensity = L.fill * LIGHT_UNIT;
    room.setProps(!!state.settings.props);
  }
  const room = createRoom(scene, maxAniso);
  applySettings();

  const frame = new THREE.Group();
  const bookRoot = new THREE.Group();
  /** Shelf objects: copies of shared models, so clearing them frees nothing. */
  const decorRoot = new THREE.Group();
  let shelfBuild = 0;
  scene.add(frame, bookRoot, decorRoot);

  let bucket = -1;
  let innerW = 4.2;
  let Hs = 0;
  let Wtot = 0;
  let caseView: {cy: number; h: number}[] = [];
  let pitch = 5;
  let wall: Wall = layoutWall([], 4.2, false);
  let shadowCase = -1;
  let viewKey = '';
  /** What the jump list shows, rebuilt with the wall, so a frame only compares two strings. */
  let sectionsKey = '';
  let visible = true;
  const entries = new Map<string, Entry>();
  const pickables: THREE.Mesh[] = [];
  const pointer = {x: 0, y: 0, sx: 0, sy: 0};
  const textures = createBookTextures({maxAniso, entries, dirty});


  function shadowed(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = m.receiveShadow = true;
    return m;
  }
  /** Brass plate on the fascia naming the sections of a bookcase. */
  function fasciaPlate(text: string, ox: number, y: number): THREE.Mesh {
    const w = Wtot * 0.94;
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
  function clearFrame(): void {
    for (const m of frame.children.slice()) {
      const mesh = m as THREE.Mesh;
      mesh.geometry.dispose();
      // Genre plates own their texture and material; the shared wood material is left alone.
      if (mesh.userData.plate) {
        (mesh.material as THREE.MeshBasicMaterial).map?.dispose();
        (mesh.material as THREE.Material).dispose();
      }
      frame.remove(m);
    }
  }
  function clearBooks(): void {
    for (const grp of bookRoot.children.slice()) {
      grp.children.forEach((m) => {
        const mesh = m as THREE.Mesh;
        mesh.geometry.dispose();
        new Set(mesh.userData.mats as THREE.Material[]).forEach((x) => x.dispose());
      });
      bookRoot.remove(grp);
    }
    entries.clear();
    pickables.length = 0;
  }

  function buildShelf(): void {
    const build = ++shelfBuild;
    decorRoot.clear();
    dirty();
    filterKey = '';
    renderer.shadowMap.needsUpdate = true;
    const prev = new Map<string, {p: THREE.Vector3; r: THREE.Euler; s: number}>();
    entries.forEach((e, id) => prev.set(id, {p: e.grp.position.clone(), r: e.grp.rotation.clone(), s: e.grp.scale.x}));
    clearFrame();
    clearBooks();
    textures.prune(state.books);
    const keepCase = nearestCase(rig.panTarget, pitch, wall.cases.length);
    innerW = WIDTHS[bucket < 0 ? 1 : bucket] ?? 4.2;
    wall = layoutWall(state.books, innerW, !!state.settings.groupByGenre);
    sectionsKey = wall.sections.map((x) => `${x.name}:${x.count}:${x.firstCase}:${x.contains?.length ?? 0}`).join(',');
    Hs = CASE_ROWS * ROW_H + BOARD;
    Wtot = innerW + 2 * SIDE;
    const oldPitch = pitch;
    pitch = Wtot + 0.24;
    // Cases stand on one floor; a shorter last case simply ends lower.
    const baseY = -Hs / 2;
    caseView = [];
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
      if (sign) frame.add(fasciaPlate(sign, ox, baseY + Hc + FASCIA_H / 2));
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
              if (build !== shelfBuild) return;
              m.position.set(x, y, -DEPTH / 2 + 0.65);
              m.rotation.y = turn;
              decorRoot.add(m, contactShadow(kind.height * 0.8, kind.height * 0.8, m.position.x, y + 0.02, m.position.z));
              dirty();
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
    if (pitch !== oldPitch) rig.panTarget = rig.panCur = caseX(keepCase, pitch);
    wall.cases.forEach((c) => c.rows.forEach((row, k) => {
      const i = c.rows.length - 1 - k;
      const ox = caseX(c.index, pitch);
      const floor = baseY + BOARD + i * ROW_H;
      row.forEach(({b, x: bx}, at) => {
        // Older books have yellowed pages; the tint multiplies the paper texture.
        const paper = new THREE.Color(0xffffff).lerp(new THREE.Color(0xe3cf9c), rng(hash(b.id + 'age'))() * 0.9);
        const pages = new THREE.MeshStandardMaterial({map: pagesTex, color: paper, roughness: 0.95});
        const binding = BINDING[bookKind(b)];
        const colors = faceColors(b);
        // Seeded by id, so a book stands the same way after every rebuild.
        const r = rng(hash(b.id));
        const pull = r() * MAX_PULL;
        const angle = 0.06 + r() * (MAX_LEAN - 0.06);
        const lean = at > 0 && at === row.length - 1 && r() < 0.75 && innerW - 0.1 - (bx + b.w) > 2 * (b.h / 2) * Math.sin(angle) + 0.06 ? angle : 0;
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
        mesh.userData = {id: b.id, mats};
        const grp = new THREE.Group();
        grp.add(mesh);
        // A leaning book keeps its low corner on the board and its high corner clear of the book it rests against.
        const home = new THREE.Vector3(
          ox - innerW / 2 + 0.06 + bx + b.w / 2 + (b.h / 2) * Math.sin(lean),
          floor + (b.h / 2) * Math.cos(lean) + (b.w / 2) * Math.sin(lean),
          -DEPTH / 2 + 0.1 + pull + b.d / 2,
        );
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
    }));
    room.layout({pitch, count: wall.cases.length, floorY: baseY - PLINTH_H - 0.01, tops, depth: DEPTH});
    viewKey = '';
    shadowCase = -1;
    // The shadow map covers five cases around the camera and is re-aimed when the nearest case changes.
    const ext = Math.max(Hs, 5 * pitch) / 2 + 1;
    Object.assign(key.shadow.camera, {left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 45});
    key.shadow.camera.updateProjectionMatrix();
    placeCamera(prev.size === 0);
    // Straight away, not on the next frame: a genre edit must show in the jump list at once.
    emitView();
  }

  /** Camera distance and height that frame the given bookcase so it fills the viewport. */
  const framing = (index: number): {dist: number; cy: number} =>
    frameFor(caseView[clampCase(index, caseView.length)] ?? {cy: 0, h: Hs}, frameSpace(Wtot, DEPTH), rig.fovT);

  /** Re-aims the camera framing; it eases there unless this is the first frame or motion is reduced. */
  function placeCamera(initial: boolean): void {
    placeRig(rig, initial, wall.cases.length, pitch, framing);
    dirty();
  }

  /** Tells the page what the wall holds and where the camera is heading; only when that changed. */
  function emitView(): void {
    const target = nearestCase(rig.panTarget, pitch, wall.cases.length);
    const vk = `${target}|${sectionsKey}`;
    if (vk === viewKey) return;
    viewKey = vk;
    const parts = wall.cases[target]?.sections ?? [];
    const name = parts.length ? fasciaText(parts) : `Bookcase ${target + 1}`;
    hooks.onView({caseIndex: target, caseCount: wall.cases.length, sections: wall.sections, current: name, here: parts.length ? parts.map((p) => p.name) : [name]});
  }

  function onResize(): void {
    if (!visible) return;
    dirty();
    const w = innerWidth;
    const h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const a = w / h;
    const nb = a < 0.75 ? 0 : a < 1.15 ? 1 : 2;
    if (nb !== bucket) {
      bucket = nb;
      buildShelf();
    } else placeCamera(false);
  }

  const picking = createPicking({
    canvas,
    camera,
    rig,
    pointer,
    pickables,
    bookOf: (id) => entries.get(id)?.b,
    wall: () => ({pitch, caseCount: wall.cases.length}),
    selected: () => !!state.sel,
    hooks,
    wake,
  });

  /* ---------- loop ---------- */
  const tmpC = new THREE.Color();
  /** One frame. Returns whether another is needed: false puts the loop to sleep until something wakes it. */
  function tick(): boolean {
    if (!visible) return false;
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    let moved = 0;
    const px = pointer.sx;
    const py = pointer.sy;
    pointer.sx = approach(pointer.sx, pointer.x, 4, dt, SETTLE_EPS);
    pointer.sy = approach(pointer.sy, pointer.y, 4, dt, SETTLE_EPS);
    moved += Math.abs(pointer.sx - px) + Math.abs(pointer.sy - py) + stepRig(rig, dt, wall.cases.length, pitch, framing);
    aimCamera(rig, pointer.sx, pointer.sy);
    const sel = state.sel ? entries.get(state.sel) : undefined;
    if (prevSel && prevSel !== sel) textures.cancelCover(prevSel);
    prevSel = sel;
    const st = sel ? selectionTarget(rig, sel.b.h, sel.b.d) : null;
    textures.update(sel, rig.dist, rig.fovT, camera.aspect, pitch, rig.panCur);
    const near = nearestCase(rig.panCur, pitch, wall.cases.length);
    if (near !== shadowCase) {
      shadowCase = near;
      const cx = caseX(near, pitch);
      key.position.set(cx - 5, 9, 13);
      key.target.position.set(cx, 0, 0);
      key.target.updateMatrixWorld();
      shadowDirty = true;
      dirty();
    }
    emitView();
    const filtering = !!(state.q || state.status || state.section);
    const fk = `${state.q}|${state.status}|${state.section?.name ?? ''}`;
    if (fk !== filterKey) {
      filterKey = fk;
      entries.forEach((e) => (e.match = matches(e.b, state.q, state.status, state.section?.genres ?? null)));
    }
    entries.forEach((e) => {
      const isSel = sel === e;
      const match = e.match;
      const picked = state.picked.has(e.b.id);
      // A warm glow on every face marks books chosen in Select mode, and a softer one the books a search or filter found.
      const glow = picked ? 0.45 : filtering && match && !sel ? 0.28 : 0;
      if (picked !== e.picked || glow !== e.glow) {
        e.picked = picked;
        e.glow = glow;
        e.mats.forEach((m, i) => {
          if (i === MAT.cover) return; // the cover face keeps its own glow
          m.emissive.setHex(glow ? 0xf2b650 : 0x000000);
          m.emissiveIntensity = glow;
        });
        moved++;
      }
      const p = e.grp.position;
      let tx = e.home.x;
      let ty = e.home.y;
      let tz = e.home.z;
      let rY = 0;
      let rX = 0;
      let sc = 1;
      let rxy: number;
      let rz: number;
      if (isSel && st) {
        const clear = p.z - e.b.d / 2 > 0.65;
        tx = st.pos.x;
        ty = st.pos.y;
        tz = st.pos.z;
        if (clear) {
          sc = st.s;
          rY = -Math.PI / 2 + pointer.sx * 0.3;
          rX = pointer.sy * 0.15;
        }
        rz = 7;
        rxy = clear ? 6 : 1.0;
      } else {
        if (!sel && picking.hover() === e.b.id) {
          ty += 0.1;
          tz += 0.18;
        } else if (!sel && ((filtering && match) || e.picked)) {
          ty += 0.1;
          tz += 0.32;
        }
        const far = p.z > e.home.z + 0.5;
        rxy = far ? 9 : 10;
        rz = far ? 3.5 : 10;
      }
      const ox = p.x + p.y + p.z + e.grp.rotation.y + e.grp.rotation.x + e.grp.rotation.z + e.grp.scale.x;
      p.x += (tx - p.x) * ease(dt, rxy);
      p.y += (ty - p.y) * ease(dt, rxy);
      p.z += (tz - p.z) * ease(dt, rz);
      e.grp.rotation.y += (rY - e.grp.rotation.y) * ease(dt, 6);
      e.grp.rotation.x += (rX - e.grp.rotation.x) * ease(dt, 6);
      e.grp.rotation.z += ((isSel ? 0 : e.lean) - e.grp.rotation.z) * ease(dt, 6);
      const s = e.grp.scale.x;
      e.grp.scale.setScalar(s + (sc - s) * ease(dt, 6));
      const nx = p.x + p.y + p.z + e.grp.rotation.y + e.grp.rotation.x + e.grp.rotation.z + e.grp.scale.x;
      if (Math.abs(nx - ox) > 1e-5) {
        moved++;
        // A hover or search lift is too small to be worth redrawing every book into the shadow map.
        if (isSel) shadowDirty = true;
      }
      const tint = tintFor({isSelected: isSel, anySelected: !!sel, filtering, matches: match});
      tmpC.setHex(tint);
      const diff = Math.abs(e.tint.r - tmpC.r) + Math.abs(e.tint.g - tmpC.g) + Math.abs(e.tint.b - tmpC.b);
      if (diff === 0) return;
      // Snap the last sliver so the easing ends and the loop can go idle.
      if (diff < 0.002) e.tint.copy(tmpC);
      else e.tint.lerp(tmpC, ease(dt, 8));
      moved++;
      for (let i = 0; i < e.mats.length; i++) e.mats[i]?.color.copy(e.base[i] as THREE.Color).multiply(e.tint);
    });
    const fading = textures.stepFades(dt);
    moved += fading;
    // An idle shelf costs nothing: draw only while something is still easing or was just changed, then sleep.
    if (!needsAnotherFrame({moved, forced: force, fades: fading})) return false;
    force = false;
    if (shadowDirty) {
      renderer.shadowMap.needsUpdate = true;
      shadowDirty = false;
    }
    renderer.render(scene, camera);
    return true;
  }

  if (import.meta.env.DEV) {
    // Lets the screenshot harness click a book without guessing pixel positions.
    (window as unknown as {__verso: unknown}).__verso = {
      /** Renders once and returns the canvas as a data URL, so tests can read real pixels. */
      snapshot: () => {
        renderer.render(scene, camera);
        return canvas.toDataURL('image/png');
      },
      project(x: number, y: number, z: number) {
        const v = new THREE.Vector3(x, y, z).project(camera);
        return {x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight};
      },
      selectedFace() {
        const e = state.sel ? entries.get(state.sel) : undefined;
        if (!e) return null;
        const p = e.grp.position;
        const sc = e.grp.scale.x;
        const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => {
          const w = new THREE.Vector3(e.b.w / 2, (b as number) * e.b.h / 2, (a as number) * e.b.d / 2).applyEuler(e.grp.rotation).multiplyScalar(sc).add(p);
          const v = w.project(camera);
          return {x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight};
        });
        return corners;
      },
      stats: () => ({...renderer.info.render, textures: renderer.info.memory.textures}),
      /** True when no frame is scheduled: the shelf is at rest. */
      idle: () => !loop.running(),
      bookScreenPos(i: number) {
        const e = [...entries.values()][i];
        if (!e) return null;
        const v = e.grp.position.clone().project(camera);
        return {x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight};
      },
    };
  }

  addEventListener('resize', onResize);
  // Every state change the page makes (select, search, filter, pick, import) starts with input, so any input wakes the loop.
  for (const type of ['pointerdown', 'keydown', 'input', 'change', 'click']) addEventListener(type, wake, {capture: true, passive: true});
  onResize();

  return {
    rebuild: buildShelf,
    applySettings,
    focusBook(id) {
      const c = wall.caseOf.get(id);
      if (c !== undefined) rig.panTarget = caseX(c, pitch);
      wake();
    },
    retone(b) {
      const e = entries.get(b.id);
      if (e) textures.retone(e);
    },
    focusCase(index) {
      rig.panTarget = caseX(clampCase(index, wall.cases.length), pitch);
      wake();
    },
    revealMatch() {
      if (!state.q && !state.status && !state.section) return;
      const c = firstMatchCase(wall, (b) => matches(b, state.q, state.status, state.section?.genres ?? null));
      if (c !== null) rig.panTarget = caseX(c, pitch);
      wake();
    },
    wake,
    setVisible(on) {
      visible = on;
      dirty();
      canvas.classList.toggle('hidden', !on);
      if (on) {
        last = performance.now();
        onResize();
      }
    },
  };
}
