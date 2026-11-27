import * as THREE from 'three';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import type {Book} from '../types';
import {state} from '../state';
import {matches} from '../search';
import {LIGHTS} from '../presets';
import {createRoom} from './room';
import {tintFor} from './tint';
import {createWood} from './wood';
import {DEPTH, PLINTH_H, createWallBuilder, innerWidthFor, widthBucket} from './wallBuild';
import {createPicking} from './picking';
import {createBookTextures} from './bookTextures';
import {MAT, type Entry} from './entry';
import {SETTLE_EPS, aimCamera, createRig, frameFor, frameSpace, isMobile, placeRig, selectionTarget, stepRig} from './camera';
import {approach, createFrameLoop, ease, needsAnotherFrame} from './loop';
import {caseX, clampCase, fasciaText, firstMatchCase, layoutWall, nearestCase, type SectionInfo, type Wall} from './wall';

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

  const wood = createWood(maxAniso, () => applySettings());

  function applySettings(): void {
    dirty();
    const {wood: woodId, light: lightId} = state.settings;
    wood.apply(woodId);
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
  scene.add(frame, bookRoot, decorRoot);

  let bucket = -1;
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
  const builder = createWallBuilder({frame, bookRoot, decorRoot, entries, pickables, wood, maxAniso, dirty});


  function buildShelf(): void {
    dirty();
    filterKey = '';
    renderer.shadowMap.needsUpdate = true;
    textures.prune(state.books);
    const keepCase = nearestCase(rig.panTarget, pitch, wall.cases.length);
    const oldPitch = pitch;
    const built = builder.build(state.books, !!state.settings.groupByGenre, innerWidthFor(bucket));
    ({wall, Hs, Wtot, pitch, caseView, sectionsKey} = built);
    if (pitch !== oldPitch) rig.panTarget = rig.panCur = caseX(keepCase, pitch);
    room.layout({pitch, count: wall.cases.length, floorY: built.baseY - PLINTH_H - 0.01, tops: built.tops, depth: DEPTH});
    viewKey = '';
    shadowCase = -1;
    // The shadow map covers five cases around the camera and is re-aimed when the nearest case changes.
    const ext = Math.max(Hs, 5 * pitch) / 2 + 1;
    Object.assign(key.shadow.camera, {left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 45});
    key.shadow.camera.updateProjectionMatrix();
    placeCamera(built.first);
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
    const nb = widthBucket(a);
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
