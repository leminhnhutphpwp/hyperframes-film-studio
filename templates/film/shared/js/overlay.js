// HTML/SVG layer over the 3D stage: map labels, routes, date stamps, title and note cards.
// Rebuilt every frame from the current time, so it is seek-safe.
import { lerp, smooth, seg } from "./engine.js";

const NS = "http://www.w3.org/2000/svg";
const svg = document.getElementById("ov-svg");
const labels = document.getElementById("ov-labels");
const stampEl = document.getElementById("stamp");
const titleEl = document.getElementById("title-card");
const noteEl = document.getElementById("note-card");
const fadeEl = document.getElementById("fade");
const dimEl = document.getElementById("dim");
const tintEl = document.getElementById("tint");

// on-screen text in the film's language: window.TR (written by chapter_build.py --lang) maps the Vietnamese text to its
// translation; every text seen is recorded in window.__trSeen so tools/collect_strings.py can list what needs one
export function tr(s) {
  if (s == null || s === "") return s;
  (window.__trSeen ||= new Set()).add(s);
  return (window.TR && window.TR[s]) || s;
}
export const COL = { rome: "#a83a2c", carthage: "#6b3f86", company: "#a83a2c", nawab: "#2f6b4f", mughal: "#6b3f86", ink: "#3b2a18", paper: "#f3e7c9" };

export function begin() {
  svg.replaceChildren();
  labels.replaceChildren();
  stampEl.style.opacity = 0;
  titleEl.style.opacity = 0;
  noteEl.style.opacity = 0;
  fadeEl.style.opacity = 0;
  dimEl.style.opacity = 0;
  tintEl.style.opacity = 0;
}
// warm storybook tint over the stage (legends)
export function tint(alpha) {
  tintEl.style.opacity = alpha;
}
// darken the stage under the overlay text (title card)
export function dim(alpha) {
  dimEl.style.opacity = alpha;
}

function svgEl(tag, attrs) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  svg.appendChild(e);
  return e;
}

// big region names: spaced capitals, ink with a paper halo
export function region(text, [x, y], alpha, { size = 54, colour = COL.ink, rotate = 0 } = {}) {
  if (alpha <= 0.01) return;
  const d = document.createElement("div");
  d.className = "map-region";
  d.textContent = tr(text);
  Object.assign(d.style, { left: `${x}px`, top: `${y}px`, opacity: alpha, fontSize: `${size}px`, color: colour, transform: `translate(-50%, -50%) rotate(${rotate}deg) translateY(${(1 - alpha) * 10}px)` });
  labels.appendChild(d);
}

// a place: dot + name; pulse 0..1 adds a ring
export function place(text, [x, y], alpha, { side = "right", pulse = 0, colour = COL.ink, size = 34 } = {}) {
  if (alpha <= 0.01) return;
  svgEl("circle", { cx: x, cy: y, r: 9, fill: colour, stroke: COL.paper, "stroke-width": 3, opacity: alpha });
  if (pulse > 0) svgEl("circle", { cx: x, cy: y, r: 10 + 46 * pulse, fill: "none", stroke: colour, "stroke-width": 4, opacity: alpha * (1 - pulse) });
  const d = document.createElement("div");
  d.className = "map-place";
  d.textContent = tr(text);
  const dx = side === "right" ? 18 : side === "left" ? -18 : 0;
  const ax = side === "right" ? "0%" : side === "left" ? "-100%" : "-50%";
  const dy = side === "below" ? 26 : side === "above" ? -26 : 0;
  Object.assign(d.style, { left: `${x + dx}px`, top: `${y + dy}px`, opacity: alpha, fontSize: `${size}px`, transform: `translate(${ax}, -50%)` });
  labels.appendChild(d);
}

