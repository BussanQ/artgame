import type { Piece } from "../engine/types";

/** Ordinary stars/gear; both sides together respect the shared copy limits. */
export const TAOTIE_DEMO: { left: Piece[]; right: Piece[] } = {
  left: [
    { uid: 101, defId: "guard", star: 3, position: 35, items: ["heart"] },
    { uid: 102, defId: "turtle", star: 2, position: 44, items: ["fortress"] },
    { uid: 103, defId: "treant", star: 2, position: 34, items: ["heart"] },
    { uid: 104, defId: "medic", star: 2, position: 43, items: ["staff"] },
    { uid: 105, defId: "repair", star: 2, position: 51, items: ["staff"] },
    { uid: 106, defId: "acolyte", star: 2, position: 58, items: ["crystal"] },
    {
      uid: 107,
      defId: "skytoad",
      star: 3,
      position: 36,
      items: ["heart", "fortress", "crystal"],
    },
    { uid: 108, defId: "fish", star: 2, position: 52 },
  ],
  right: [
    { uid: 201, defId: "turtle", star: 2, position: 35, items: ["fortress"] },
    { uid: 202, defId: "guard", star: 3, position: 36, items: ["heart"] },
    { uid: 203, defId: "treant", star: 2, position: 34, items: ["heart"] },
    { uid: 204, defId: "medic", star: 2, position: 43, items: ["staff"] },
    { uid: 205, defId: "repair", star: 2, position: 51, items: ["staff"] },
    { uid: 206, defId: "deer", star: 2, position: 58 },
    { uid: 207, defId: "arhat", star: 2, position: 59 },
    { uid: 208, defId: "fish", star: 2, position: 52 },
  ],
};
