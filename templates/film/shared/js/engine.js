// Shared engine: renderer, maths helpers, paper cut-out cards, puppets and mounts (ported from templates/battle).
import * as THREE from "three";

export const W = 1920,
  H = 1080;
export const LIB = window.LIB;

// ---------- narration timing (window.LINES: {N: {t, d, vi}} in chapter seconds) ----------
export const LINES = window.LINES;
export const at = (n) => LINES[n].t;
export const end = (n) => LINES[n].t + LINES[n].d;
// when the voice reaches a word: its position in the line's text, scaled to the line's duration
export const cue = (n, word) => {
  const i = LINES[n].vi.indexOf(word);
  if (i < 0) throw new Error(`cue: "${word}" not in line ${n}`);
  return LINES[n].t + (LINES[n].d * i) / LINES[n].vi.length;
};

export const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById("stage"), antialias: true });
renderer.setSize(W, H, false);
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// ---------- maths ----------
export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const smooth = (x) => {
  x = clamp01(x);
  return x * x * (3 - 2 * x);
};
export const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
export const easeIn = (x) => Math.pow(clamp01(x), 2);
export const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const lerp = (a, b, u) => a + (b - a) * u;
export const seg = (t, a, b) => clamp01((t - a) / (b - a));
export function rand(n) {
  n = (n * 374761393 + 668265263) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
export const mixPose = (a, b, w) => {
  const o = {};
  for (const k in a) o[k] = lerp(a[k], k in b ? b[k] : a[k], w);
  return o;
};
// fade in over [a, a+fi], out over [b-fo, b]
export const window01 = (t, a, b, fi = 0.4, fo = 0.4) => smooth(seg(t, a, a + fi)) * (1 - smooth(seg(t, b - fo, b)));

// ---------- textures and cards ----------
const loader = new THREE.TextureLoader();
const texCache = {},
  matCache = {},
  geoCache = {};
export function tex(url) {
  if (!texCache[url]) {
    const t = loader.load(url);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    texCache[url] = t;
  }
  return texCache[url];
}
function partMat(dir, name) {
  const key = dir + "/" + name;
  if (!matCache[key]) {
    const m = new THREE.MeshStandardMaterial({ map: tex(`${dir}/${name}.png`), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 });
    // parts are keyed from a magenta ground: soft edge pixels keep a pink tinge that shows as a thin line at knees and
    // elbows. Pull magenta out of the not-quite-opaque edge only (solid purple cloth inside is left alone).
    m.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace(
        "#include <alphatest_fragment>",
        "if (diffuseColor.a < 0.985) { float mg = min(diffuseColor.r, diffuseColor.b) - diffuseColor.g; if (mg > 0.0) { diffuseColor.r -= mg; diffuseColor.b -= mg; } }\n#include <alphatest_fragment>"
      );
    };
    m.customProgramCacheKey = () => "despill";
    matCache[key] = m;
  }
  return matCache[key];
}
// A plane showing one part at scale k (m/px), translated so the pixel pivot sits at the origin.
export function card(set, name, pivot, k, z = 0) {
  const P = set.parts[name];
  const key = `${set.dir}/${name}/${pivot}/${k}`;
  if (!geoCache[key]) {
    const g = new THREE.PlaneGeometry(P.w * k, P.h * k);
    g.translate(-(pivot[0] - P.w / 2) * k, -(P.h / 2 - pivot[1]) * k, 0);
    geoCache[key] = g;
  }
  const m = new THREE.Mesh(geoCache[key], partMat(set.dir, name));
  m.position.z = z;
  m.castShadow = true;
  return m;
}
// A whole cut-out piece (ship, tower, city) of the given width in metres, pivot as fractions of the image.
export function piece(id, width, fx = 0.5, fy = 1, z = 0) {
  const set = LIB[id],
    P = set.parts.piece;
  return card(set, "piece", [P.w * fx, P.h * fy], width / P.w, z);
}
// One item of a props sheet (a ledger, a coin pile, a bale) as a free-standing piece of the given width.
export function prop(setId, name, width, fx = 0.5, fy = 1, z = 0) {
  const set = LIB[setId],
    P = set.parts[name];
  const m = card(set, name, [P.w * fx, P.h * fy], width / P.w, z);
  m.userData.prop = name; // tools/framecheck.py checks its size
  return m;
}
export const pieceSize = (id, width) => {
  const P = LIB[id].parts.piece;
  return [width, (P.h * width) / P.w];
};
// unlit picture plane (backdrops, sky)
export function picture(url, w, h) {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex(url), toneMapped: false }));
}
export function blobShadow(w, d) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d"),
    gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  gr.addColorStop(0, "rgba(0,0,0,0.45)");
  gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.01;
  return m;
}
export function lights(scene, sunPos = [-8, 14, 12], strength = 2.2) {
  scene.add(new THREE.HemisphereLight(0xdfe6ee, 0x6b5a3c, 1.25));
  const sun = new THREE.DirectionalLight(0xffe6c4, strength);
  sun.position.set(...sunPos);
  scene.add(sun);
  return sun;
}

