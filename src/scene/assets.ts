import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/** Optimised CC0 models in public/models (see CREDITS.md there): meshopt-compressed, 512 to 1024 px WebP textures. */
export type ModelName = 'armchair' | 'table' | 'lamp' | 'plant' | 'picture' | 'painting' | 'vase';

/** The photographed models are lit like a studio shot; this warms and dims them to sit in a lamplit room. */
const GRADE = new THREE.Color(0xe6c9a0);
const ENV_SHARE = 0.55;

function grade(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mats = (o as THREE.Mesh).material;
    for (const m of Array.isArray(mats) ? mats : mats ? [mats] : []) {
      if (!(m instanceof THREE.MeshStandardMaterial) || m.userData.graded) continue;
      m.userData.graded = true;
      m.color.multiply(GRADE);
      m.envMapIntensity = ENV_SHARE;
    }
  });
}

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const loaded = new Map<ModelName, Promise<THREE.Object3D>>();

/**
 * A model scaled to `height` world units, standing on y = 0 and centred on x and z. Each call returns a new
 * group, but every one shares the file's geometry and materials, so a second copy costs a draw call and no memory.
 * Rejects when the file cannot be loaded; callers leave the scene as it was.
 */
export async function loadModel(name: ModelName, height: number): Promise<THREE.Group> {
  let source = loaded.get(name);
  if (!source) {
    source = loader.loadAsync(`/models/${name}.glb`).then((gltf) => {
      grade(gltf.scene);
      return gltf.scene;
    });
    loaded.set(name, source);
    // A failed load must not be remembered, so a later call can try again.
    source.catch(() => loaded.delete(name));
  }
  const model = (await source).clone(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const scale = size.y > 0 ? height / size.y : 1;
  const holder = new THREE.Group();
  model.position.set(-centre.x, -box.min.y, -centre.z);
  const scaled = new THREE.Group();
  scaled.add(model);
  scaled.scale.setScalar(scale);
  holder.add(scaled);
  return holder;
}

let blobMat: THREE.MeshBasicMaterial | null = null;
const blobGeo = new THREE.PlaneGeometry(1, 1);

/** A soft dark pool of the given size lying flat on a surface, so a model sits on it instead of floating. Share-owned: never dispose its geometry. */
export function contactShadow(width: number, depth: number, x: number, y: number, z: number): THREE.Mesh {
  if (!blobMat) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    if (!g) throw new Error('2D canvas unavailable');
    const r = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    r.addColorStop(0, 'rgba(0,0,0,.55)');
    r.addColorStop(0.6, 'rgba(0,0,0,.22)');
    r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
    blobMat = new THREE.MeshBasicMaterial({map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3});
  }
  const m = new THREE.Mesh(blobGeo, blobMat);
  m.rotation.x = -Math.PI / 2;
  m.scale.set(width, depth, 1);
  m.position.set(x, y, z);
  m.userData.keep = true;
  return m;
}
