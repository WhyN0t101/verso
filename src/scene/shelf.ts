import * as THREE from 'three';
import type {Book} from '../types';
import {state} from '../state';
import {matches} from '../search';
import {clamp, hsl, rng} from '../util';
import {LIGHTS, WOODS, type WoodPreset} from '../presets';
import {SERIF, drawCover, paletteOf, sat, spineCanvas} from '../textures/draw';
import {loadCover} from '../covers';
import {createRoom} from './room';
import {CASE_ROWS, caseX, clampCase, firstMatchCase, layoutWall, nearestCase, snapCase, type Wall} from './wall';

export interface ShelfHooks {
  /** Book id picked by a click, or null for a click on empty space. */
  onPick(id: string | null): void;
  onHover(title: string | null, x: number, y: number): void;
  /** The bookcase the camera is heading for changed, or the wall itself did (labels are genre names when grouped). */
  onView(index: number, labels: (string | null)[]): void;
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
  setVisible(on: boolean): void;
}

interface Entry {
  b: Book;
  grp: THREE.Group;
  mats: THREE.MeshStandardMaterial[];
  home: THREE.Vector3;
  base: THREE.Color[];
  tint: THREE.Color;
  hasSpine: boolean;
  hasCover: boolean;
  caseIndex: number;
  /** Result of the search and status filter, refreshed only when they change. */
  match: boolean;
}

const ROW_H = 2.55;
const BOARD = 0.16;
const SIDE = 0.22;
const DEPTH = 1.7;
const WIDTHS = [3.6, 4.2, 4.8];
// Lights lost an implicit factor of pi when three dropped "legacy" units; this keeps the prototype's look.
const LIGHT_UNIT = Math.PI;
const MAT = {cover: 0, back: 1, spine: 4} as const;

const ease = (dt: number, r: number) => 1 - Math.exp(-dt * r);
const isMobile = () => innerWidth <= 760;

