// Chapter 10 · Ngày Ides tháng Ba (lines 74–86). Chapter seconds; the killing is shown only as daggers raised and a fall to dark.
import { seg, smooth, easeIn, lerp, window01, piece, prop, applyPose, at, end, cue } from "../shared/js/engine.js";
import * as ov from "../shared/js/overlay.js";
import * as fx from "../shared/js/fx.js";
import { stage, look, place, shadowUnder } from "../shared/js/stage.js";
import { cast, person, stand, walk, tag, pose } from "../shared/js/people.js";
import { CAST } from "../shared/js/cast.js";

// 1 · the Forum: Caesar sends his bodyguard away
const S1 = stage("quang-truong-rome");
const caesar1 = cast(S1.scene, CAST.caesarToga);
const guards = [0, 1, 2].map(() => person(S1.scene, "linh-hau-ve@red", null, null));
function guards44(t) {
  const u = smooth(seg(t, 0, end(75)));
  const push = smooth(seg(t, cue(74, "giải tán") - 1.5, end(75)));
  look(S1.camera, [lerp(lerp(-0.6, 0.6, u), -0.5, push), lerp(1.9, 1.75, push), lerp(8.4, 4.6, push)], [lerp(lerp(-0.6, 0.6, u), -0.6, push), lerp(1.4, 1.55, push), 0]);
  fx.focus(S1, push * 0.9);
  fx.grade("gold", 1);
  fx.rays(t, 0.55, { from: [-200, -200], angle: 0.75 });
  fx.particles("dust", t, 0.8, { n: 60 });
  stand(caesar1, t, -0.8, 0.6, 1, 0, { aR1: 1.2 * window01(t, cue(74, "giải tán") - 0.4, cue(74, "giải tán") + 1.2, 0.3, 0.4), aR2: 0.2 });
  guards.forEach((f, i) => {
    if (t < cue(74, "giải tán")) stand(f, t, 0.6 + i * 0.7, 0.3 + (i % 2) * 0.4, -1, i + 1);
    else walk(f, t, 0.6 + i * 0.7, 6 + i, 0.3 + (i % 2) * 0.4, cue(74, "giải tán"), cue(74, "giải tán") + 3);
  });
  ov.note("Theo Suetonius", "ông giải tán đội vệ sĩ\nmà Viện Nguyên lão cấp cho", window01(t, cue(74, "Suetonius") - 0.2, end(74) + 0.3, 0.4, 0.4));
  ov.caption("bị sợ cũng chẳng an toàn hơn được yêu", [960, 170], window01(t, at(75) - 0.1, end(75) + 0.4, 0.35, 0.4), { size: 42 });
  return S1;
}

// 2 · the plotters at night: Brutus and Cassius, men he had pardoned
const S2 = stage("atrium-la-ma");
const brutus = cast(S2.scene, CAST.brutus);
const cassius = cast(S2.scene, CAST.cassius);
const others = ["head3", "head6", "head8"].map((h) => cast(S2.scene, CAST.senator(h)));
function plot(t) {
  const u = smooth(seg(t, at(76) - 0.3, end(77) + 0.3));
  look(S2.camera, [lerp(-0.4, 0.4, u), 1.85, 7.8], [lerp(-0.4, 0.4, u), 1.35, 0]);
  fx.grade("night", 1);
  // braziers just outside the frame: warm light spilling in from both sides, flickering
  fx.glow([-160, 760], 1050, "#ff8a30", 0.9, t);
  fx.glow([2080, 720], 900, "#ff7a28", 0.75, t, { seed: 3 });
  fx.particles("embers", t, 0.4, { n: 14, area: [0, 500, 260, 580] });
  fx.particles("embers", t, 0.35, { n: 12, area: [1680, 500, 240, 580], seed: 4 });
  fx.bars(smooth(seg(t, at(76) - 0.3, at(76) + 1)));
  stand(brutus, t, -0.7, 0.6, 1, 0, { lean: 0.1 });
  stand(cassius, t, 0.7, 0.6, -1, 1, { lean: 0.1, aR1: 0.8, aR2: 0.4 });
  others.forEach((f, i) => stand(f, t, [-2.4, 2.2, 3.0][i], 0.1 + i * 0.3, i ? -1 : 1, i + 2, { lean: 0.08 }));
  tag(S2.camera, "Brutus", -0.7, 2.3, 0.6, window01(t, cue(76, "Brutus") - 0.3, end(77) + 0.3, 0.4, 0.4), 42, "#3b2a18");
  tag(S2.camera, "Cassius", 0.7, 2.3, 0.6, window01(t, cue(76, "Cassius") - 0.3, end(76) + 0.4, 0.4, 0.4), 42, "#3b2a18");
  ov.caption("hơn 60 nghị viên — những người ông từng tha thứ", [960, 170], window01(t, at(76) - 0.1, end(76) + 0.2, 0.35, 0.4), { size: 40 });
  ov.note("Brutus là con Caesar?", "gần như chắc chắn sai —\nCaesar chỉ hơn Brutus mười lăm tuổi", window01(t, cue(77, "Có chuyện kể") - 0.2, end(77) + 0.4, 0.4, 0.4));
  return S2;
}