// ---------- puppets (angles: 0 = down, + = forward) ----------
const kitScale = (kit) => 0.92 / (kit.parts.thigh.h * 0.88 + kit.parts.shin.h);
// opts.hold: how the weapon cell is held — "forward" (swords, tools: default), "staff" (a crook or spear kept upright),
// "hang" (a jar or bag hanging from the hand), "none" (empty hand); opts.len: its length in metres for staff/hang;
// opts.carry: the shield cell held in the far hand as a small object of that size (a ledger, a scroll, a money bag)
const JOINT = 0.07;
const KNEECAP = 0.12; // a kneeling knee rests this share of the thigh's length below the knee joint
// neck fit: pivotUp — the skull base at least this share of the head picture above its bottom; sink — share of the
// neck stump hidden in the torso; extra — metres more (collars, cuirasses that stand above the shoulders)
export const NECK = { pivotUp: 0.1, sink: 0.6, extra: 0.1 };
export function makeFigure(scene, kitId, headSetId, headName, size = 1, opts = {}) {
  // every puppet is recorded (tools/cast_list.py) and, when a drawn version exists (window.CAST from chapter_build,
  // tools/cast_draw.py), the drawn person stands in for it — whatever helper a chapter uses to make its people
  const castKey = `${kitId}|${headSetId || ""}|${headName || ""}`;
  (window.__people ||= []).push([kitId, headSetId, headName, size, opts]);
  const drawn = window.CAST && window.CAST[castKey];
  if (drawn && LIB[drawn] && !opts.puppet) {
    const a = makeAnimPerson(scene, drawn, size);
    a.castKey = castKey;
    a.puppetArgs = [scene, kitId, headSetId, headName, size, Object.assign({}, opts, { puppet: true })]; // rideOn needs a jointed one
    return a;
  }
  const kit = LIB[kitId],
    headSet = headSetId ? LIB[headSetId] : null;
  const P = kit.parts,
    k = kitScale(kit) * size;
  // joints: each piece pivots a little inside its top end (JOINT of its height), so a bent joint shows overlap, not a gap
  const J = (n) => P[n].h * JOINT;
  const L = { toe: (P.shin.w - P.shin.top[0]) * k, upper: (P.upper.h * 0.86 - J("fore")) * k, fore: P.fore.h * 0.82 * k, thigh: (P.thigh.h * 0.88 - J("shin")) * k, shin: (P.shin.bottom[1] - J("shin")) * k, sole: (P.shin.h - P.shin.bottom[1]) * k };
  const root = new THREE.Group(),
    fall = new THREE.Group(),
    hip = new THREE.Group(),
    torso = new THREE.Group();
  root.userData.figure = kitId; // tools/framecheck.py looks for these
  root.add(fall);
  fall.add(hip);
  hip.add(torso);
  const T = P.torso;
  const hipPx = [(T.top[0] + T.bottom[0]) / 2, T.h * 0.7];
  torso.add(card(kit, "torso", hipPx, k, 0));
  const toLocal = (px) => [(px[0] - hipPx[0]) * k, (hipPx[1] - px[1]) * k];
  // head: it turns at the skull base (HP.neck, measured on the picture by tools/asset.py repivot), not at the bottom
  // of the neck stump — a low pivot swings the whole head off the collar when it nods. The stump sinks into the
  // torso's neck socket by a share of its own length, so long and short necks both meet the collar.
  const head = new THREE.Group();
  const HS = headSet || kit,
    HN = headSet ? headName : "head",
    HP = HS.parts[HN];
  let hk = k;
  if (headSet) {
    const hs = Object.values(headSet.parts)
      .map((p) => p.h)
      .sort((a, b) => a - b);
    hk = (P.head.h * k) / hs[hs.length >> 1];
  }
  const socket = toLocal(T.neckSocket || T.top);
  let pivot = HP.bottom,
    lift = -0.09 * size;
  if (HP.neck) {
    const skullBase = Math.min(HP.neck[1], HP.h * (1 - NECK.pivotUp));
    pivot = [HP.neck[0], skullBase];
    // the stump's bottom sits NECK.sink of its length below the socket; the pivot is that far plus the stump above it
    lift = -(NECK.sink * HP.neckLen * hk + NECK.extra * size) + (HP.h - skullBase) * hk;
  }
  head.position.set(socket[0], socket[1] + lift, 0);
  head.add(card(HS, HN, pivot, hk, -0.006));
  torso.add(head);
  function limb(parent, at, up, lo, upLen, loLen, z) {
    const a = new THREE.Group();
    a.position.set(at[0], at[1], z);
    a.add(card(kit, up, [P[up].top[0], J(up)], k, 0.002));
    const b = new THREE.Group();
    b.position.y = -upLen;
    b.add(card(kit, lo, [P[lo].top[0], J(lo)], k, 0));
    a.add(b);
    const end = new THREE.Group();
    end.position.y = -loLen;
    b.add(end);
    parent.add(a);
    return { a, b, end };
  }
  const sh = toLocal(T.shoulder);
  const f = {
    kit,
    root,
    fall,
    hip,
    torso,
    head,
    L,
    k,
    shY: sh[1],
    armL: limb(torso, [sh[0] - 0.02, sh[1]], "upper", "fore", L.upper, L.fore, -0.06),
    armR: limb(torso, sh, "upper", "fore", L.upper, L.fore, 0.035),
    legL: limb(hip, [0.02, 0], "thigh", "shin", L.thigh, L.shin, -0.03),
    legR: limb(hip, [-0.02, 0], "thigh", "shin", L.thigh, L.shin, -0.02),
  };
  // opts.gown: a floor-length gown drawn on the torso piece — hide the legs and stand the hem on the floor
  if (opts.gown) {
    f.legL.a.visible = f.legR.a.visible = false;
    f.gownY = (T.h - hipPx[1]) * k;
  }
  equip(f, opts);
  f.castKey = castKey;
  scene.add(root);
  return f;
}
function equip(f, opts = {}) {
  const kit = f.kit,
    P = kit.parts,
    k = f.k;
  const g = new THREE.Group();
  if (opts.hold === "none") {
    // empty hand
  } else if (opts.hold === "staff" || opts.hold === "hang") {
    // kept world-vertical by applyPose (f.pole): a crook upright beside the body, a jar hanging below the fist
    const len = opts.len || (opts.hold === "staff" ? 1.55 : 0.45);
    g.add(card(kit, "weapon", [P.weapon.w / 2, P.weapon.h * (opts.hold === "staff" ? 0.42 : 0.04)], len / P.weapon.h, 0.004));
    f.armR.end.add(g);
    f.pole = g;
    if (opts.hold === "staff") f.poleBelow = len * 0.58; // a staff rests its foot on the ground (applyPose)
  } else if (kit.weapon === "polearm" || kit.weapon === "musket") {
    const len = kit.weapon === "musket" ? 1.65 : 2.5;
    g.add(card(kit, "weapon", [P.weapon.w / 2, P.weapon.h * 0.6], len / P.weapon.h, 0.004));
    f.armR.end.add(g);
    f.pole = g;
    f.poleBelow = len * 0.4;
  } else {
    // swords, mallets: held forward from the fist
    g.add(card(kit, "weapon", [P.weapon.w / 2, P.weapon.h * 0.9], k * 1.15, 0.004));
    g.rotation.z = -Math.PI / 2 + 0.15;
    f.armR.end.add(g);
  }
  // opts.carry: hold the shield cell (a ledger, a scroll, a money bag…) as a small object of that size in metres
  if (!opts.carry && (kit.role === "dan-thuong" || opts.noShield || kit.weapon === "musket")) return; // workers carry no shield (the shield cell holds a basket, rope…)
  const s = new THREE.Group();
  const sk = opts.carry ? opts.carry / Math.max(P.shield.h, P.shield.w) : Math.min(0.98, 0.78 * Math.max(1, P.shield.h / P.shield.w)) / P.shield.h;
  s.add(card(kit, "shield", [P.shield.w / 2, P.shield.h / 2], sk, -0.01));
  f.armL.end.add(s);
  f.shield = s;
}
// sitting (p.sit): the root is at seat height above the ground; bend the legs so the feet rest on the ground —
// shins slant forward on a low stool, hang straight on a chair, the thighs tip down on a high seat, and on a throne
// too high to reach the feet simply hang.
function seatLegs(f, p) {
  const L = f.L,
    h = Math.max(0, (p.seatH ?? f.root.position.y) - (p.lift || 0)); // seat height above the ground
  const out = {};
  for (const [a, b] of [["lL1", "lL2"], ["lR1", "lR2"]]) {
    let a1 = p[a];
    const lower = L.shin + L.sole;
    let knee = h - L.thigh * Math.cos(a1); // knee height above the ground
    if (knee > lower) {
      // seat high for this leg: tip the thigh down until the foot reaches the ground (or the thigh hangs)
      a1 = Math.acos(Math.min(1, Math.max(0, (h - lower) / L.thigh)));
      knee = h - L.thigh * Math.cos(a1);
    }
    const c = knee >= lower ? 0 : Math.acos(Math.min(1, Math.max(-1, (knee - L.sole) / L.shin)));
    out[a] = a1;
    out[b] = c - a1;
  }
  return Object.assign({}, p, out);
}
// kneeling (p.kneel): the front leg (left, nearer the camera's far side) keeps its angles and sets the hip height;
// the back leg is solved so its knee rests on the ground and its toes just touch behind — both feet planted
function kneelLegs(f, p) {
  const L = f.L,
    hipH = L.thigh * Math.cos(p.lL1) + (L.shin + L.sole) * Math.cos(p.lL1 + p.lL2);
  const kc = KNEECAP * L.thigh;
  const a = -Math.acos(Math.min(1, Math.max(-1, (hipH - kc) / L.thigh))); // back thigh down-and-back to the ground
  const knee = L.thigh * Math.cos(a);
  // back shin: from straight back (−π/2) tip further back until the toes reach the ground
  const need = hipH - knee;
  let lo = -Math.PI / 2 - 0.9,
    hi = -Math.PI / 2 + 0.3;
  const depth = (c) => L.shin * Math.cos(c) - L.toe * Math.sin(c);
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (depth(mid) > need) hi = mid;
    else lo = mid;
  }
  return Object.assign({}, p, { lR1: a, lR2: (lo + hi) / 2 - a });
}
// riding (a figure on f.mount, set by stage.js rideOn): the legs reach the stirrup — or, on a saddle pad without
// stirrups and on a horse, hang down along the flank. Two-bone solve in the hip's space; the knee bends forward.
const _t = new THREE.Vector3();
function rideLegs(f, p) {
  const m = f.mount,
    L = f.L;
  if (m.type !== "horse") return p;
  m.root.updateMatrixWorld(true);
  f.root.updateMatrixWorld(true);
  let tx, ty;
  if (m.stirrup) {
    m.stirrup.getWorldPosition(_t);
    f.hip.worldToLocal(_t);
    tx = _t.x;
    ty = _t.y;
  } else {
    tx = 0.1;
    ty = -0.86 * (L.thigh + L.shin + L.sole);
  }
  const L1 = L.thigh,
    L2 = L.shin + L.sole;
  const d = Math.min(Math.hypot(tx, ty), L1 + L2 - 1e-4);
  const phi = Math.atan2(tx, -ty);
  const alpha = Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
  const a1 = phi + alpha;
  const kx = L1 * Math.sin(a1),
    ky = -L1 * Math.cos(a1);
  const c = Math.atan2(tx - kx, -(ty - ky));
  return Object.assign({}, p, { lL1: a1, lL2: c - a1, lR1: a1 + 0.06, lR2: c - a1 - 0.04 });
}
// a drawn person standing in for a puppet (people.js person + window.CAST): the jointed pose picks a drawing
function animPose(f, p) {
  const n = poseKind(p);
  if (n === "walk") {
    // recover the stride phase from the gait's leg angles: sin from the swing, cos from which knee is bent
    const s = Math.max(-1, Math.min(1, ((p.lL1 || 0) - (p.lR1 || 0)) / 1.6 / 0.42));
    const c = Math.sqrt(1 - s * s) * ((p.lL2 || 0) <= (p.lR2 || 0) ? 1 : -1);
    poseAnimPerson(f, "walk", Math.atan2(s, c) / (2 * Math.PI) + 1);
    f.body.position.y = 0;
    return;
  }
  poseAnimPerson(f, n);
  // the sitting drawing has its own stool on the ground: undo the seat height the scene gave the root
  f.body.position.y = n === "act3" ? -f.root.position.y : 0;
}
// which drawing a jointed pose would need (tools/cast_list.py records it per puppet)
export function poseKind(p) {
  if ((p.fall || 0) > 0.6) return "act5";
  // a gait pose (engine gait()): the legs swing in opposite directions
  if (!p.sit && !p.seat && !p.kneel && Math.abs((p.lL1 || 0) - (p.lR1 || 0)) > 0.25) return "walk";
  if (p.sit || p.seat) return "act3";
  if (p.kneel) return "act4";
  if ((p.aR1 || 0) > 2.0 || (p.aL1 || 0) > 2.0) return "act2";
  if ((p.aR1 || 0) > 0.95) return "act1";
  return "master";
}
export function applyPose(f, p, tilt = 0) {
  if (f.anim) return animPose(f, p);
  if (f.castKey && window.__poses) (window.__poses[f.castKey] ||= {})[poseKind(p)] = 1;
  const L = f.L;
  if (f.mount && p.seat && !p.sit && !p.freeLegs) p = rideLegs(f, p);
  if (p.sit && f.gownY == null && (p.seatH ?? f.root.position.y) > 0.15) p = seatLegs(f, p);
  if (p.kneel && f.gownY == null) p = kneelLegs(f, p);
  // how far below the hip each leg reaches: the foot's sole (it turns with the shin) or the knee cap when kneeling
  // (the foot is drawn on the shin piece, pointing forward: when the shin lies back along the ground, as in a kneel,
  // its toes point down — count them too)
  const fh = (a, b) => {
    const c = a + b,
      knee = L.thigh * Math.cos(a);
    return Math.max(knee + (L.shin + L.sole) * Math.cos(c), knee + L.shin * Math.cos(c) - L.toe * Math.sin(c), knee + KNEECAP * L.thigh);
  };
  // standing/kneeling: the hip rides on whatever touches the ground first; seated (p.seat): it sits at the root
  f.hip.position.y = f.gownY != null ? f.gownY + (p.lift || 0) : p.seat ? p.lift || 0 : Math.max(fh(p.lL1, p.lL2), fh(p.lR1, p.lR2)) + (p.lift || 0);
  // seated, kneeling or in a howdah, a soldier sets his shield down (it would stick through the floor or out of the
  // howdah); p.keepShield keeps it
  if (f.shield) f.shield.visible = !((p.sit || p.kneel || (f.mount && f.mount.type === "elephant")) && !p.keepShield);
  f.torso.rotation.z = -p.lean;
  f.head.rotation.z = -(p.tilt || 0);
  f.armL.a.rotation.z = p.aL1 + p.lean;
  f.armL.b.rotation.z = p.aL2;
  // an upright spear or musket in a hanging hand would run straight up across the face: hold it a little forward
  let aR1 = p.aR1,
    aR2 = p.aR2;
  if (f.poleBelow && !p.fall && aR1 < 0.45) {
    aR1 = Math.max(aR1, 0.4);
    aR2 = Math.max(aR2, 0.55);
  }
  f.armR.a.rotation.z = aR1 + p.lean;
  f.armR.b.rotation.z = aR2;
  f.legL.a.rotation.z = p.lL1;
  f.legL.b.rotation.z = p.lL2;
  f.legR.a.rotation.z = p.lR1;
  f.legR.b.rotation.z = p.lR2;
  f.fall.rotation.z = p.fall || 0;
  if (f.pole) {
    f.pole.rotation.z = -(aR1 + aR2) - tilt;
    groundPole(f, p);
  }
  if (f.shield) f.shield.rotation.z = -(p.aL1 + p.aL2);
}
// a spear, musket or staff held upright never goes through the floor: if its foot would sink below the ground, it
// slides up through the fist until the foot rests on the ground (by the rider's foot on horseback; not when falling)
const _v = new THREE.Vector3(),
  _s = new THREE.Vector3();
