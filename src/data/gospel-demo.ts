import type { Piece } from "../engine/types";
/** Overlapping unequal-star fields and casting allies; a visual scenario, not a balance trial. */
export const GOSPEL_DEMO: { left: Piece[]; right: Piece[] } = {
  left: [
    { uid: 101, defId: "acolyte", star: 2, position: 59, items: ["aegis"] },
    { uid: 102, defId: "acolyte", star: 1, position: 61 },
    { uid: 103, defId: "titan", star: 2, position: 35 },
    { uid: 104, defId: "ironape", star: 2, position: 37 },
    { uid: 105, defId: "stormcaller", star: 2, position: 51 },
    { uid: 106, defId: "medic", star: 2, position: 52 },
    { uid: 107, defId: "arhat", star: 2, position: 56 },
    { uid: 108, defId: "shark", star: 2, position: 44 },
  ],
  right: [
    { uid: 201, defId: "guard", star: 3, position: 34 },
    { uid: 202, defId: "ironape", star: 2, position: 35 },
    { uid: 203, defId: "cavalry", star: 2, position: 36 },
    { uid: 204, defId: "birdrider", star: 2, position: 58 },
    { uid: 205, defId: "motorcycle", star: 2, position: 59 },
    { uid: 206, defId: "sniper", star: 3, position: 60 },
    { uid: 207, defId: "medic", star: 2, position: 61 },
    { uid: 208, defId: "spider", star: 2, position: 52 },
  ],
};
