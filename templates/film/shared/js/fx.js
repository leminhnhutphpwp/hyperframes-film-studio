// Cinematic layer over the paper stage: colour grades, light, weather and dust, painted tableaux with parallax,
// letterbox bars and transitions. Everything is drawn from the time t each frame (seek-safe, deterministic).
//
//   fx.grade("night", 1)                         colour grade + vignette (presets below, or an object)
//   fx.particles("embers", t, 1, { n: 60 })      dust | embers | rain | snow | ash | sparks | petals | smoke
//   fx.fog(t, 0.6)                               drifting mist bands
//   fx.glow([x, y], 260, "#ff9a3c", 1, t)       torch / fire / window light (screen blend, flickers)
//   fx.rays(t, 0.5, { from: [300, -100] })      god rays through dust
//   fx.bars(1)                                   2.35:1 letterbox for the big moments
//   fx.tableau(spec, t, a, b)                    a painted close-up in layers (tools/tableau.py) with a camera move
//   fx.transition("ink" | "flash" | "paper" | "burn", u)   u 0→1→0 across a cut (main.js drives TRANSITIONS)
//   fx.shake(camera, t, amp)                     camera jolt for impacts
//   fx.focus(S, amount)                          blur the stage backdrop (close shots: the background goes soft)
import { THREE, rand, clamp01, smooth, lerp, seg, W, H } from "./engine.js";

const $ = (id) => document.getElementById(id);
const stageEl = $("stage"),
  tabEl = $("tableau"),
  gradeEl = $("grade"),
  vigEl = $("vignette"),
  barsEl = $("bars"),
  wipeEl = $("wipe");
const fxc = $("fx").getContext("2d"),
  lightc = $("light").getContext("2d");

// ---------- grades ----------
// filter: CSS filter amounts on the picture (stage + tableau); wash: a colour laid over it with a blend mode
export const GRADES = {
  night: { brightness: 0.8, contrast: 1.1, saturate: 0.72, hue: -10, wash: ["#13204a", "multiply", 0.42], vig: 0.7 },
  dusk: { brightness: 0.95, contrast: 1.1, saturate: 1.15, hue: -6, wash: ["#ff7a35", "soft-light", 0.55], vig: 0.6 },
  dawn: { brightness: 1.02, contrast: 1.04, saturate: 1.05, hue: 4, wash: ["#ffc08a", "soft-light", 0.45], vig: 0.45 },
  storm: { brightness: 0.72, contrast: 1.2, saturate: 0.55, hue: 8, wash: ["#2a3644", "multiply", 0.45], vig: 0.8 },
  fire: { brightness: 0.9, contrast: 1.18, saturate: 1.25, hue: -8, wash: ["#ff4a14", "overlay", 0.35], vig: 0.75 },
  gold: { brightness: 1.04, contrast: 1.08, saturate: 1.15, hue: -4, wash: ["#ffd27a", "soft-light", 0.5], vig: 0.45 },
  cold: { brightness: 0.92, contrast: 1.08, saturate: 0.75, hue: 10, wash: ["#6f95c4", "soft-light", 0.5], vig: 0.6 },
  blood: { brightness: 0.8, contrast: 1.25, saturate: 0.85, hue: -10, wash: ["#7a0a0a", "multiply", 0.4], vig: 0.9 },
  memory: { brightness: 1.0, contrast: 0.95, saturate: 0.6, hue: 0, sepia: 0.55, wash: ["#c9a46a", "multiply", 0.25], vig: 0.7 },
  tense: { brightness: 0.88, contrast: 1.18, saturate: 0.8, hue: 0, wash: ["#3a2a1a", "multiply", 0.25], vig: 0.75 },
};
let gradeState = null;
export function grade(g, alpha = 1) {
  const p = typeof g === "string" ? GRADES[g] : g;
  if (!p || alpha <= 0.001) return;
  const a = clamp01(alpha);
  gradeState = { p, a };
}
function applyGrade() {
  if (!gradeState) {
    stageEl.style.filter = tabEl.style.filter = "";
    gradeEl.style.opacity = 0;
    vigEl.style.opacity = 0;
    return;
  }
  const { p, a } = gradeState;
  const f = `brightness(${lerp(1, p.brightness ?? 1, a)}) contrast(${lerp(1, p.contrast ?? 1, a)}) saturate(${lerp(1, p.saturate ?? 1, a)}) hue-rotate(${(p.hue ?? 0) * a}deg) sepia(${(p.sepia ?? 0) * a})`;
  stageEl.style.filter = tabEl.style.filter = f;
  if (p.wash) {
    gradeEl.style.background = p.wash[0];
    gradeEl.style.mixBlendMode = p.wash[1];
    gradeEl.style.opacity = p.wash[2] * a;
  } else gradeEl.style.opacity = 0;
  vigEl.style.opacity = (p.vig ?? 0.5) * a;
}