// 3 · the street: Spurinna — "the Ides have come" / "come, but not gone"
const S3 = stage("pho-subura");
const caesar3 = cast(S3.scene, CAST.caesarToga);
const seer = cast(S3.scene, CAST.seer);
function seerScene(t) {
  const u = smooth(seg(t, at(78) - 0.3, end(80) + 0.3));
  const push = smooth(seg(t, at(80) - 0.4, end(80) + 0.4));
  look(S3.camera, [lerp(lerp(-0.4, 0.4, u), 1.2, push), lerp(1.85, 1.8, push), lerp(7.6, 4.4, push)], [lerp(lerp(-0.4, 0.4, u), 1.3, push), lerp(1.4, 1.6, push), 0]);
  fx.focus(S3, push);
  fx.grade("tense", 1);
  fx.fog(t, 0.7, { y: 0.8 });
  if (t < at(79)) stand(caesar3, t, -0.8, 0.6, 1, 0);
  else walk(caesar3, t, -0.8, 0.2, 0.6, at(79), at(79) + 1.2);
  stand(seer, t, 1.4, 0.5, -1, 1, { aR1: 1.3 * window01(t, at(80), end(80), 0.3, 0.4), aR2: 0.2 });
  tag(S3.camera, "thầy bói Spurinna", 1.4, 2.5, 0.5, window01(t, cue(78, "Spurinna") - 0.3, end(78) + 0.3, 0.4, 0.4), 38, "#3b2a18");
  ov.caption("“Hãy coi chừng ngày Ides tháng Ba”", [960, 170], window01(t, cue(78, "hãy coi chừng") - 0.3, end(78) + 0.2, 0.35, 0.3), { size: 46 });
  ov.caption("“Ngày Ides đã đến rồi đấy.”", [960, 170], window01(t, at(79) - 0.1, end(79) + 0.2, 0.35, 0.3), { size: 46 });
  ov.caption("“Đến rồi — nhưng chưa qua.”", [960, 170], window01(t, at(80) - 0.1, end(80) + 0.5, 0.35, 0.4), { size: 50 });
  return S3;
}

// 4 · the hall: senators crowd round as if with a petition; daggers out; he falls at the foot of Pompey's statue
const S4 = stage("hoi-truong-pompey");
place(S4.scene, piece("tuong-pompey@base", 1.5, 0.5, 0.98, 0), 3.3, 0, -2.0);
shadowUnder(S4.scene, 3.3, -2.0, 1.4, 0.6);
const caesar4 = cast(S4.scene, CAST.caesarToga);
const ring = ["head4", "head7", "head3", "head6", "head8"].map((h) => cast(S4.scene, CAST.senator(h)));
const daggers = ring.map(() => place(S4.scene, prop("do-vat-ides@base", "dao-gam", 0.1, 0.5, 0.5), 0, 0, 0));
function ides(t) {
  const u = smooth(seg(t, at(81) - 0.3, end(83) + 0.3));
  look(S4.camera, [lerp(-0.6, 0.8, u), 1.85, lerp(8.4, 7.4, u)], [lerp(-0.6, 0.8, u), 1.4, 0]);
  const close = smooth(seg(t, at(82) - 0.2, cue(82, "Rồi những lưỡi dao")));
  const strike = smooth(seg(t, cue(82, "Rồi những lưỡi dao") - 0.2, cue(82, "Rồi những lưỡi dao") + 0.5));
  const fall = easeIn(seg(t, cue(83, "ngã xuống") - 0.4, cue(83, "ngã xuống") + 0.6));
  caesar4.root.position.set(1.4, 0, 0.4);
  caesar4.root.scale.x = 1;
  applyPose(caesar4, pose({ lean: 0.03 + 0.2 * strike, fall: (Math.PI / 2 - 0.1) * fall, aL1: 0.3 + 1.2 * strike, aL2: 0.6 }));
  ring.forEach((f, i) => {
    const x0 = [-3.4, -2.6, 4.6, 5.2, -1.8][i],
      x1 = [0.5, 0.0, 2.3, 2.9, -0.4][i];
    stand(f, t, lerp(x0, x1, close), 0.2 + (i % 3) * 0.35, x1 < 1.4 ? 1 : -1, i, { aR1: lerp(0.3, 2.4, strike), aR2: 0.2, lean: 0.05 + 0.15 * strike });
    daggers[i].visible = strike > 0.05 && t < end(83);
    f.armR.end.updateMatrixWorld(true);
    daggers[i].position.copy(f.armR.end.getWorldPosition(daggers[i].position));
    daggers[i].rotation.z = (x1 < 1.4 ? -1 : 1) * 0.6;
  });
  fx.grade("cold", 1);
  fx.rays(t, 0.4, { from: [-100, -250], angle: 0.9 });
  fx.particles("dust", t, 0.5);
  ov.stamp("15 tháng Ba · 44 TCN", "phiên họp Viện Nguyên lão", window01(t, at(81) - 0.1, end(81) + 0.3, 0.4, 0.4));
  return S4;
}

