// Frame loop shared by every chapter: pick the segment for time t, render it, draw the overlay, dip at hard cuts.
// A chapter's js/scenes.js exports SEGMENTS [{a, b, run(t) → {scene, camera}} | {a, b, video, stamp}] and DIPS [t...].
import { renderer, window01 } from "./engine.js";
import * as ov from "./overlay.js";
import * as fx from "./fx.js";
import * as SC from "../../js/scenes.js";

const { SEGMENTS, DIPS } = SC;
// TRANSITIONS: [{ t, kind: "ink" | "burn" | "paper" | "flash", d }] — a styled cut at t (d seconds each side)
const TRANSITIONS = SC.TRANSITIONS || [];

const canvas = document.getElementById("stage");

function renderAt(t) {
  ov.begin();
  fx.begin();
  const s = SEGMENTS.find((x) => t >= x.a && t < x.b) || SEGMENTS[SEGMENTS.length - 1];
  if (s.video) {
    window.__frame = null;
    // a timed <video> (pre-rendered battle) shows through; the 3D stage stays hidden
    canvas.style.visibility = "hidden";
    if (s.stamp) ov.stamp(s.stamp[0], s.stamp[1], window01(t, s.a + 0.4, s.b - 0.1, 0.4, 0.3));
  } else {
    canvas.style.visibility = "visible";
    const r = s.run(t);
    window.__frame = r; // tools/framecheck.py inspects the scene and camera of the last frame
    renderer.setRenderTarget(null);
    renderer.clear(true, true, true);
    // a run that returns nothing drew a painted tableau (fx.tableau): the 3D stage stays hidden
    if (r && r.scene) renderer.render(r.scene, r.camera);
    else canvas.style.visibility = "hidden";
  }
  for (const tr of TRANSITIONS) {
    const d = tr.d ?? 0.45;
    if (t > tr.t - d && t < tr.t + d) fx.transition(tr.kind, 1 - Math.abs(t - tr.t) / d);
  }
  fx.finish();
  const dip = Math.max(0, ...DIPS.map((d) => ov.dip(t, d)));
  if (dip > 0) ov.fade(Math.max(dip, Number(document.getElementById("fade").style.opacity) || 0));
}

window.addEventListener("hf-seek", (e) => renderAt(e.detail.time));
// textures load asynchronously: re-render the current frame once they are in
renderAt(window.__hfThreeTime || 0);
setTimeout(() => renderAt(window.__hfThreeTime || 0), 1500);
