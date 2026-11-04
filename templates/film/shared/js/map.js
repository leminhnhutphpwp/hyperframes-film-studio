// The parchment map stage: base texture + territory layers on a ground plane, a flying camera,
// and lon/lat → screen projection for the overlay. Built by tools/map_render.py (projection.json).
import { THREE, tex, lights, easeInOut, lerp, W, H } from "./engine.js";

const PROJ = window.MAP_PROJ;
const UNIT = 100; // map pixels per world unit
const MW = PROJ.width / UNIT,
  MH = PROJ.height / UNIT;
// only the territory layers this chapter's scenes name are loaded (GPU memory): chapter_build writes window.MAP_LAYERS
export const LAYERS = (PROJ.layers || []).filter((l) => !window.MAP_LAYERS || window.MAP_LAYERS.includes(l));

export const scene = new THREE.Scene();
scene.userData.mapSize = [MW, MH]; // tools/framecheck.py: is the map's edge in view?
scene.background = new THREE.Color(0x2a2118);
lights(scene, [-10, 30, 14], 1.6);
export const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 400);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(MW, MH), new THREE.MeshBasicMaterial({ map: tex("shared/map/out/base.jpg"), toneMapped: false }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
// a dark table under the map so tilted views never show emptiness
const table = new THREE.Mesh(new THREE.PlaneGeometry(MW * 4, MH * 4), new THREE.MeshBasicMaterial({ color: 0x2a2118 }));
table.rotation.x = -Math.PI / 2;
table.position.y = -0.05;
scene.add(table);
const layer = {};
LAYERS.forEach((name, i) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(MW, MH), new THREE.MeshBasicMaterial({ map: tex(`shared/map/out/${name}.png`), transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.002 * (i + 1);
  m.renderOrder = i + 1;
  scene.add(m);
  layer[name] = m;
});

// lon/lat → world point on the map plane
export function world(lon, lat, y = 0) {
  const px = (lon - PROJ.lon[0]) * PROJ.cos * PROJ.k,
    py = (PROJ.lat[1] - lat) * PROJ.k;
  return new THREE.Vector3(px / UNIT - MW / 2, y, py / UNIT - MH / 2);
}
export function screen(lon, lat, y = 0) {
  const v = world(lon, lat, y).project(camera);
  return [((v.x + 1) / 2) * W, ((1 - v.y) / 2) * H];
}
// km per world unit at the map's latitude (1° latitude ≈ 111 km)
export const kmToWorld = (km) => (km / 111) * (PROJ.k / UNIT);

// camera keyframes: [t, lon, lat, distance, tilt(rad from vertical)], eased between keys
export function cameraAt(t, keys) {
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
  const a = keys[i],
    b = keys[Math.min(i + 1, keys.length - 1)];
  const u = b[0] > a[0] ? easeInOut(Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0])))) : 1;
  const [lon, lat, d, tilt] = [1, 2, 3, 4].map((j) => lerp(a[j], b[j], u));
  const target = world(lon, lat);
  camera.position.set(target.x, d * Math.cos(tilt), target.z + d * Math.sin(tilt));
  camera.lookAt(target);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
}
export function layers(op) {
  for (const name of LAYERS) layer[name].material.opacity = op[name] || 0;
}