const pathD = (pts) => pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
export function partial(pts, f) {
  if (f >= 1) return pts;
  const lens = [0];
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const want = lens[lens.length - 1] * Math.max(0, f),
    out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (lens[i] < want) out.push(pts[i]);
    else {
      const u = (want - lens[i - 1]) / Math.max(1e-6, lens[i] - lens[i - 1]);
      out.push([lerp(pts[i - 1][0], pts[i][0], u), lerp(pts[i - 1][1], pts[i][1], u)]);
      break;
    }
  }
  if (out.length < 2) out.push(pts[0]);
  return out;
}
// smooth a polyline through control points (Catmull-Rom), n samples per span
export function spline(ctrl, n = 16) {
  const out = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)],
      p1 = ctrl[i],
      p2 = ctrl[i + 1],
      p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    for (let j = 0; j < n; j++) {
      const t = j / n,
        t2 = t * t,
        t3 = t2 * t;
      out.push([0, 1].map((a) => 0.5 * (2 * p1[a] + (-p0[a] + p2[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t3)));
    }
  }
  out.push(ctrl[ctrl.length - 1]);
  return out;
}
// a march route: dark under-stroke, coloured body, arrow head; grow 0..1 draws it
export function route(pts, grow, alpha, { colour = COL.carthage, width = 16, dash = false, head = true } = {}) {
  if (alpha <= 0.01 || grow <= 0.001) return;
  const shown = partial(pts, grow),
    d = pathD(shown);
  svgEl("path", { d, fill: "none", stroke: "rgba(30,20,10,0.6)", "stroke-width": width + 10, "stroke-linecap": "round", "stroke-linejoin": "round", opacity: alpha });
  svgEl("path", { d, fill: "none", stroke: colour, "stroke-width": width, "stroke-linecap": "round", "stroke-linejoin": "round", opacity: alpha, ...(dash ? { "stroke-dasharray": `${width * 1.6} ${width * 1.1}` } : {}) });
  if (!head) return;
  const [a, b] = [shown[Math.max(0, shown.length - 3)], shown[shown.length - 1]];
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]),
    s = width * 2.4;
  const pt = (r, da) => `${(b[0] + Math.cos(ang + da) * r).toFixed(1)},${(b[1] + Math.sin(ang + da) * r).toFixed(1)}`;
  svgEl("polygon", { points: `${pt(s * 0.9, 0)} ${pt(s * 0.75, 2.3)} ${pt(s * 0.75, -2.3)}`, fill: colour, stroke: "rgba(30,20,10,0.6)", "stroke-width": 4, opacity: alpha });
}
export function ring([x, y], r, alpha, { colour = COL.ink, dash = true, width = 5 } = {}) {
  if (alpha <= 0.01) return;
  svgEl("circle", { cx: x, cy: y, r, fill: "none", stroke: colour, "stroke-width": width, opacity: alpha, ...(dash ? { "stroke-dasharray": "14 10" } : {}) });
}
export function caption(text, [x, y], alpha, { size = 30 } = {}) {
  if (alpha <= 0.01) return;
  const d = document.createElement("div");
  d.className = "map-caption";
  d.textContent = tr(text);
  Object.assign(d.style, { left: `${x}px`, top: `${y}px`, opacity: alpha, fontSize: `${size}px` });
  labels.appendChild(d);
}

// date stamp, bottom-left: year big, one line under it
export function stamp(year, line, alpha) {
  if (alpha <= 0.01) return;
  stampEl.querySelector(".year").textContent = tr(year);
  stampEl.querySelector(".line").textContent = tr(line) || "";
  stampEl.querySelector(".line").style.display = line ? "block" : "none";
  stampEl.style.opacity = alpha;
  stampEl.style.transform = `translateY(${(1 - alpha) * 18}px)`;
}
export function title(alpha, rise) {
  titleEl.style.opacity = alpha;
  titleEl.style.transform = `translate(-50%, -50%) translateY(${(1 - rise) * 24}px)`;
}
export function note(head, body, alpha) {
  if (alpha <= 0.01) return;
  noteEl.querySelector(".head").textContent = tr(head);
  noteEl.querySelector(".body").textContent = tr(body);
  noteEl.style.opacity = alpha;
  noteEl.style.transform = `translateX(${(1 - alpha) * 40}px) rotate(-1.5deg)`;
}
// dip to dark between scenes (alpha 0..1)
export function fade(alpha) {
  fadeEl.style.opacity = alpha;
}
export const dip = (t, at, half = 0.22) => 1 - smooth(seg(Math.abs(t - at), 0, half));