function groundPole(f, p) {
  const m = f.pole.children[0];
  m.position.y = 0;
  if (!f.poleBelow || p.fall || !f.root.parent) return;
  f.root.updateMatrixWorld(true);
  const riding = p.seat && !p.sit;
  // on horseback the butt rests by the rider's foot (a stirrup cup), not on the ground under the horse
  const ground = riding ? f.legR.b.getWorldPosition(_v).y - f.L.shin * 0.9 : f.root.getWorldPosition(_v).y - (p.sit ? (p.seatH ?? f.root.position.y) : 0);
  f.pole.getWorldScale(_s);
  const foot = f.armR.end.getWorldPosition(_v).y - f.poleBelow * Math.abs(_s.y);
  if (foot < ground) m.position.y = (ground - foot) / Math.abs(_s.y);
}
export const IDLE = { lean: 0.03, tilt: 0, aL1: 0.3, aL2: 0.3, aR1: 0.05, aR2: 0.25, lL1: 0.12, lL2: 0, lR1: -0.12, lR2: 0, lift: 0, fall: 0 };
export function gait(dist, amp) {
  const ph = (2 * Math.PI * dist) / 1.55,
    s = Math.sin(ph),
    c = Math.cos(ph);
  return { lL1: 0.08 + 0.8 * amp * s, lL2: -0.15 - 1.3 * amp * Math.max(0, c), lR1: 0.08 - 0.8 * amp * s, lR2: -0.15 - 1.3 * amp * Math.max(0, -c), lean: 0.05 + 0.28 * amp, lift: 0.05 * amp * Math.abs(c) };
}
export const pickFace = (setId, seed) => {
  const names = Object.keys(LIB[setId].parts);
  return names[Math.floor(rand(seed) * names.length)];
};