// 4b · the daggers: a painted close-up in three layers, the camera pushing into the ring
const DAO = { id: "ides-dao", layers: [{ src: "bg.jpg", depth: 0.25 }, { src: "mid.png", depth: 0.6 }, { src: "fg.png", depth: 1.2 }], from: [0.02, -0.07, 0.96], to: [-0.01, -0.04, 1.12] };
function daggersTab(t) {
  const a = cue(82, "Rồi những lưỡi dao") - 0.1;
  fx.tableau(DAO, t, a, at(84) - 0.3, { fadeIn: 0.15, fadeOut: 0.6 });
  fx.grade("blood", 0.8);
  fx.bars(1);
  fx.particles("dust", t, 0.4);
  ov.dim(0.75 * smooth(seg(t, cue(83, "ngã xuống") + 0.3, end(83) + 0.3)));
  ov.caption("23 nhát dao — dưới chân tượng Pompey (Suetonius)", [960, 170], window01(t, at(83) - 0.1, end(83) + 0.4, 0.35, 0.4), { size: 40 });
  return null;
}

// 5 · the last words, three versions — over the dark hall
const TOGA = { id: "ides-toga", layers: [{ src: "bg.jpg", depth: 1 }], from: [-0.02, -0.08, 0.94], to: [0.05, -0.02, 1.08] };
function words(t) {
  fx.tableau(TOGA, t, at(84) - 0.3, 9999, { fadeIn: 1.2 });
  fx.particles("dust", t, 0.6, { n: 40, area: [500, 0, 700, 900] });
  fx.bars(1);
  ov.dim(0.25);
  ov.note("“Et tu, Brute”", "là câu của Shakespeare,\nhơn mười lăm thế kỷ sau", window01(t, at(84) - 0.1, end(84) + 0.3, 0.4, 0.4));
  ov.note("Suetonius", "“Cả con nữa sao, con?” (tiếng Hy Lạp) —\nhoặc ông chẳng nói gì", window01(t, at(85) - 0.1, end(85) + 0.3, 0.4, 0.4));
  ov.note("Plutarch", "ông lặng lẽ kéo vạt áo toga\ntrùm lên đầu", window01(t, at(86) - 0.1, end(86) + 0.6, 0.4, 0.4));
  return null;
}

export const SEGMENTS = [
  { a: 0, b: at(76) - 0.3, run: guards44 },
  { a: at(76) - 0.3, b: at(78) - 0.3, run: plot },
  { a: at(78) - 0.3, b: at(81) - 0.3, run: seerScene },
  { a: at(81) - 0.3, b: cue(82, "Rồi những lưỡi dao") - 0.1, run: ides },
  { a: cue(82, "Rồi những lưỡi dao") - 0.1, b: at(84) - 0.3, run: daggersTab },
  { a: at(84) - 0.3, b: 9999, run: words },
];
export const DIPS = [at(81) - 0.3];
export const TRANSITIONS = [
  { t: at(76) - 0.3, kind: "ink", d: 0.45 },
  { t: at(78) - 0.3, kind: "paper", d: 0.5 },
  { t: cue(82, "Rồi những lưỡi dao") - 0.1, kind: "flash", d: 0.25 },
];
