// Side-view paper stages shared by the chapters: backdrop, placement, shadows, hearth smoke, animals, seated pose.
import { THREE, LIB, piece, picture, blobShadow, lights, card, makeFigure, W, H } from "./engine.js";

export function stage(backdropId, { width = 31, height = 20.7, z = -7, y = 4.6 } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fb8c8);
  lights(scene, [-6, 12, 14], 2.0);
  const bd = picture(`assets/lib/backdrops/${backdropId}.jpg`, width, height);
  bd.position.set(0, y, z);
  scene.add(bd);
  // the same backdrop pre-blurred (chapter_build writes <id>.blur.jpg), faded in by fx.focus for close shots
  const bdBlur = picture(`assets/lib/backdrops/${backdropId}.blur.jpg`, width, height);
  bdBlur.material.transparent = true;
  bdBlur.material.opacity = 0;
  bdBlur.material.depthWrite = false;
  bdBlur.visible = false;
  bdBlur.position.set(0, y, z + 0.01);
  scene.add(bdBlur);
  const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 200);
  return { scene, camera, bd, bdBlur };
}
export const look = (cam, pos, tgt) => {
  cam.position.set(...pos);
  cam.lookAt(new THREE.Vector3(...tgt));
  cam.updateMatrixWorld();
};
export const place = (sc, obj, x, y, z, flip = false) => {
  obj.position.set(x, y, z);
  if (flip) obj.scale.x = -1;
  sc.add(obj);
  return obj;
};
export const shadowUnder = (sc, x, z, w, d = 0.7) => {
  const s = blobShadow(w, d);
  s.position.set(x, 0.01, z + 0.05);
  sc.add(s);
};
const smokeSet = () => LIB["lua-khoi@base"];
function smokePuff(sc) {
  const set = smokeSet(),
    P = set.parts.smoke2;
  const m = card(set, "smoke2", [P.w / 2, P.h / 2], 1.0 / P.h, 0);
  // hearth smoke: pale grey, not the brown of a burning city
  m.material = new THREE.MeshBasicMaterial({ map: m.material.map, transparent: true, alphaTest: 0.02, depthWrite: false, toneMapped: false, color: new THREE.Color(1.55, 1.55, 1.6) });
  m.castShadow = false;
  sc.add(m);
  return m;
}
// a chimney of soft smoke: puffs rise, swell and fade on a loop
export function smokeAt(sc, x, y, z, n = 5, seed = 0) {
  const puffs = Array.from({ length: n }, () => smokePuff(sc));
  return (t) =>
    puffs.forEach((m, i) => {
      const u = ((t / 4 + i / n + seed) % 1 + 1) % 1;
      m.position.set(x + u * 0.9 + Math.sin(t + i) * 0.1, y + u * 2.4, z - 0.05);
      m.scale.setScalar(0.4 + u * 1.3);
      m.material.opacity = 0.55 * Math.sin(u * Math.PI);
    });
}
// animals as single cut-outs: a little bounce while walking, a slow nod while grazing
export function animal(sc, id, width, x, z, flip = false) {
  const g = new THREE.Group();
  g.add(piece(id, width, 0.5, 0.97, 0));
  const sh = blobShadow(width * 0.8, 0.6);
  g.add(sh);
  place(sc, g, x, 0, z, flip);
  return g;
}

// sitting on a bench, stool or throne: put the figure's root at the seat height (root.position.y, set BEFORE
// applyPose) and pose with SEATED (+ arms); the legs are solved so the feet rest on the ground (engine seatLegs)
export const SEATED = { lean: 0.02, tilt: 0, aL1: 0.25, aL2: 0.6, aR1: 0.3, aR2: 0.6, lL1: 1.45, lL2: -1.45, lR1: 1.55, lR2: -1.5, lift: 0, fall: 0, seat: true, sit: true };
// a point in the 3D stage → pixels on the 1920×1080 frame (to pin overlay labels on puppets)
export function screenOf(camera, x, y, z) {
  const v = new THREE.Vector3(x, y, z).project(camera);
  return [((v.x + 1) / 2) * W, ((1 - v.y) / 2) * H];
}
// astride a horse: thighs down along the flanks, shins hanging (not the chair pose)
export const RIDING = { lean: 0.03, tilt: 0, aL1: 0.9, aL2: 0.6, aR1: 0.5, aR2: 0.6, lL1: 0.5, lL2: -0.3, lR1: 0.62, lR2: -0.38, lift: 0, fall: 0, seat: true };
// seat a puppet on a mount (shared/js/engine makeMount): pose it with RIDING each frame
export function rideOn(mount, figure) {
  // a drawn stand-in cannot sit astride: swap back to the jointed puppet for riding (same object, so the scene's
  // reference keeps working)
  if (figure.anim && figure.puppetArgs) {
    figure.root.parent && figure.root.parent.remove(figure.root);
    const f = makeFigure(...figure.puppetArgs);
    for (const k of Object.keys(figure)) delete figure[k];
    Object.assign(figure, f);
  }
  mount.seat.add(figure.root);
  figure.mount = mount; // applyPose puts the feet in the stirrups (RIDING; p.freeLegs to pose the legs yourself)
  figure.legL.a.position.z = -0.26; // the far leg hangs behind the animal
  return figure;
}
// down on one knee (surrender, homage): front thigh level, front shin upright, back knee on the ground.
// Mix with the arms you need: Object.assign({}, KNEEL, { aR1: 1.2, aR2: 0.2 })
export const KNEEL = { lean: 0.22, tilt: 0.28, aL1: 0.35, aL2: 0.5, aR1: 0.6, aR2: 0.4, lL1: 1.5, lL2: -1.5, lR1: -0.3, lR2: -1.15, lift: 0, fall: 0, kneel: true };
