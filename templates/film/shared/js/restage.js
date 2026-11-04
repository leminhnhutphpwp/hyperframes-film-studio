// Re-stage an existing chapter for another cut (an English version) without touching its scenes.js: wrap each
// segment with a look (grade, light, weather, a camera push), cut painted tableaux into it, style the cuts.
//   import { SEGMENTS as S0 } from "./scenes.js";
//   export const SEGMENTS = restage(S0, [
//     { look: (t, r) => { fx.grade("dawn"); push(r, t, at(3), end(4), 3.5); } },     // segment 0
//     { look: ..., tableau: { spec: TAB, a: at(9), b: end(10) } },                   // segment 1, a tableau inside it
//   ]);
import { smooth, seg, clamp01 } from "./engine.js";
import * as fx from "./fx.js";

// push the camera along its view toward what it looks at, by up to dist metres over [t0, t1]; the backdrop softens
export function push(r, t, t0, t1, dist, focus = 0.85) {
  if (!r || !r.camera) return;
  const u = smooth(seg(t, t0, t1));
  if (u <= 0) return;
  r.camera.translateZ(-dist * u);
  r.camera.updateMatrixWorld();
  if (r.bdBlur) fx.focus(r, focus * u);
}
// a tableau segment (the 3D stage hidden); extra(t) draws on top (captions, grade)
export const tableauSeg = (spec, a, b, extra, opts) => ({
  a,
  b,
  run: (t) => {
    fx.tableau(spec, t, a, b, opts);
    if (extra) extra(t);
    return null;
  },
});
export function restage(segments, plan) {
  const out = [];
  segments.forEach((s, i) => {
    const p = plan[i] || {};
    const run = s.run && p.look ? (t) => {
      const r = s.run(t);
      p.look(t, r);
      return r;
    } : s.run;
    const base = Object.assign({}, s, run ? { run } : {});
    // one tableau or several, cut into this segment in time order
    const tabs = (Array.isArray(p.tableau) ? p.tableau : p.tableau ? [p.tableau] : []).slice().sort((x, y) => x.a - y.a);
    if (tabs.length && s.run) {
      let cur = s.a;
      for (const tb of tabs) {
        const a = Math.max(tb.a, cur + 0.5),
          b = Math.min(tb.b, s.b);
        if (b <= a) continue;
        out.push(Object.assign({}, base, { a: cur, b: a }));
        out.push(tableauSeg(tb.spec, a, b, (t) => { if (tb.look) tb.look(t); if (tb.extra) tb.extra(t); }, tb.opts));
        cur = b;
      }
      if (cur < s.b) out.push(Object.assign({}, base, { a: cur }));
    } else out.push(base);
  });
  return out;
}
export { clamp01 };
