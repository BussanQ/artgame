import type { Piece } from "../engine/types";
/** Normal-engine six-on-six skill demonstration; not an equal-budget balance sample. */
export const TERMINATOR_DEMO: { left: Piece[]; right: Piece[] } = {
  left: [
    { uid: 101, defId: "guard", star: 2, position: 35, items: ["plate"] },
    { uid: 102, defId: "guard", star: 2, position: 36 },
    { uid: 103, defId: "titan", star: 2, position: 51, items: ["staff", "crystal"] },
    { uid: 104, defId: "infantry", star: 2, position: 43 },
    { uid: 105, defId: "medic", star: 2, position: 52 },
    { uid: 106, defId: "repair", star: 2, position: 50 },
  ],
  right: [
    { uid: 201, defId: "guard", star: 2, position: 35 },
    { uid: 202, defId: "guard", star: 2, position: 36 },
    { uid: 203, defId: "vine", star: 2, position: 34 },
    { uid: 204, defId: "infantry", star: 2, position: 43 },
    { uid: 205, defId: "cannon", star: 2, position: 44 },
    { uid: 206, defId: "medic", star: 2, position: 51 },
  ],
};
