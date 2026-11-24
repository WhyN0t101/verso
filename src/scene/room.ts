import * as THREE from 'three';

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

/**
 * Floor and wall lamps behind the bookcases. There is no wall mesh: the page background chosen in
 * the style dialog is the wall, so the room never hides it. The camera never leaves the wall's
 * extent, so the room is scenery, not something to navigate.
 */
export function createRoom(scene: THREE.Scene): {layout(o: RoomLayout): void} {
  const group = new THREE.Group();
  scene.add(group);
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

  return {
    layout({pitch, count, floorY, tops, depth}) {
      clear();
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
    },
  };
}