// ---------- particles, fog, light ----------
export function particles(kind, t, alpha = 1, { n = 70, seed = 1, wind = 0.3, area = [0, 0, W, H] } = {}) {
  if (alpha <= 0.01) return;
  const [x0, y0, w, h] = area;
  const g = fxc;
  for (let i = 0; i < n; i++) {
    const r1 = rand(seed * 977 + i),
      r2 = rand(seed * 131 + i * 7),
      r3 = rand(seed * 53 + i * 13);
    let x, y, s, a, col;
    if (kind === "dust") {
      const sp = 6 + r3 * 14;
      x = x0 + ((r1 * w + t * sp * (wind * 3 + 0.5) + Math.sin(t * 0.3 + i) * 20) % w + w) % w;
      y = y0 + ((r2 * h - t * sp * 0.4 + Math.cos(t * 0.25 + i * 2) * 18) % h + h) % h;
      s = 1.2 + r3 * 2.8;
      a = 0.25 + 0.45 * (0.5 + 0.5 * Math.sin(t * (0.6 + r3) + i));
      col = "255,236,200";
    } else if (kind === "embers" || kind === "sparks") {
      const life = 3 + r3 * 4,
        u = ((t / life + r1) % 1 + 1) % 1;
      x = x0 + r2 * w + Math.sin(t * 1.3 + i) * 30 * u + wind * 200 * u;
      y = y0 + h - u * h * (kind === "sparks" ? 0.5 : 1.1);
      s = (kind === "sparks" ? 1.5 : 2.2) + r3 * 2.5 * (1 - u);
      a = Math.sin(u * Math.PI) * (0.6 + 0.4 * Math.sin(t * 9 + i));
      col = r3 > 0.5 ? "255,170,70" : "255,110,40";
      g.shadowColor = `rgba(${col},0.9)`;
      g.shadowBlur = 10;
    } else if (kind === "rain") {
      const u = ((t * (1.6 + r3) + r1) % 1 + 1) % 1;
      x = x0 + ((r2 * w + u * 240 * (wind + 0.4)) % w);
      y = y0 + u * (h + 120) - 60;
      g.strokeStyle = `rgba(200,215,235,${0.35 * alpha})`;
      g.lineWidth = 1.4;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x - 14 * (wind + 0.4), y + 46);
      g.stroke();
      continue;
    } else if (kind === "petals") {
      const u = ((t * (0.07 + r3 * 0.05) + r1) % 1 + 1) % 1;
      x = x0 + ((r2 * w + Math.sin(t * 1.1 + i) * 60 + u * 260 * wind) % w + w) % w;
      y = y0 + u * (h + 60) - 30;
      g.save();
      g.translate(x, y);
      g.rotate(t * (1 + r3 * 2) + i);
      g.scale(1, 0.45 + 0.4 * Math.abs(Math.sin(t * 2 + i)));
      g.fillStyle = `rgba(${r3 > 0.4 ? "205,52,70" : "238,150,160"},${0.9 * alpha})`;
      g.beginPath();
      g.ellipse(0, 0, 7 + r3 * 5, 4 + r3 * 3, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
      continue;
    } else if (kind === "smoke") {
      const life = 6 + r3 * 5,
        u = ((t / life + r1) % 1 + 1) % 1,
        cx = x0 + r2 * w + wind * 300 * u,
        cy = y0 + h - u * h * 1.2,
        rr = 60 + u * 220;
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rr);
      gr.addColorStop(0, `rgba(30,24,20,${0.35 * Math.sin(u * Math.PI) * alpha})`);
      gr.addColorStop(1, "rgba(30,24,20,0)");
      g.fillStyle = gr;
      g.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
      continue;
    } else if (kind === "snow" || kind === "ash") {
      const u = ((t * (0.05 + r3 * 0.06) + r1) % 1 + 1) % 1;
      x = x0 + ((r2 * w + Math.sin(t * 0.7 + i) * 40 + u * 300 * wind) % w + w) % w;
      y = y0 + u * (h + 40) - 20;
      s = 1.5 + r3 * 3;
      a = 0.7;
      col = kind === "snow" ? "245,248,255" : "120,110,100";
    }
    g.fillStyle = `rgba(${col},${clamp01(a) * alpha})`;
    g.beginPath();
    g.arc(x, y, s, 0, Math.PI * 2);
    g.fill();
    g.shadowBlur = 0;
  }
}
export function fog(t, alpha = 0.5, { colour = "230,225,215", y = 0.72, bands = 5, seed = 2 } = {}) {
  if (alpha <= 0.01) return;
  for (let i = 0; i < bands; i++) {
    const r = rand(seed * 31 + i),
      cx = ((r * W * 1.6 + t * (18 + r * 25)) % (W * 1.6)) - W * 0.3,
      cy = H * (y + (rand(seed * 7 + i) - 0.5) * 0.25),
      rx = 600 + r * 500;
    const gr = fxc.createRadialGradient(cx, cy, 0, cx, cy, rx);
    gr.addColorStop(0, `rgba(${colour},${0.32 * alpha})`);
    gr.addColorStop(1, `rgba(${colour},0)`);
    fxc.fillStyle = gr;
    fxc.save();
    fxc.translate(cx, cy);
    fxc.scale(1, 0.28);
    fxc.translate(-cx, -cy);
    fxc.fillRect(cx - rx, cy - rx, rx * 2, rx * 2);
    fxc.restore();
  }
}
export function glow([x, y], r, colour = "#ff9a3c", alpha = 1, t = 0, { flicker = 0.12, seed = 0 } = {}) {
  if (alpha <= 0.01) return;
  const f = 1 + flicker * (Math.sin(t * 11 + seed) * 0.5 + Math.sin(t * 17.3 + seed * 2) * 0.3 + Math.sin(t * 5.1) * 0.2);
  const c = new THREE.Color(colour),
    rgb = `${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0}`;
  const gr = lightc.createRadialGradient(x, y, 0, x, y, r * f);
  gr.addColorStop(0, `rgba(${rgb},${0.85 * alpha})`);
  gr.addColorStop(0.35, `rgba(${rgb},${0.35 * alpha})`);
  gr.addColorStop(1, `rgba(${rgb},0)`);
  lightc.fillStyle = gr;
  lightc.fillRect(x - r * 1.3, y - r * 1.3, r * 2.6, r * 2.6);
}
export function rays(t, alpha = 0.5, { from = [300, -150], colour = "255,230,170", n = 7, spread = 0.9, angle = 1.1, seed = 3 } = {}) {
  if (alpha <= 0.01) return;
  const [fx0, fy0] = from;
  for (let i = 0; i < n; i++) {
    const a = angle + (rand(seed + i) - 0.5) * spread,
      wv = 0.04 + rand(seed * 3 + i) * 0.06,
      len = 1900,
      pulse = 0.6 + 0.4 * Math.sin(t * 0.5 + i * 1.7);
    const g = lightc.createLinearGradient(fx0, fy0, fx0 + Math.cos(a) * len, fy0 + Math.sin(a) * len);
    g.addColorStop(0, `rgba(${colour},${0.32 * alpha * pulse})`);
    g.addColorStop(1, `rgba(${colour},0)`);
    lightc.fillStyle = g;
    lightc.beginPath();
    lightc.moveTo(fx0, fy0);
    lightc.lineTo(fx0 + Math.cos(a - wv) * len, fy0 + Math.sin(a - wv) * len);
    lightc.lineTo(fx0 + Math.cos(a + wv) * len, fy0 + Math.sin(a + wv) * len);
    lightc.closePath();
    lightc.fill();
  }
}
export function bars(alpha) {
  barsEl.style.setProperty("--bar", `${(clamp01(alpha) * (H - W / 2.35)) / 2}px`);
}

