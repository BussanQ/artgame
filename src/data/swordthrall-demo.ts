import type { Piece } from "../engine/types";

export const SWORDTHRALL_DEMO: { left: Piece[]; right: Piece[] } = {
  left: [
    { uid: 101, defId: "swordthrall", star: 2, position: 35 },
    { uid: 102, defId: "pangolin", star: 2, position: 36 },
    { uid: 103, defId: "axethrall", star: 3, position: 58 },
    { uid: 104, defId: "panda", star: 2, position: 59 },
    { uid: 105, defId: "adept", star: 2, position: 50 },
    { uid: 106, defId: "shark", star: 1, position: 34 },
  ],
  right: [
    { uid: 201, defId: "guard", star: 2, position: 35 },
    { uid: 202, defId: "lion", star: 2, position: 36 },
    { uid: 203, defId: "specialist", star: 2, position: 58 },
    { uid: 204, defId: "grenadier", star: 2, position: 51 },
    { uid: 205, defId: "infantry", star: 2, position: 59 },
    { uid: 206, defId: "medic", star: 2, position: 50 },
  ],
};