export function createShelf(canvas: HTMLCanvasElement, hooks: ShelfHooks): Shelf | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: true});
  } catch (err) {
    console.warn('WebGL unavailable', err);
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Books rarely move, and the shadow pass redraws every book, so it only runs when something changed.
  renderer.shadowMap.autoUpdate = false;

  /** Set whenever something outside the animation loop changes what is on screen. */
  let force = true;
  let filterKey = '';
  let shadowDirty = false;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 120);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const FOV_T = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));

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

  function woodTexture(w: WoodPreset): THREE.CanvasTexture {
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
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = maxAniso;
    return t;
  }
  let wood = woodTexture(WOODS.walnut);
  const woodMat = new THREE.MeshStandardMaterial({map: wood, roughness: 0.72, metalness: 0});
  const backMat = new THREE.MeshStandardMaterial({map: wood, color: 0x7a6050, roughness: 0.9});

  function applySettings(): void {
    force = true;
    const {wood: woodId, light: lightId} = state.settings;
    const old = wood;
    wood = woodTexture(WOODS[woodId]);
    woodMat.map = wood;
    backMat.map = wood;
    old.dispose();
    const L = LIGHTS[lightId];
    hemi.color.setHex(L.hemiSky);
    hemi.groundColor.setHex(L.hemiGround);
    hemi.intensity = L.hemi * LIGHT_UNIT;
    key.color.setHex(L.keyColor);
    key.intensity = L.key * LIGHT_UNIT;
    fillL.color.setHex(L.fillColor);
    fillL.intensity = L.fill * LIGHT_UNIT;
  }
  applySettings();

  const room = createRoom(scene);
  const frame = new THREE.Group();
  const bookRoot = new THREE.Group();
  scene.add(frame, bookRoot);

  let bucket = -1;
  let innerW = 4.2;
  let Hs = 0;
  let Htot = 0;
  let Wtot = 0;
  let camDist = 12;
  /** Horizontal camera position along the wall, current and target. */
  let panTarget = 0;
  let panCur = 0;
  let panMax = 0;
  let pitch = 5;
  let wall: Wall = layoutWall([], 4.2, false);
  let shadowCase = -1;
  let viewKey = '';
  let hover: string | null = null;
  let visible = true;
  const entries = new Map<string, Entry>();
  const pickables: THREE.Mesh[] = [];
  const texCache = new Map<string, THREE.Texture>();
  /** Cover textures whose real image has been requested, so each is fetched once. */
  const realCovers = new Set<string>();
  const pointer = {x: 0, y: 0, sx: 0, sy: 0};


  function getTex(b: Book, kind: 'spine' | 'cover'): THREE.Texture {
    const k = `${b.id}:${b.v}:${kind}`;
    const hit = texCache.get(k);
    if (hit) return hit;
    const cv = kind === 'spine' ? spineCanvas(b) : drawCover(b, Math.round(b.d * 260), Math.round(b.h * 260));
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = maxAniso;
    texCache.set(k, t);
    return t;
  }

  /** Drop textures of deleted books and of old versions of edited ones. */
  function pruneTextures(): void {
    const live = new Set(state.books.map((b) => `${b.id}:${b.v}:`));
    for (const [k, t] of texCache) {
      const prefix = k.slice(0, k.lastIndexOf(':') + 1);
      if (!live.has(prefix)) {
        t.dispose();
        texCache.delete(k);
        realCovers.delete(k);
      }
    }
  }

  function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    return m;
  }
  /** Small brass-style plate on the plinth naming the genre of a bookcase. */
  function genrePlate(label: string, ox: number): THREE.Mesh {
    const w = Math.min(Wtot * 0.8, 3.2);
    const h = 0.22;
    const c = document.createElement('canvas');
    c.width = 640;
    c.height = Math.round((640 * h) / w);
    const g = c.getContext('2d');
    if (!g) throw new Error('2D canvas unavailable');
    g.fillStyle = '#2a1b0c';
    g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = '#e2b36b';
    g.lineWidth = 3;
    g.strokeRect(3, 3, c.width - 6, c.height - 6);
    g.fillStyle = '#f6ead4';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let fs = c.height * 0.58;
    g.font = `600 ${fs}px ${SERIF}`;
    while (g.measureText(label).width > c.width - 40 && fs > 10) {
      fs -= 2;
      g.font = `600 ${fs}px ${SERIF}`;
    }
    g.fillText(label, c.width / 2, c.height / 2 + 2);
    const map = new THREE.CanvasTexture(c);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = maxAniso;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({map}));
    m.position.set(ox, -Hs / 2 - 0.15, DEPTH / 2 + 0.07);
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
        (mesh.userData.mats as THREE.Material[]).forEach((x) => x.dispose());
      });
      bookRoot.remove(grp);
    }
    entries.clear();
    pickables.length = 0;
  }

  function applySpine(e: Entry): void {
    const m = e.mats[MAT.spine];
    if (!m) return;
    m.map = getTex(e.b, 'spine');
    m.needsUpdate = true;
    e.base[MAT.spine]?.set(0xffffff);
    e.hasSpine = true;
    force = true;
  }
  /** The cover face only shows on the pulled-out book, so its texture is made on first selection. */
  function applyCover(e: Entry): void {
    const m = e.mats[MAT.cover];
    if (!m) return;
    m.map = getTex(e.b, 'cover');
    m.needsUpdate = true;
    e.base[MAT.cover]?.set(0xffffff);
    e.hasCover = true;
    force = true;
    const b = e.b;
    const k = `${b.id}:${b.v}:cover`;
    if (!b.cover || realCovers.has(k)) return;
    realCovers.add(k);
    // The generated cover shows immediately; the real one replaces it when it arrives.
    void loadCover(b.cover).then((img) => {
      if (!img || !texCache.has(k)) return;
      const t = new THREE.Texture(img);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = maxAniso;
      t.needsUpdate = true;
      texCache.get(k)?.dispose();
      texCache.set(k, t);
      if (entries.get(b.id) === e) {
        m.map = t;
        m.needsUpdate = true;
        force = true;
      }
    });
  }

  /** Flat colours of the cover, back board and spine before (or without) a texture. */
  const faceColors = (p: ReturnType<typeof paletteOf>): [THREE.Color, THREE.Color, THREE.Color] => [
    new THREE.Color(hsl(p.h, sat(p, 0), 28)),
    new THREE.Color(hsl(p.h, sat(p, 0), 22)),
    new THREE.Color(hsl(p.h, sat(p, 4), 25)),
  ];

  function retone(b: Book): void {
    const e = entries.get(b.id);
    if (!e) return;
    const prefix = `${b.id}:${b.v}:`;
    for (const [k, t] of texCache) {
      if (k.startsWith(prefix)) {
        t.dispose();
        texCache.delete(k);
        realCovers.delete(k);
      }
    }
    b.v++;
    const [cover, back, spine] = faceColors(paletteOf(b));
    e.base[MAT.cover]?.copy(cover);
    e.base[MAT.back]?.copy(back);
    e.base[MAT.spine]?.copy(spine);
    for (const i of [MAT.cover, MAT.spine]) {
      const m = e.mats[i];
      if (m) {
        m.map = null;
        m.needsUpdate = true;
      }
    }
    e.hasSpine = false;
    e.hasCover = false;
    force = true;
  }

  function buildShelf(): void {
    force = true;
    filterKey = '';
    renderer.shadowMap.needsUpdate = true;
    const prev = new Map<string, {p: THREE.Vector3; r: THREE.Euler; s: number}>();
    entries.forEach((e, id) => prev.set(id, {p: e.grp.position.clone(), r: e.grp.rotation.clone(), s: e.grp.scale.x}));
    clearFrame();
    clearBooks();
    pruneTextures();
    const keepCase = nearestCase(panTarget, pitch, wall.cases.length);
    innerW = WIDTHS[bucket < 0 ? 1 : bucket] ?? 4.2;
    wall = layoutWall(state.books, innerW, !!state.settings.groupByGenre);
    const R = CASE_ROWS;
    Hs = R * ROW_H + BOARD;
    Wtot = innerW + 2 * SIDE;
    // Headroom above and below so the lamps and the floor fit in the picture.
    Htot = Hs + 1.5;
    const oldPitch = pitch;
    pitch = Wtot + 0.24;
    for (const c of wall.cases) {
      const ox = caseX(c.index, pitch);
      frame.add(box(SIDE, Hs, DEPTH, woodMat, ox - (innerW / 2 + SIDE / 2), 0, 0));
      frame.add(box(SIDE, Hs, DEPTH, woodMat, ox + innerW / 2 + SIDE / 2, 0, 0));
      frame.add(box(Wtot, Hs, 0.08, backMat, ox, 0, -DEPTH / 2 + 0.04));
      for (let i = 0; i <= R; i++) frame.add(box(innerW, BOARD, DEPTH, woodMat, ox, -Hs / 2 + BOARD / 2 + i * ROW_H, 0));
      frame.add(box(Wtot + 0.24, 0.16, DEPTH + 0.12, woodMat, ox, Hs / 2 + 0.08, 0.03));
      frame.add(box(Wtot + 0.12, 0.3, DEPTH + 0.06, woodMat, ox, -Hs / 2 - 0.15, 0.02));
      if (c.label) frame.add(genrePlate(c.label, ox));
    }
    if (pitch !== oldPitch) panTarget = panCur = caseX(keepCase, pitch);
    wall.cases.forEach((c) => c.rows.forEach((row, k) => {
      const i = R - 1 - k;
      const ox = caseX(c.index, pitch);
      const floor = -Hs / 2 + BOARD + i * ROW_H;
      for (const {b, x: bx} of row) {
        const p = paletteOf(b);
        const pages = () => new THREE.MeshStandardMaterial({color: 0xe9dfc8, roughness: 0.95});
        // Order follows BoxGeometry faces: +x cover, -x back board, +y, -y, +z spine, -z.
        const mats = [
          new THREE.MeshStandardMaterial({color: faceColors(p)[0], roughness: 0.6}),
          new THREE.MeshStandardMaterial({color: faceColors(p)[1], roughness: 0.7}),
          pages(),
          pages(),
          new THREE.MeshStandardMaterial({color: faceColors(p)[2], roughness: 0.55}),
          pages(),
        ];
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), mats);
        mesh.castShadow = mesh.receiveShadow = true;
        mesh.userData = {id: b.id, mats};
        const grp = new THREE.Group();
        grp.add(mesh);
        const home = new THREE.Vector3(ox - innerW / 2 + 0.06 + bx + b.w / 2, floor + b.h / 2, -DEPTH / 2 + 0.1 + b.d / 2);
        grp.position.copy(home);
        const pv = prev.get(b.id);
        if (pv) {
          grp.position.copy(pv.p);
          grp.rotation.copy(pv.r);
          grp.scale.setScalar(pv.s);
        }
        bookRoot.add(grp);
        entries.set(b.id, {b, grp, mats, home, base: mats.map((m) => m.color.clone()), tint: new THREE.Color(1, 1, 1), hasSpine: false, hasCover: false, caseIndex: c.index, match: true});
        pickables.push(mesh);
      }
    }));
    room.layout({pitch, count: wall.cases.length, height: Hs, depth: DEPTH});
    viewKey = '';
    shadowCase = -1;
    // The shadow map covers five cases around the camera and is re-aimed when the nearest case changes.
    const ext = Math.max(Hs, 5 * pitch) / 2 + 1;
    Object.assign(key.shadow.camera, {left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 45});
    key.shadow.camera.updateProjectionMatrix();
    placeCamera(prev.size === 0);
  }

  function placeCamera(initial: boolean): void {
    const aspect = innerWidth / innerHeight;
    camDist = Math.max(Htot / 2 / FOV_T, Wtot / 2 / (FOV_T * aspect)) * 1.1 + DEPTH / 2;
    panMax = (wall.cases.length - 1) * pitch;
    if (initial) panTarget = panCur = 0;
    panTarget = clamp(panTarget, 0, panMax);
  }

  function onResize(): void {
    if (!visible) return;
    force = true;
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

  /** Where the pulled-out book rests: centred in the area the detail panel leaves free. */
  function selTarget(b: Book): {pos: THREE.Vector3; s: number} {
    const dist = camDist * 0.5;
    const w = innerWidth;
    const h = innerHeight;
    const mob = isMobile();
    const pw = mob ? 0 : Math.min(400, w * 0.92);
    const top = 64;
    const bot = mob ? h * 0.48 : h;
    const fx = mob ? w / 2 : (w - pw) / 2;
    const fy = (top + bot) / 2;
    const freeW = mob ? w : w - pw;
    const freeH = bot - top;
    const v = new THREE.Vector3((fx / w) * 2 - 1, 1 - (fy / h) * 2, 0.5).unproject(camera).sub(camera.position).normalize();
    const pos = camera.position.clone().addScaledVector(v, dist);
    const unit = (2 * dist * FOV_T) / h;
    const s = clamp(Math.min((0.68 * freeH * unit) / b.h, (0.72 * freeW * unit) / b.d), 0.6, 2.4);
    return {pos, s};
  }

  /* ---------- pointer ---------- */
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function pick(ev: PointerEvent): string | null {
    const r = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(pickables, false)[0];
    return hit ? (hit.object.userData.id as string) : null;
  }
  let down: {x: number; y: number; lx: number; lt: number; vx: number; moved: number} | null = null;
  canvas.addEventListener('pointerdown', (ev) => {
    down = {x: ev.clientX, y: ev.clientY, lx: ev.clientX, lt: ev.timeStamp, vx: 0, moved: 0};
    canvas.setPointerCapture(ev.pointerId);
  });
  canvas.addEventListener('pointermove', (ev) => {
    pointer.x = (ev.clientX / innerWidth) * 2 - 1;
    pointer.y = (ev.clientY / innerHeight) * 2 - 1;
    if (down) {
      const dx = ev.clientX - down.lx;
      const dt = Math.max(ev.timeStamp - down.lt, 1);
      down.lx = ev.clientX;
      down.lt = ev.timeStamp;
      down.moved = Math.max(down.moved, Math.hypot(ev.clientX - down.x, ev.clientY - down.y));
      if (down.moved > 6 && panMax > 0) {
        const dw = -dx * ((2 * camDist * FOV_T) / innerHeight);
        panTarget = clamp(panTarget + dw, 0, panMax);
        down.vx = down.vx * 0.6 + (dw / dt) * 0.4;
      }
      return;
    }
    if (state.sel || ev.pointerType === 'touch') return;
    const id = pick(ev);
    hover = id;
    canvas.classList.toggle('pointer', !!id);
    const e = id ? entries.get(id) : undefined;
    hooks.onHover(e ? e.b.title : null, ev.clientX + 14, ev.clientY + 14);
  });
  canvas.addEventListener('pointerup', (ev) => {
    if (!down) return;
    const {moved, vx} = down;
    down = null;
    if (moved < 6) hooks.onPick(pick(ev));
    // Touch swipes settle on a bookcase; a mouse drag stays where it was let go.
    else if (ev.pointerType !== 'mouse' && panMax > 0) panTarget = caseX(snapCase(panTarget, vx, pitch, wall.cases.length), pitch);
  });
  canvas.addEventListener('pointercancel', () => {
    down = null;
  });
  canvas.addEventListener('pointerleave', () => {
    hover = null;
    hooks.onHover(null, 0, 0);
    canvas.classList.remove('pointer');
  });
  canvas.addEventListener(
    'wheel',
    (ev) => {
      if (panMax > 0) {
        ev.preventDefault();
        const d = Math.abs(ev.deltaX) > Math.abs(ev.deltaY) ? ev.deltaX : ev.deltaY;
        panTarget = clamp(panTarget + d * 0.012, 0, panMax);
      }
    },
    {passive: false},
  );

  /* ---------- loop ---------- */
  const tmpC = new THREE.Color();
  let last = performance.now();
  function lazyTextures(sel: Entry | undefined): void {
    if (sel && !sel.hasCover) applyCover(sel);
    // Only books in bookcases near the camera get a spine texture, a few per frame, so 100+ books do not stall startup.
    const reach = camDist * FOV_T * camera.aspect + pitch * 0.6;
    let budget = 6;
    for (const e of entries.values()) {
      if (e.hasSpine || Math.abs(caseX(e.caseIndex, pitch) - panCur) > reach) continue;
      applySpine(e);
      if (--budget === 0) break;
    }
  }
  function tick(): void {
    requestAnimationFrame(tick);
    if (!visible) return;
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    let moved = 0;
    const px = pointer.sx;
    const py = pointer.sy;
    const pc = panCur;
    pointer.sx += (pointer.x - pointer.sx) * ease(dt, 4);
    pointer.sy += (pointer.y - pointer.sy) * ease(dt, 4);
    panCur += (panTarget - panCur) * ease(dt, 10);
    moved += Math.abs(pointer.sx - px) + Math.abs(pointer.sy - py) + Math.abs(panCur - pc);
    const camY = 2 * camDist * FOV_T * 0.035;
    camera.position.set(panCur + pointer.sx * 0.5, camY - pointer.sy * 0.3, camDist);
    camera.lookAt(panCur + pointer.sx * 0.15, camY, 0);
    camera.updateMatrixWorld();
    const sel = state.sel ? entries.get(state.sel) : undefined;
    const st = sel ? selTarget(sel.b) : null;
    lazyTextures(sel);
    const near = nearestCase(panCur, pitch, wall.cases.length);
    if (near !== shadowCase) {
      shadowCase = near;
      const cx = caseX(near, pitch);
      key.position.set(cx - 5, Hs * 0.1 + 9, 13);
      key.target.position.set(cx, 0, 0);
      key.target.updateMatrixWorld();
      shadowDirty = true;
      force = true;
    }
    const target = nearestCase(panTarget, pitch, wall.cases.length);
    const vk = `${target}|${wall.cases.length}|${wall.cases.map((c) => c.label ?? '').join(',')}`;
    if (vk !== viewKey) {
      viewKey = vk;
      hooks.onView(target, wall.cases.map((c) => c.label));
    }
    const filtering = !!(state.q || state.status);
    const fk = `${state.q}|${state.status}`;
    if (fk !== filterKey) {
      filterKey = fk;
      entries.forEach((e) => (e.match = matches(e.b, state.q, state.status)));
    }
    entries.forEach((e) => {
      const isSel = sel === e;
      const match = e.match;
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
        if (!sel && hover === e.b.id) {
          ty += 0.1;
          tz += 0.18;
        } else if (!sel && filtering && match) {
          ty += 0.08;
          tz += 0.22;
        }
        const far = p.z > e.home.z + 0.5;
        rxy = far ? 9 : 10;
        rz = far ? 3.5 : 10;
      }
      const ox = p.x + p.y + p.z + e.grp.rotation.y + e.grp.rotation.x + e.grp.scale.x;
      p.x += (tx - p.x) * ease(dt, rxy);
      p.y += (ty - p.y) * ease(dt, rxy);
      p.z += (tz - p.z) * ease(dt, rz);
      e.grp.rotation.y += (rY - e.grp.rotation.y) * ease(dt, 6);
      e.grp.rotation.x += (rX - e.grp.rotation.x) * ease(dt, 6);
      const s = e.grp.scale.x;
      e.grp.scale.setScalar(s + (sc - s) * ease(dt, 6));
      const nx = p.x + p.y + p.z + e.grp.rotation.y + e.grp.rotation.x + e.grp.scale.x;
      if (Math.abs(nx - ox) > 1e-5) {
        moved++;
        shadowDirty = true;
      }
      let tint = 0xffffff;
      if (sel && !isSel) tint = 0x5e564d;
      else if (filtering && !match) tint = 0x4d4740;
      tmpC.setHex(tint);
      const diff = Math.abs(e.tint.r - tmpC.r) + Math.abs(e.tint.g - tmpC.g) + Math.abs(e.tint.b - tmpC.b);
      if (diff === 0) return;
      // Snap the last sliver so the easing ends and the loop can go idle.
      if (diff < 0.002) e.tint.copy(tmpC);
      else e.tint.lerp(tmpC, ease(dt, 8));
      moved++;
      for (let i = 0; i < e.mats.length; i++) e.mats[i]?.color.copy(e.base[i] as THREE.Color).multiply(e.tint);
    });
    // An idle shelf costs nothing: draw only while something is still easing or was just changed.
    if (!moved && !force) return;
    force = false;
    if (shadowDirty) {
      renderer.shadowMap.needsUpdate = true;
      shadowDirty = false;
    }
    renderer.render(scene, camera);
  }

  if (import.meta.env.DEV) {
    // Lets the screenshot harness click a book without guessing pixel positions.
    (window as unknown as {__verso: unknown}).__verso = {
      stats: () => ({...renderer.info.render, textures: renderer.info.memory.textures}),
      bookScreenPos(i: number) {
        const e = [...entries.values()][i];
        if (!e) return null;
        const v = e.grp.position.clone().project(camera);
        return {x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight};
      },
    };
  }

  addEventListener('resize', onResize);
  onResize();
  tick();

  return {
    rebuild: buildShelf,
    applySettings,
    focusBook(id) {
      const c = wall.caseOf.get(id);
      if (c !== undefined) panTarget = caseX(c, pitch);
    },
    retone,
    focusCase(index) {
      panTarget = caseX(clampCase(index, wall.cases.length), pitch);
    },
    revealMatch() {
      if (!state.q && !state.status) return;
      const c = firstMatchCase(wall, (b) => matches(b, state.q, state.status));
      if (c !== null) panTarget = caseX(c, pitch);
    },
    setVisible(on) {
      visible = on;
      force = true;
      canvas.classList.toggle('hidden', !on);
      if (on) {
        last = performance.now();
        onResize();
      }
    },
  };
}