// ---------- tableaux ----------
// spec: { id, layers: [{ src: "bg.jpg", depth: 0.2 }, { src: "fg.png", depth: 1 }], from: [x, y, zoom], to: [x, y, zoom], ease }
// x, y in fractions of the frame the camera drifts by (front layers move more); zoom 1 = cover. Layers are files in
// assets/tableaux/<id>/ (copied by chapter_build from <project>/tableaux/<id>/).
const tabImgs = {};
let tabShown = false;
function layerImg(key, i) {
  let img = tabImgs[key];
  if (!img) {
    img = tabImgs[key] = document.createElement("img");
    img.src = `assets/tableaux/${key}`;
    img.className = "tab-layer";
    img.style.zIndex = i;
    tabEl.appendChild(img);
  }
  return img;
}
// load every layer the chapter uses up front (window.TABLEAUX from chapter_build), so no frame waits on a picture
(window.TABLEAUX || []).forEach((k, i) => layerImg(k, i));
export function tableau(spec, t, a, b, { fadeIn = 0.6, fadeOut = 0.6 } = {}) {
  const u = (spec.ease || smooth)(seg(t, a, b));
  const [x0, y0, z0] = spec.from || [0, 0, 1.05],
    [x1, y1, z1] = spec.to || [0, 0, 1.15];
  const cx = lerp(x0, x1, u),
    cy = lerp(y0, y1, u),
    z = lerp(z0, z1, u);
  spec.layers.forEach((L, i) => {
    const img = layerImg(`${spec.id}/${L.src}`, i);
    img.style.zIndex = i;
    const d = L.depth ?? 1,
      tx = -cx * d * W,
      ty = -cy * d * H;
    // never show a layer's edge: a 3:2 picture covering 16:9 has spare height only, so the scale grows with the move
    const ch = img.naturalWidth ? (W * img.naturalHeight) / img.naturalWidth : H * 1.185;
    const zz = Math.max(1 + (z - 1) * (0.4 + 0.6 * d) + 0.06 * d, 1 + (2 * Math.abs(tx)) / W + 0.01, (H + 2 * Math.abs(ty)) / ch + 0.01);
    img.style.display = "block";
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${zz})`;
    img.style.opacity = L.opacity ?? 1;
  });
  tabEl.style.opacity = Math.min(smooth(seg(t, a, a + fadeIn)), 1 - smooth(seg(t, b - fadeOut, b)));
  tabEl.dataset.id = spec.id;
  tabShown = true;
}

// ---------- transitions ----------
// ink: blots of dark ink spread from a few points and swallow the frame; burn: the same with a glowing edge;
// paper: a parchment sheet sweeps across; flash: white. u is 0→1 into the cut and 1→0 out of it.
const BLOTS = [[420, 380], [1500, 300], [980, 760], [200, 900], [1700, 880], [960, 120]];
export function transition(kind, u) {
  if (u <= 0.001) return;
  wipeEl.className = `wipe-${kind}`;
  wipeEl.style.setProperty("--u", u.toFixed(4));
  wipeEl.style.opacity = kind === "flash" ? u : 1;
  if (kind === "ink" || kind === "burn") {
    const g = $("wipe-g");
    g.replaceChildren();
    BLOTS.forEach(([x, y], i) => {
      const r = Math.max(0, u * 1250 - i * 70);
      if (r <= 0) return;
      if (kind === "burn") {
        const e = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        Object.entries({ cx: x, cy: y, r: r + 26, fill: "#ff8a2a", opacity: 0.9 }).forEach(([k, v]) => e.setAttribute(k, v));
        g.appendChild(e);
      }
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      Object.entries({ cx: x, cy: y, r, fill: kind === "burn" ? "#140a04" : "#0c0805" }).forEach(([k, v]) => c.setAttribute(k, v));
      g.appendChild(c);
    });
  }
}

// ---------- camera ----------
export function shake(camera, t, amp = 0.05, speed = 23) {
  if (amp <= 0) return;
  camera.position.x += amp * (Math.sin(t * speed) * 0.6 + Math.sin(t * speed * 1.7 + 1) * 0.4);
  camera.position.y += amp * 0.6 * Math.sin(t * speed * 1.3 + 2);
  camera.updateMatrixWorld();
}
export function focus(S, amount) {
  if (!S.bdBlur) return;
  S.bdBlur.material.opacity = clamp01(amount);
  S.bdBlur.visible = amount > 0.01;
}

// a lightning strike: returns 0..1 flash strength for the stage at the strike times (pair with fx.transition("flash"))
export function lightning(t, times, alpha = 1) {
  let f = 0;
  for (const s of times) if (t >= s && t < s + 0.6) f = Math.max(f, (t - s < 0.08 ? 1 : 0.5 * (1 - (t - s) / 0.6)) * (Math.sin((t - s) * 60) > -0.3 ? 1 : 0.4));
  if (f > 0) {
    lightc.fillStyle = `rgba(220,230,255,${0.7 * f * alpha})`;
    lightc.fillRect(0, 0, W, H);
  }
  return f;
}

// ---------- frame bookkeeping (main.js) ----------
export function begin() {
  gradeState = null;
  fxc.clearRect(0, 0, W, H);
  lightc.clearRect(0, 0, W, H);
  tabShown = false;
  bars(0);
  wipeEl.style.opacity = 0;
}
export function finish() {
  applyGrade();
  if (!tabShown) {
    tabEl.style.opacity = 0;
    for (const k in tabImgs) tabImgs[k].style.display = "none";
  } else
    for (const k in tabImgs) if (!k.startsWith(tabEl.dataset.id + "/")) tabImgs[k].style.display = "none";
}