// ---------- mounts ----------
const MOUNT = {
  horse: {
    size: { body: ["w", 1.75], head: ["h", 1.05], "front-upper": ["h", 0.8], "front-lower": ["h", 0.62], "hind-upper": ["h", 0.84], "hind-lower": ["h", 0.6], tail: ["h", 0.85], saddle: ["w", 0.95] },
    front: [0.8, 0.32],
    hind: [0.2, 0.3],
    neck: [0.9, 0.22],
    tail: [0.03, 0.12],
    seat: [0.53, 0.02],
    headPivot: [0.28, 0.86],
    saddleAt: 0.2,
    seatAt: 0.1,
    swing: [0.4, 0.8],
    stride: 2.2,
    gaitOffsets: { hf: 0, hn: 0.5, ff: 0.25, fn: 0.75 }, // a walk: four separate footfalls
  },
  elephant: {
    // a real elephant: legs below the belly ≈ 45 % of the shoulder height. The body pictures are drawn deep, so the
    // barrel is kept short and the legs long; the legs hang from the belly line (body.underline), tops hidden behind it
    size: { body: ["w", 2.55], head: ["h", 1.8], "front-upper": ["h", 1.38], "front-lower": ["h", 1.15], "hind-upper": ["h", 1.38], "hind-lower": ["h", 1.15], tail: ["h", 0.9], saddle: ["w", 1.9] },
    front: [0.76, 0.5],
    hind: [0.22, 0.5],
    hang: 0.42, // share of the upper leg piece tucked up behind the body above the belly line
    legsBehind: true,
    neck: [0.93, 0.3],
    tail: [0.03, 0.2],
    seat: [0.5, 0.04],
    headPivot: [0.14, 0.32],
    saddleAt: 0.36,
    seatAt: 0.28,
    swing: [0.3, 0.35],
    stride: 2.4,
    gaitOffsets: { hn: 0, fn: 0.25, hf: 0.5, ff: 0.75 },
  },
};
export function makeMount(scene, id, scale = 1) {
  const set = LIB[id],
    M = MOUNT[set.type],
    P = set.parts;
  const kOf = (n) => (M.size[n][1] / P[n][M.size[n][0]]) * scale;
  const B = P.body,
    kb = kOf("body");
  const at = (f) => [(f[0] - 0.5) * B.w * kb, (0.5 - f[1]) * B.h * kb];
  // where a leg hangs from: on the belly line when it is measured (M.hang), else the fixed point in M.front / M.hind
  const belly = (fx) => {
    const u = B.underline;
    const i = Math.min(19, Math.floor(fx * 20)),
      r = fx * 20 - i;
    return u[i] * (1 - r) + u[i + 1] * r;
  };
  const anchor = (f, up) => (M.hang && B.underline ? [f[0], belly(f[0]) - (M.hang * P[up].h * kOf(up)) / (B.h * kb)] : f);
  const FRONT = anchor(M.front, "front-upper"),
    HIND = anchor(M.hind, "hind-upper");
  const root = new THREE.Group(),
    lift = new THREE.Group(),
    body = new THREE.Group();
  root.add(lift);
  lift.add(body);
  body.add(card(set, "body", [B.w / 2, B.h / 2], kb, 0));
  // leg pieces pivot inside their top ends (UP / LO of their height); a leg's reach is hip pivot → hoof
  const UP = 0.1,
    LO = 0.08;
  const knee = (up, lo) => P[up].h * kOf(up) * (0.88 - UP) - P[lo].h * kOf(lo) * LO;
  const reach = (up, lo) => knee(up, lo) + P[lo].h * kOf(lo);
  const bodyY = reach("front-upper", "front-lower") - at(FRONT)[1];
  const hindK = (bodyY + at(HIND)[1]) / reach("hind-upper", "hind-lower");
  function leg(end, up, lo, s, z, dark) {
    const a = new THREE.Group(),
      b = new THREE.Group();
    const [x, y] = at(end);
    a.position.set(x + (dark ? -0.06 * scale : 0), y, z);
    const cu = card(set, up, [P[up].top[0], P[up].h * UP], kOf(up) * s, 0.002),
      cl = card(set, lo, [P[lo].top[0], P[lo].h * LO], kOf(lo) * s, 0);
    if (dark) for (const m of [cu, cl]) (m.material = m.material.clone()).color.setHex(0x8f8a80);
    a.add(cu);
    // the lower piece hangs from the upper piece's lower end — the middle of its bottom, which on a curved shoulder
    // or thigh is not straight below the middle of its top (a straight drop made the leg zigzag at the knee)
    b.position.x = (P[up].bottom[0] - P[up].top[0]) * kOf(up) * s;
    b.position.y = -knee(up, lo) * s;
    b.add(cl);
    a.add(b);
    body.add(a);
    // hip → knee and knee → hoof lengths, for keeping a hoof on the ground in poseMount
    return { a, b, lu: knee(up, lo) * s, ll: P[lo].h * kOf(lo) * s * (1 - LO) };
  }
  // horses: near legs in front of the barrel (their upper pieces carry the shoulder and thigh muscle of the
  // silhouette); elephants (M.legsBehind): every leg behind the body, whose picture already has the shoulder and thigh
  const nearZ = M.legsBehind ? -0.025 * scale : 0.05 * scale;
  const legs = {
    ff: leg(FRONT, "front-upper", "front-lower", 1, -0.07 * scale, true),
    hf: leg(HIND, "hind-upper", "hind-lower", hindK, -0.07 * scale, true),
    fn: leg(FRONT, "front-upper", "front-lower", 1, nearZ),
    hn: leg(HIND, "hind-upper", "hind-lower", hindK, nearZ),
  };
  const head = new THREE.Group();
  head.position.set(...at(M.neck), 0.03 * scale);
  head.add(card(set, "head", [P.head.w * M.headPivot[0], P.head.h * M.headPivot[1]], kOf("head"), 0));
  body.add(head);
  const tail = new THREE.Group();
  tail.position.set(...at(M.tail), -0.03 * scale);
  tail.add(card(set, "tail", P.tail.top, kOf("tail"), 0));
  body.add(tail);
  const [sx, sy] = at(M.seat);
  const saddle = card(set, "saddle", [P.saddle.w / 2, P.saddle.h * M.saddleAt], kOf("saddle"), 0.08 * scale);
  saddle.position.set(sx, sy, 0.08 * scale);
  body.add(saddle);
  // where a rider's hips go (a figure posed with SEATED is added to this group)
  const seat = new THREE.Group();
  if (set.type === "horse") seat.position.set(sx - 0.12 * scale, sy - 0.05 * scale, 0.14 * scale); // sit down into the back, mid-saddle
  // on the howdah floor, behind its front rail (z between the body and the howdah): legs out of sight, chest above the rail
  else {
    // raised so a seated rider's chest clears the rail — but under a canopy (P.saddle.roof) the head stays below it
    const ks = kOf("saddle"),
      floor = sy + (M.saddleAt - M.seatAt) * P.saddle.h * ks;
    let raise = 0.22 * scale;
    if (P.saddle.roof != null) raise = Math.min(raise, sy + (P.saddle.h * M.saddleAt - P.saddle.roof) * ks - floor - 0.8 * scale);
    seat.position.set(sx, floor + raise, 0.01 * scale);
  }
  body.add(seat);
  // the near stirrup's tread (measured on the saddle picture by tools/asset.py repivot); none on ancient pads
  let stirrup = null;
  if (P.saddle.stirrup) {
    const ks = kOf("saddle");
    stirrup = new THREE.Group();
    stirrup.position.set(sx + (P.saddle.stirrup[0] - P.saddle.w / 2) * ks, sy + (P.saddle.h * M.saddleAt - P.saddle.stirrup[1]) * ks, 0);
    body.add(stirrup);
  }
  body.position.y = bodyY;
  scene.add(root);
  return { root, lift, body, head, tail, legs, seat, stirrup, M, bodyY, scale, type: set.type };
}
// ---------- drawn animals (replacement animation: tools/anim_frames.py) ----------
// The whole animal is one picture per frame — drawn, not jointed — so legs are always right. LIB[id]: {dir, frames
// (frames.json), saddle: {dir, part}} from library/anims/<id> (+ the saddle of library/mounts/<id>). The saddle or
// howdah rides the back line of the current frame; a rider sits on it (stage.js rideOn) with feet in the stirrups.
const ANIM = {
  horse: { seatAt: 0.5, saddleW: 0.95, saddleAt: 0.2, back: -0.05, z: 0.14 },
  elephant: { seatAt: 0.47, saddleW: 1.9, saddleAt: 0.36, seatAt2: 0.28, z: 0.01 },
};
export function makeAnimMount(scene, id, scale = 1) {
  const set = LIB[id],
    F = set.frames,
    A = ANIM[F.type];
  const k = F.mPerPx * scale;
  const root = new THREE.Group(),
    lift = new THREE.Group();
  root.add(lift);
  const geo = new THREE.PlaneGeometry(F.w * k, F.h * k);
  geo.translate(0, (F.ground - F.h / 2) * k, 0); // the ground line of the drawings at the root
  const texs = {};
  for (const n in F.frames) texs[n] = tex(`${set.dir}/${n}.png`);
  const mat = new THREE.MeshStandardMaterial({ map: texs.master, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 });
  const body = new THREE.Mesh(geo, mat);
  body.castShadow = true;
  lift.add(body);
  const sh = blobShadow((F.frames.master.x1 - F.frames.master.x0) * k * 0.8, 0.9 * scale);
  root.add(sh);
  // saddle / howdah and the rider's seat follow the back line
  const back = new THREE.Group();
  lift.add(back);
  let seat = new THREE.Group(),
    stirrup = null;
  if (set.saddle) {
    const S = set.saddle.part,
      ks = (A.saddleW * scale) / S.w;
    const sset = { dir: set.saddle.dir, parts: { saddle: S } };
    back.add(card(sset, "saddle", [S.w / 2, S.h * A.saddleAt], ks, 0.08 * scale));
    if (F.type === "horse") seat.position.set(-0.12 * scale, A.back * scale, A.z * scale);
    else {
      const floor = (A.saddleAt - A.seatAt2) * S.h * ks;
      let raise = 0.22 * scale;
      if (S.roof != null) raise = Math.min(raise, (S.h * A.saddleAt - S.roof) * ks - floor - 0.8 * scale);
      seat.position.set(0, floor + raise, A.z * scale);
    }
    if (S.stirrup) {
      stirrup = new THREE.Group();
      stirrup.position.set((S.stirrup[0] - S.w / 2) * ks, (S.h * A.saddleAt - S.stirrup[1]) * ks, 0);
      back.add(stirrup);
    }
  }
  back.add(seat);
  scene.add(root);
  const m = { root, lift, body, back, seat, stirrup, type: F.type, scale, set, texs, k, anim: true };
  setFrame(m, "master");
  return m;
}
function setFrame(m, name) {
  const F = m.set.frames,
    fr = F.frames[name],
    A = ANIM[F.type];
  m.body.material.map = m.texs[name];
  // the back line at the saddle's place along the animal (tail → head), in metres above the ground
  const u = A.seatAt * 20,
    i = Math.min(19, Math.floor(u)),
    r = u - i;
  const by = fr.back[i] * (1 - r) + fr.back[i + 1] * r;
  const bx = fr.x0 + (fr.x1 - fr.x0) * A.seatAt;
  m.back.position.set((bx - F.w / 2) * m.k, (F.ground - by) * m.k, 0);
  // tilt with the back between the points around the seat
  const dy = fr.back[Math.min(20, i + 2)] - fr.back[Math.max(0, i - 2)],
    dx = ((fr.x1 - fr.x0) * 4) / 20;
  m.back.rotation.z = Math.atan2(-dy, dx) * 0.6;
  m.frame = name;
}
// a drawn person (tools/anim_frames.py, type "person"): one picture per pose — "master" (standing), the walk cycle,
// and act1… (raised arm, pointing, sitting, kneeling, bowing, fallen — whatever anim.json listed). No joints to slip.
//   const p = makeAnimPerson(scene, "tuong-la-ma@anim");  p.root.position.set(x, 0, z);
//   poseAnimPerson(p, "walk", strides) | poseAnimPerson(p, "act3") | poseAnimPerson(p, "master");  p.root.scale.x = ±1
export function makeAnimPerson(scene, id, scale = 1) {
  const set = LIB[id],
    F = set.frames,
    k = F.mPerPx * scale;
  const root = new THREE.Group();
  const geo = new THREE.PlaneGeometry(F.w * k, F.h * k);
  geo.translate(0, (F.ground - F.h / 2) * k, 0);
  const texs = {};
  for (const n in F.frames) texs[n] = tex(`${set.dir}/${n}.png`);
  const body = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: texs.master, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 }));
  body.castShadow = true;
  root.add(body);
  root.add(blobShadow(0.9 * scale, 0.5 * scale));
  root.userData.figure = id;
  scene.add(root);
  return { root, body, texs, set, frame: "master", anim: true };
}
export function poseAnimPerson(p, name, ph = 0) {
  const C = p.set.frames.cycles[name];
  const n = C ? C[((Math.floor(ph * C.length) % C.length) + C.length) % C.length] : p.texs[name] ? name : "master";
  p.body.material.map = p.texs[n];
  p.frame = n;
}

