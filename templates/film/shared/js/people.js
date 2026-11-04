// Small helpers every chapter used to repeat: idle poses, a puppet with its shadow, a label over a puppet, walking in.
import { THREE, LIB, blobShadow, makeFigure, makeAnimPerson, poseAnimPerson, applyPose, IDLE, gait, smooth, seg, lerp } from "./engine.js";
import * as ov from "./overlay.js";
import { screenOf } from "./stage.js";

export const pose = (extra) => Object.assign({}, IDLE, extra);
export const breathe = (t, i) => ({ lean: 0.03 + 0.012 * Math.sin(t * 1.8 + i) });
export function person(sc, kit, heads, head, size = 1, opts = {}) {
  const f = makeFigure(sc, kit, heads, head, size, opts); // records the puppet; a drawn stand-in comes back as is
  if (f.anim) return f;
  f.root.add(blobShadow(0.9, 0.5));
  return f;
}
// a label pinned above a puppet (x, y, z in the stage)
export const tag = (cam, text, x, y, z, alpha, size = 40, colour = "#3b2a18") => ov.region(text, screenOf(cam, x, y, z), alpha, { size, colour });
// stand still: position, facing (+1 right / -1 left), breathing, optional extra pose
export function stand(f, t, x, z, face = 1, i = 0, extra = {}) {
  f.root.position.set(x, 0, z);
  f.root.scale.x = face;
  applyPose(f, pose({ ...breathe(t, i), ...extra }));
}
// walk from x0 to x1 over [t0, t1]; facing follows the direction
export function walk(f, t, x0, x1, z, t0, t1, extra = {}) {
  const k = smooth(seg(t, t0, t1));
  const x = lerp(x0, x1, k);
  f.root.position.set(x, 0, z);
  f.root.scale.x = x1 >= x0 ? 1 : -1;
  if (f.castKey && window.__poses && k > 0 && k < 1) (window.__poses[f.castKey] ||= {}).walk = 1;
  if (f.anim) {
    // a drawn walker: one walk cycle per 1.4 m covered; standing drawing before and after
    if (k > 0 && k < 1) poseAnimPerson(f, "walk", Math.abs(x - x0) / 1.4);
    else applyPose(f, pose(extra));
    return k;
  }
  applyPose(f, pose({ ...gait(Math.abs(x - x0) + 3, k > 0 && k < 1 ? 0.42 : 0), ...extra }));
  return k;
}
export function desk(sc, x, z, w = 3.2, colour = 0x6b4a2b) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.95, 1.0), new THREE.MeshStandardMaterial({ color: colour, roughness: 0.9 }));
  m.position.set(x, 0.475, z);
  sc.add(m);
  return m;
}
// a person from a cast entry [kit, heads, head, size, opts] (shared/js/cast.js)
export const cast = (sc, spec) => person(sc, ...spec);
