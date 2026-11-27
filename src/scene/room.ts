import * as THREE from 'three';
import {contactShadow, loadModel, type ModelName} from './assets';
import {rng} from '../util';

export interface RoomLayout {
  pitch: number;
  count: number;
  /** World y of the floor under the bookcases. */
  floorY: number;
  /** World y of the top edge of each bookcase, fascia included. */
  tops: number[];
  depth: number;
}

function gradientTexture(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable');
  paint(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A worn red rug: a field, a border and a faint lattice, with woven grain, uneven wear and fringe at the ends. */
function rugTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 384;
  const FRINGE = 14;
  return gradientTexture(W, H, (g) => {
    g.fillStyle = '#a58f66';
    g.fillRect(0, 0, W, H);
    // Fringe: short tassels along the two short ends.
    const tassel = rng(11);
    g.strokeStyle = 'rgba(235,215,170,.5)';
    g.lineWidth = 1.5;
    for (let y = 0; y < H; y += 3) {
      for (const [x0, x1] of [[0, FRINGE], [W, W - FRINGE]] as const) {
        g.beginPath();
        g.moveTo(x0, y);
        g.lineTo(x1, y + (tassel() - 0.5) * 3);
        g.stroke();
      }
    }
    g.save();
    g.beginPath();
    g.rect(FRINGE, 0, W - 2 * FRINGE, H);
    g.clip();
    g.fillStyle = '#5a1f1c';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#c79a52';
    g.lineWidth = 12;
    g.strokeRect(24, 20, W - 48, H - 40);
    g.strokeStyle = '#2f1110';
    g.lineWidth = 6;
    g.strokeRect(46, 42, W - 92, H - 84);
    g.strokeStyle = 'rgba(199,154,82,.35)';
    g.lineWidth = 3;
    for (let i = -H; i < W; i += 48) {
      g.beginPath();
      g.moveTo(i, H - 44);
      g.lineTo(i + H - 88, 44);
      g.moveTo(i + H - 88, H - 44);
      g.lineTo(i, 44);
      g.stroke();
    }
    g.fillStyle = '#c79a52';
    g.beginPath();
    g.arc(W / 2, H / 2, 52, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#5a1f1c';
    g.beginPath();
    g.arc(W / 2, H / 2, 32, 0, Math.PI * 2);
    g.fill();
    // Weave: warp and weft threads, light and dark, a pixel apart.
    const weave = rng(5);
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = weave() < 0.5 ? 'rgba(255,225,170,.06)' : 'rgba(0,0,0,.09)';
      if (weave() < 0.5) g.fillRect(weave() * W, weave() * H, 1.5, 6 + weave() * 14);
      else g.fillRect(weave() * W, weave() * H, 6 + weave() * 14, 1.5);
    }
    // Wear: foot traffic has flattened and faded a few patches.
    const wear = rng(9);
    for (let i = 0; i < 6; i++) {
      const x = wear() * W;
      const y = wear() * H;
      const r = 30 + wear() * 50;
      const patch = g.createRadialGradient(x, y, 0, x, y, r);
      patch.addColorStop(0, 'rgba(210,180,140,.16)');
      patch.addColorStop(1, 'rgba(210,180,140,0)');
      g.fillStyle = patch;
      g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    g.restore();
  });
}

/**
 * Floor and wall lamps behind the bookcases. There is no wall mesh: the page background chosen in
 * the style dialog is the wall, so the room never hides it. The camera never leaves the wall's
 * extent, so the room is scenery, not something to navigate.
 *
 * With props on, an armchair, a plant and a rug stand left of the first bookcase and a side table with an old
 * lamp and a picture right of the last one. They are real models loaded on demand (see assets.ts).
 */
export function createRoom(scene: THREE.Scene, anisotropy = 1): {layout(o: RoomLayout): void; setProps(on: boolean): void} {
  const group = new THREE.Group();
  const props = new THREE.Group();
  scene.add(group, props);
  const glow = gradientTexture(128, 128, (g) => {
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,214,150,.85)');
    r.addColorStop(0.35, 'rgba(255,190,110,.28)');
    r.addColorStop(1, 'rgba(255,170,90,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
  });
  // Opaque and warm at the front edge, fading into the dark towards the back wall.
  const floor = gradientTexture(4, 256, (g) => {
    const r = g.createLinearGradient(0, 0, 0, 256);
    r.addColorStop(0, 'rgba(20,12,7,0)');
    r.addColorStop(0.45, 'rgba(34,21,12,.55)');
    r.addColorStop(1, 'rgba(46,29,16,.92)');
    g.fillStyle = r;
    g.fillRect(0, 0, 4, 256);
  });
  const floorMat = new THREE.MeshBasicMaterial({map: floor, transparent: true, depthWrite: false});
  const glowMat = new THREE.SpriteMaterial({map: glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true});
  const bulbMat = new THREE.MeshBasicMaterial({color: 0xffe0a8});
  const bulbGeo = new THREE.SphereGeometry(0.09, 12, 8);

  function clear(): void {
    for (const m of group.children.slice()) {
      if ((m as THREE.Mesh).geometry && (m as THREE.Mesh).geometry !== bulbGeo) (m as THREE.Mesh).geometry.dispose();
      group.remove(m);
    }
  }

  /* ---------- props ---------- */

  const rugMap = rugTexture();
  // The rug is seen at a low angle; without anisotropic filtering its weave smears to grey.
  rugMap.anisotropy = anisotropy;
  const rugMat = new THREE.MeshStandardMaterial({map: rugMap, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2});
  const lampLight = new THREE.PointLight(0xffc27a, 0, 16, 2);
  props.add(lampLight);
  // A table lamp lights the shelf beside it, not the whole wall.
  const LAMP_INTENSITY = 26;

  let layoutNow: RoomLayout | null = null;
  let propsOn = false;
  /** Bumped on every rebuild, so a model that arrives after the props were switched off or moved is dropped. */
  let buildId = 0;

  function clearProps(): void {
    for (const m of props.children.slice()) {
      if (m === lampLight) continue;
      // Model copies share geometry and materials with each other; only the rug plane is ours to free.
      if ((m as THREE.Mesh).isMesh && !m.userData.keep) (m as THREE.Mesh).geometry.dispose();
      props.remove(m);
    }
    lampLight.intensity = 0;
  }

  function buildProps(): void {
    clearProps();
    const id = ++buildId;
    if (!propsOn || !layoutNow) return;
    const {pitch, count, floorY} = layoutNow;
    const chairX = -(pitch / 2 + 4.3);
    const tableX = (count - 1) * pitch + pitch / 2 + 2.3;
    const topY = floorY + 2.3;
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(8.2, 6.2), rugMat);
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(chairX, floorY + 0.02, 0.9);
    props.add(rug);
    const add = (name: ModelName, height: number, x: number, y: number, z: number, turn: number): void => {
      loadModel(name, height).then(
        (m) => {
          if (id !== buildId) return;
          m.position.set(x, y, z);
          m.rotation.y = turn;
          props.add(m);
        },
        (err: unknown) => console.warn(`model ${name} unavailable`, err),
      );
    };
    add('armchair', 3.7, chairX, floorY, 0.2, 0.5);
    add('plant', 2.3, chairX - 2.6, floorY, 0.3, 0);
    add('table', 2.3, tableX, floorY, 0.2, 0);
    add('lamp', 2.0, tableX + 0.3, topY, 0.1, 0);
    add('picture', 1.0, tableX - 0.6, topY, 0.5, 0.3);
    // A framed painting on the wall above the armchair: the wall is the page background, so it hangs where the wall would be.
    add('painting', 4.2, chairX + 0.4, floorY + 7.4, -layoutNow.depth / 2 - 0.5, 0);
    for (const [w, d, x, y, z] of [[4.6, 3.6, chairX, floorY, 0.3], [2.6, 2.2, chairX - 2.6, floorY, 0.3], [2.9, 2.9, tableX, floorY, 0.2], [1.3, 1.3, tableX + 0.3, topY, 0.1], [1.1, 0.9, tableX - 0.6, topY, 0.5]] as const) props.add(contactShadow(w, d, x, y + 0.03, z));
    // The flame sits about two thirds up the lamp: the light and its halo are put there.
    const flame = new THREE.Vector3(tableX + 0.35, topY + 1.3, 0.1);
    lampLight.position.copy(flame);
    lampLight.intensity = LAMP_INTENSITY;
    const halo = new THREE.Sprite(glowMat);
    halo.scale.set(5, 5, 1);
    halo.position.copy(flame);
    props.add(halo);
  }

  return {
    layout(o) {
      layoutNow = o;
      clear();
      const {pitch, count, floorY, tops, depth} = o;
      const span = (count - 1) * pitch;
      const w = span + 90;
      const front = 18;
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, front + depth / 2), floorMat);
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(span / 2, floorY, (front - depth / 2) / 2);
      group.add(plane);
      for (let i = 0; i < count; i++) {
        const x = i * pitch;
        const y = (tops[i] ?? 0) + 0.55;
        const z = -depth / 2 - 0.4;
        const bulb = new THREE.Mesh(bulbGeo, bulbMat);
        bulb.position.set(x, y, z);
        const halo = new THREE.Sprite(glowMat);
        halo.scale.set(3.4, 3.4, 1);
        halo.position.set(x, y, z);
        const pool = new THREE.Sprite(glowMat);
        pool.scale.set(pitch * 1.5, 5, 1);
        pool.position.set(x, y - 1.6, z - 0.1);
        group.add(pool, halo, bulb);
      }
      buildProps();
    },
    setProps(on) {
      propsOn = on;
      buildProps();
    },
  };
}