// play a cycle: "stand" (the master drawing), "walk" or "gallop"; ph counts strides (1 = a full cycle)
export function poseAnimMount(m, cycle, ph) {
  const C = m.set.frames.cycles[cycle];
  if (!C) return setFrame(m, "master");
  const n = C.length;
  setFrame(m, C[((Math.floor(ph * n) % n) + n) % n]);
}

export function poseMount(m, ph, amp, t, seed = 0) {
  const [A, Bk] = m.M.swing;
  const offs = m.M.gaitOffsets;
  for (const k in offs) {
    const s = 2 * Math.PI * (ph + offs[k]);
    m.legs[k].a.rotation.z = amp * A * Math.sin(s);
    m.legs[k].b.rotation.z = (k[0] === "f" ? -1 : 1) * amp * Bk * Math.max(0, Math.cos(s));
  }
  const c = 2 * Math.PI * ph;
  // keep the lowest hoof on the ground whatever the legs are doing (a swung leg is shorter in height, which used to
  // leave the animal floating mid-stride); only a gallop (amp > 1) leaves the ground, in its suspension phase
  let low = Infinity;
  for (const k in m.legs) {
    const L = m.legs[k],
      ra = L.a.rotation.z,
      rb = L.b.rotation.z;
    low = Math.min(low, m.bodyY + L.a.position.y - L.lu * Math.cos(ra) - L.ll * Math.cos(ra + rb));
  }
  m.lift.position.y = -low + (amp > 1 ? 0.08 * (amp - 1) * Math.max(0, Math.sin(c * 2)) : 0);
  m.head.rotation.z = 0.05 * amp * Math.sin(c + 1) + 0.04 * Math.sin(t * 1.4 + seed);
  m.tail.rotation.z = -0.15 + 0.12 * Math.sin(t * 2.6 + seed);
}

export { THREE };
