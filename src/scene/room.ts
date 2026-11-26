import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {buildDecor} from './decor';

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

/** A worn red rug: a field, a border and a faint lattice, enough to read as woven from the camera. */
function rugTexture(): THREE.CanvasTexture {
  return gradientTexture(256, 192, (g) => {
    g.fillStyle = '#5a1f1c';
    g.fillRect(0, 0, 256, 192);
    g.strokeStyle = '#c79a52';
    g.lineWidth = 6;
    g.strokeRect(10, 10, 236, 172);
    g.strokeStyle = '#2f1110';
    g.lineWidth = 3;
    g.strokeRect(22, 22, 212, 148);
    g.strokeStyle = 'rgba(199,154,82,.35)';
    g.lineWidth = 1.5;
    for (let i = -192; i < 256; i += 24) {
      g.beginPath();
      g.moveTo(i, 170);
      g.lineTo(i + 148, 22);
      g.moveTo(i + 148, 170);
      g.lineTo(i, 22);
      g.stroke();
    }
    g.fillStyle = '#c79a52';
    g.beginPath();
    g.arc(128, 96, 26, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#5a1f1c';
    g.beginPath();
    g.arc(128, 96, 16, 0, Math.PI * 2);
    g.fill();
  });
}

/** A dusk landscape for the framed picture: sky, a low sun and three ridges. */
function paintingTexture(): THREE.CanvasTexture {
  return gradientTexture(160, 200, (g) => {
    const sky = g.createLinearGradient(0, 0, 0, 200);
    sky.addColorStop(0, '#4a5d86');
    sky.addColorStop(0.55, '#d99a68');
    sky.addColorStop(1, '#f0c78c');
    g.fillStyle = sky;
    g.fillRect(0, 0, 160, 200);
    g.fillStyle = '#f6e2b0';
    g.beginPath();
    g.arc(110, 100, 16, 0, Math.PI * 2);
    g.fill();
    [['#6a5a6e', 118], ['#46506a', 136], ['#2b3550', 158]].forEach(([c, y], i) => {
      g.fillStyle = c as string;
      g.beginPath();
      g.moveTo(0, 200);
      for (let x = 0; x <= 160; x += 8) g.lineTo(x, (y as number) + Math.sin(x * 0.07 + i * 2) * (9 - i * 2));
      g.lineTo(160, 200);
      g.fill();
    });
  });
}

/**
 * Floor and wall lamps behind the bookcases. There is no wall mesh: the page background chosen in
 * the style dialog is the wall, so the room never hides it. The camera never leaves the wall's
 * extent, so the room is scenery, not something to navigate.
 *
 * With props on, an armchair on a rug stands left of the first bookcase and a side table with an old
 * lamp right of the last one.
 */
export function createRoom(scene: THREE.Scene): {layout(o: RoomLayout): void; setProps(on: boolean): void} {
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

  const leather = new THREE.MeshStandardMaterial({color: 0x6a341f, roughness: 0.55});
  const cushion = new THREE.MeshStandardMaterial({color: 0x7d4327, roughness: 0.6});
  // Photographed leather (CC0, see public/textures/CREDITS.md), fetched the first time the props are shown.
  let leatherRequested = false;
  function loadLeather(): void {
    if (leatherRequested) return;
    leatherRequested = true;
    const loader = new THREE.TextureLoader();
    void Promise.all([loader.loadAsync('/textures/leather_diff.jpg'), loader.loadAsync('/textures/leather_nor.jpg')])
      .then(([map, normal]) => {
        for (const t of [map, normal]) {
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          t.repeat.set(2, 2);
        }
        map.colorSpace = THREE.SRGBColorSpace;
        for (const [m, tint] of [[leather, 0xffffff], [cushion, 0xffe3d0]] as const) {
          m.map = map;
          m.normalMap = normal;
          m.normalScale.set(0.8, 0.8);
          m.color.setHex(tint);
          m.needsUpdate = true;
        }
      })
      .catch((err: unknown) => console.warn('leather photo unavailable', err));
  }
  const darkWood = new THREE.MeshStandardMaterial({color: 0x2b1a10, roughness: 0.6});
  const tableWood = new THREE.MeshStandardMaterial({color: 0x4f2f1a, roughness: 0.5});
  const brass = new THREE.MeshStandardMaterial({color: 0xc19a4b, roughness: 0.35, metalness: 0.7});
  const shadeMat = new THREE.MeshStandardMaterial({color: 0xd9b074, emissive: 0xffa94a, emissiveIntensity: 0.95, roughness: 0.9, side: THREE.DoubleSide});
  const rugMat = new THREE.MeshStandardMaterial({map: rugTexture(), roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2});
  const stackMats = [0x3b4a6b, 0x7a3b2e, 0x4f6b48].map((color) => new THREE.MeshStandardMaterial({color, roughness: 0.7}));
  const decorMat = new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.6});
  const gilt = new THREE.MeshStandardMaterial({color: 0x8a6a2f, roughness: 0.4, metalness: 0.5});
  const paintingMat = new THREE.MeshStandardMaterial({map: paintingTexture(), roughness: 0.9});
  const lampLight = new THREE.PointLight(0xffc27a, 0, 16, 2);
  props.add(lampLight);
  // A table lamp lights the shelf beside it, not the whole wall.
  const LAMP_INTENSITY = 26;

  const part = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, into: THREE.Object3D): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    into.add(m);
    return m;
  };
  const soft = (w: number, h: number, d: number): THREE.BufferGeometry => new RoundedBoxGeometry(w, h, d, 3, Math.min(w, h, d) * 0.28);

  /** A leather wing-less armchair, about a metre high at this scale, standing on the floor at the origin and facing +z. */
  function armchair(): THREE.Group {
    const g = new THREE.Group();
    for (const [x, z] of [[-1.3, -1.1], [1.3, -1.1], [-1.3, 1.1], [1.3, 1.1]] as const) part(new THREE.CylinderGeometry(0.09, 0.07, 0.5, 10), darkWood, x, 0.25, z, g);
    part(soft(3.2, 0.5, 3.0), leather, 0, 0.75, 0, g);
    part(soft(2.4, 0.5, 2.3), cushion, 0, 1.25, 0.25, g);
    part(soft(3.2, 3.1, 0.7), leather, 0, 2.3, -1.15, g);
    const back = part(soft(2.3, 1.9, 0.55), cushion, 0, 2.35, -0.7, g);
    back.rotation.x = -0.14;
    for (const x of [-1.3, 1.3]) part(soft(0.65, 1.55, 2.9), leather, x, 1.6, 0.05, g);
    return g;
  }

  /** A pedestal table with an old brass lamp and a few books on it. Returns the world height of the shade centre. */
  function tableWithLamp(g: THREE.Group): number {
    const topY = 2.4;
    part(new THREE.CylinderGeometry(1.25, 1.25, 0.12, 32), tableWood, 0, topY, 0, g);
    part(new THREE.CylinderGeometry(0.13, 0.17, topY - 0.12, 12), tableWood, 0, (topY - 0.12) / 2, 0, g);
    part(new THREE.CylinderGeometry(0.75, 0.85, 0.12, 24), tableWood, 0, 0.06, 0, g);
    // The old lamp: heavy base, a thin stem, and a flared shade.
    part(new THREE.CylinderGeometry(0.3, 0.42, 0.28, 20), brass, 0.35, topY + 0.2, -0.1, g);
    part(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 10), brass, 0.35, topY + 0.9, -0.1, g);
    const shadeY = topY + 1.75;
    part(new THREE.CylinderGeometry(0.5, 0.95, 0.95, 28, 1, true), shadeMat, 0.35, shadeY, -0.1, g);
    const halo = new THREE.Sprite(glowMat);
    halo.scale.set(5.2, 5.2, 1);
    halo.position.set(0.35, shadeY, -0.1);
    g.add(halo);
    // Three books lying on the table.
    stackMats.forEach((mat, i) => {
      const b = part(new THREE.BoxGeometry(0.95 - i * 0.08, 0.2, 0.65 - i * 0.05), mat, -0.55, topY + 0.16 + i * 0.2, 0.25, g);
      b.rotation.y = 0.3 - i * 0.22;
    });
    return shadeY;
  }

  function clearProps(): void {
    for (const m of props.children.slice()) {
      m.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      if (m !== lampLight) props.remove(m);
    }
    lampLight.intensity = 0;
  }

  let layoutNow: RoomLayout | null = null;
  let propsOn = false;

  function buildProps(): void {
    clearProps();
    if (!propsOn || !layoutNow) return;
    loadLeather();
    const {pitch, count, floorY} = layoutNow;
    const span = (count - 1) * pitch;
    const rug = part(new THREE.PlaneGeometry(8.2, 6.2), rugMat, 0, floorY + 0.02, 0, props);
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(-(pitch / 2 + 4.3), floorY + 0.02, 0.9);
    const chair = armchair();
    chair.position.set(-(pitch / 2 + 4.3), floorY, 0.2);
    chair.rotation.y = 0.5;
    props.add(chair);
    const table = new THREE.Group();
    table.position.set(span + pitch / 2 + 3.2, floorY, 0.2);
    props.add(table);
    const shadeY = tableWithLamp(table);
    lampLight.position.set(table.position.x + 0.35, floorY + shadeY, table.position.z - 0.1);
    lampLight.updateMatrix();
    lampLight.intensity = LAMP_INTENSITY;
    const chairX = -(pitch / 2 + 4.3);
    // A big pot by the armchair, and a floor lamp between the chair and the bookcase.
    const pot = part(buildDecor('plant'), decorMat, chairX - 2.7, floorY, 0.2, props);
    pot.scale.setScalar(2.3);
    const lamp = new THREE.Group();
    lamp.position.set(-(pitch / 2 + 1.7), floorY, -0.1);
    part(new THREE.CylinderGeometry(0.5, 0.55, 0.12, 20), brass, 0, 0.06, 0, lamp);
    part(new THREE.CylinderGeometry(0.05, 0.05, 5.4, 8), brass, 0, 2.8, 0, lamp);
    part(new THREE.CylinderGeometry(0.55, 1.0, 1.1, 24, 1, true), shadeMat, 0, 5.7, 0, lamp);
    const lampHalo = new THREE.Sprite(glowMat);
    lampHalo.scale.set(5.5, 5.5, 1);
    lampHalo.position.set(0, 5.7, 0);
    lamp.add(lampHalo);
    props.add(lamp);
    // A framed picture leaning on the floor beside the table.
    const picture = new THREE.Group();
    picture.position.set(table.position.x + 2.9, floorY + 1.45, -0.2);
    picture.rotation.x = -0.1;
    part(new THREE.BoxGeometry(2.3, 2.9, 0.14), gilt, 0, 0, 0, picture);
    part(new THREE.PlaneGeometry(1.9, 2.5), paintingMat, 0, 0, 0.075, picture);
    props.add(picture);
    // Nothing here moves, so the transforms are fixed once.
    props.updateMatrixWorld(true);
    props.traverse((o) => (o.matrixAutoUpdate = false));
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
