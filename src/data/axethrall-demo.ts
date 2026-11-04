import type { Piece } from "../engine/types";

/** Reproducible showcase; never writes units or rewards into the live match. */
export const AXETHRALL_DEMO: { left: Piece[]; right: Piece[] } = {
  left: [
    { uid: 101, defId: "axethrall", star: 3, position: 58 },
    { uid: 102, defId: "panda", star: 2, position: 59 },
    { uid: 103, defId: "adept", star: 2, position: 50 },
    { uid: 104, defId: "shark", star: 1, position: 36 },
    { uid: 105, defId: "turtle", star: 2, position: 35 },
    { uid: 106, defId: "deer", star: 1, position: 51 },
  ],
  right: [
    { uid: 201, defId: "guard", star: 2, position: 35 },
    { uid: 202, defId: "lion", star: 2, position: 36 },
    { uid: 203, defId: "infantry", star: 2, position: 58 },
    { uid: 204, defId: "medic", star: 2, position: 50 },
    { uid: 205, defId: "sniper", star: 2, position: 59 },
    { uid: 206, defId: "birdrider", star: 2, position: 51 },
  ],
};
