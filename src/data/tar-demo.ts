import type { Piece } from "../engine/types";
/** Mobile carriers and clustered splash victims; demonstrations never grant campaign pieces. */
export const TAR_DEMO: { left: Piece[]; right: Piece[] } = {
  left: [
    { uid: 101, defId: "motorcycle", star: 3, position: 43, items: ["staff"] },
    { uid: 102, defId: "motorcycle", star: 2, position: 53 },
    { uid: 103, defId: "irondog", star: 2, position: 35 },
    { uid: 104, defId: "ironape", star: 2, position: 37 },
    { uid: 105, defId: "repair", star: 2, position: 60 },
    { uid: 106, defId: "birdrider", star: 2, position: 58 },
  ],
  right: [
    { uid: 201, defId: "turtle", star: 3, position: 34 },
    { uid: 202, defId: "guard", star: 3, position: 35 },
    { uid: 203, defId: "guard", star: 3, position: 36 },
    { uid: 204, defId: "medic", star: 2, position: 43 },
    { uid: 205, defId: "sniper", star: 2, position: 51 },
    { uid: 206, defId: "birdrider", star: 2, position: 53 },
  ],
};
