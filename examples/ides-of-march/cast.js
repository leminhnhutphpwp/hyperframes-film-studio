// Who is who in the film: kit + heads + face for each recurring person, so every chapter draws them the same way.
// Entry: [kit@colour, heads@colour or null, face or null, scale, options]. This example uses the starter library
// (the example film in examples/ides-of-march); replace it with your film's people.
export const POL = "roman-statesman@purple";
export const CAST = {
  caesarToga: ["roman-senator@purple", POL, "head1", 1.0, { hold: "none" }],
  brutus: ["roman-senator@purple", POL, "head4", 1.0, { hold: "none" }],
  cassius: ["roman-senator@purple", POL, "head7", 1.0, { hold: "none" }],
  senator: (h) => ["roman-senator@purple", POL, h, 1.0, { hold: "none" }],
  citizen: (h) => ["roman-citizen@wool", "roman-republican@wool", h, 1.0, { hold: "none" }],
  lictor: ["roman-lictor@red", null, null, 1.0, {}],
  seer: ["roman-soothsayer@teal", null, null, 0.98, { hold: "staff", len: 1.3 }],
};
