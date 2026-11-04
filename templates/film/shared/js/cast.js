// Who is who in the film: kit + head for each recurring person, so every chapter draws them the same way.
// (Example from Caesar part 3 — replace with the new film's people.)
export const POL = "chinh-khach-la-ma@purple";
export const CAST = {
  caesar: ["la-ma-cuoi-cong-hoa-tuong@red", POL, "head1", 1.02, { noShield: true }],
  caesarToga: ["nguyen-lao@purple", POL, "head1", 1.0, { hold: "none" }],
  pompey: ["la-ma-cuoi-cong-hoa-tuong@purple", POL, "head2", 1.04, { noShield: true }],
  labienus: ["la-ma-cuoi-cong-hoa-tuong@red", POL, "head6", 1.0, { noShield: true }],
  cato: ["cong-dan-la-ma@wool", POL, "head8", 1.0, { hold: "none" }],
  brutus: ["nguyen-lao@purple", POL, "head4", 1.0, { hold: "none" }],
  cassius: ["nguyen-lao@purple", POL, "head7", 1.0, { hold: "none" }],
  antony: ["la-ma-cuoi-cong-hoa-tuong@red", POL, "head5", 1.04, { noShield: true, hold: "none" }],
  octavian: ["nguyen-lao@purple", "nguoi-la-ma-cong-hoa@wool", "head4", 0.96, { hold: "none" }],
  senator: (h) => ["nguyen-lao@purple", POL, h, 1.0, { hold: "none" }],
  legionary: ["la-ma-cuoi-cong-hoa-le-duong@red", null, null, 1.0, {}],
  pompeian: ["la-ma-cuoi-cong-hoa-le-duong@purple", null, null, 1.0, {}],
  citizen: (h) => ["cong-dan-la-ma@wool", "nguoi-la-ma-cong-hoa@wool", h, 1.0, { hold: "none" }],
  cleopatra: ["nu-hoang-ai-cap@teal", null, null, 0.96, { hold: "staff", len: 1.1, noShield: true }],
  ptolemy: ["vua-ai-cap@teal", null, null, 0.9, { hold: "staff", len: 1.2, noShield: true }],
  egyptian: ["linh-ai-cap@teal", null, null, 1.0, {}],
  seer: ["thay-boi-la-ma@teal", null, null, 0.98, { hold: "staff", len: 1.3 }],
};
